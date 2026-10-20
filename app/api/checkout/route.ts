import { plusOneMarker, MAX_PLUS_ONES } from '@/lib/event-plus-one'
import { NextRequest, NextResponse } from 'next/server'
import { getTierServer } from '@/lib/offer-tiers'
import { createClient } from '@supabase/supabase-js'
import { getEventTicket, isTicketOpen } from '@/lib/event-tickets'
import { SITE as LAUNCH } from '@/lib/site'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Stripe is not configured yet.' }, { status: 503 })
  }

  const body = (await req.json().catch(() => ({}))) as { tierId?: string; priceId?: string; mode?: string; email?: string; embedded?: boolean; eventTicket?: { eventId?: string; ticketCode?: string; ticketTierId?: string } }
  const embedded = body.embedded === true

  if (body.eventTicket?.eventId) {
    const eventId = String(body.eventTicket.eventId)
    const ticketCode = String(body.eventTicket.ticketCode ?? '').slice(0, 24)
    let ev: { id: string; slug: string; title: string; price: number; currency?: string } | null = null
    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data } = await supabase.from('events').select('id, slug, title, price, currency').eq('id', eventId).single()
      if (data) ev = data
    } catch { /* no database: handled below */ }
    if (!ev) return NextResponse.json({ ok: false, error: 'Event not found.' }, { status: 404 })

    let ticketLabel = 'live session ticket'
    let amount = Number(ev.price)
    const tierIdRaw = String(body.eventTicket.ticketTierId ?? '').slice(0, 16)
    if (tierIdRaw) {
      const t = getEventTicket(ev.id, tierIdRaw)
      if (!t) {
        return NextResponse.json({ ok: false, error: 'Unknown ticket type.' }, { status: 400 })
      }
      if (!isTicketOpen(t)) {
        return NextResponse.json({ ok: false, error: `${t.name} tickets have closed.` }, { status: 409 })
      }
      amount = t.price
      ticketLabel = `${t.name} ticket`
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'This event is free, no payment needed.' }, { status: 400 })
    }

    let guestTickets: string[] = []
    let hostPaid = false
    if (ticketCode) {
      try {
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        const { data: guests } = await sb.from('event_attendees').select('ticket_code')
          .eq('event_id', ev.id).eq('paid', false).ilike('notes', `%${plusOneMarker(ticketCode)}%`)
        guestTickets = (guests ?? []).map(g => String(g.ticket_code || '')).filter(Boolean).slice(0, MAX_PLUS_ONES)
      } catch (e) {
        console.error('[checkout] plus-one lookup failed', e)
      }
    }
    const paidUrl = `${LAUNCH.siteUrl}/events/${ev.slug}/thank-you?t=${encodeURIComponent(ticketCode)}&paid=1`
    if (ticketCode) {
      try {
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        const { data: seat } = await sb.from('event_attendees').select('paid').eq('ticket_code', ticketCode).eq('event_id', ev.id).maybeSingle()

        if (seat?.paid) {
          if (!guestTickets.length) return NextResponse.json({ ok: true, url: paidUrl, free: true })
          hostPaid = true
        }
      } catch (e) {
        console.error('[checkout] paid-seat check failed', e)
      }
    }
    const cents = Math.round(amount * 100)
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(secret)
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',

        allow_promotion_codes: true,
        line_items: [
          ...(hostPaid ? [] : [{
            price_data: {
              currency: (ev.currency || 'USD').toLowerCase(),
              product_data: { name: `${ev.title}, ${ticketLabel}` },
              unit_amount: cents,
            },
            quantity: 1,
          }]),
          ...(guestTickets.length ? [{
            price_data: {
              currency: (ev.currency || 'USD').toLowerCase(),
              product_data: { name: `${ev.title}, plus one ${ticketLabel}` },
              unit_amount: Math.round(amount * 100),
            },
            quantity: guestTickets.length,
          }] : []),
        ],

        success_url: `${LAUNCH.siteUrl}/events/${ev.slug}/thank-you?t=${encodeURIComponent(ticketCode)}&paid=1`,
        cancel_url: `${LAUNCH.siteUrl}/events/${ev.slug}?payment=cancelled`,
        customer_email: body.email || undefined,
        metadata: { kind: 'event-ticket', eventId: ev.id, ticketCode, ticketTier: tierIdRaw || 'general', guestTickets: guestTickets.join(','), guestUnit: guestTickets.length ? String(amount) : '' },
      })
      return NextResponse.json({ ok: true, url: session.url })
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Checkout failed' }, { status: 500 })
    }
  }

  let priceId = body.priceId
  let mode: 'payment' | 'subscription' = body.mode === 'subscription' ? 'subscription' : 'payment'
  let program = ''
  let programId = ''
  let saveCard = false

  if (body.tierId) {
    const tier = await getTierServer(body.tierId)
    if (!tier.stripePriceId) {
      return NextResponse.json({ ok: false, error: 'This offer has no Stripe price set.' }, { status: 400 })
    }
    priceId = tier.stripePriceId
    mode = tier.stripeMode === 'subscription' ? 'subscription' : 'payment'
    program = tier.name
    programId = tier.programId ?? ''

    if (mode === 'payment' && tier.bumpPriceId) saveCard = true
  }

  if (!priceId) return NextResponse.json({ ok: false, error: 'Missing price.' }, { status: 400 })

  const metadata = { tierId: body.tierId ?? '', program, programId }

  try {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(secret)

    const upsellSetup = saveCard
      ? { customer_creation: 'always' as const, payment_intent_data: { setup_future_usage: 'off_session' as const } }
      : {}

    if (embedded) {
      const session = await stripe.checkout.sessions.create({

        ui_mode: 'embedded_page',
        mode,
        line_items: [{ price: priceId, quantity: 1 }],
        ...upsellSetup,

        return_url: `${LAUNCH.siteUrl}/purchase-complete?session_id={CHECKOUT_SESSION_ID}`,
        allow_promotion_codes: true,
        customer_email: body.email || undefined,
        metadata,
        ...(mode === 'subscription' ? { subscription_data: { metadata } } : {}),
      })
      return NextResponse.json({ ok: true, clientSecret: session.client_secret })
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      ...upsellSetup,

      success_url: `${LAUNCH.siteUrl}/purchase-complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${LAUNCH.siteUrl}/?checkout=cancelled`,
      allow_promotion_codes: true,
      customer_email: body.email || undefined,
      metadata,
      ...(mode === 'subscription' ? { subscription_data: { metadata } } : {}),
    })

    return NextResponse.json({ ok: true, url: session.url })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Checkout failed' }, { status: 500 })
  }
}
