import { BRAND } from '@/lib/brand'
import { readPlusOne, plusOneMarker } from '@/lib/event-plus-one'
import { buildRegistrantConfirmation, isPaidEvent } from '@/lib/event-confirmation'
import { NextRequest, NextResponse, after } from 'next/server'
import { sendCapiEvent, registrationEventId } from '@/lib/meta-capi'
import { createClient } from '@supabase/supabase-js'
import { recordFunnelLead } from '@/lib/funnel-log'
import { detectSpam, SPAM_REJECTION } from '@/lib/anti-spam'
import { fromFor, EMAIL_REPLY_TO } from '@/lib/email'

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function sendEmail(to: string, subject: string, html: string) {

  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[event-register] RESEND_API_KEY not set, no email sent to', to)
    return Promise.resolve()
  }
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromFor(to),
      to: [to],
      reply_to: EMAIL_REPLY_TO,
      subject,
      html,
    }),
  }).then(async res => {
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[event-register] Resend refused ${res.status} to ${to}: ${body.slice(0, 300)}`)
    }
    return res
  }).catch(err => {
    console.error('[event-register] send threw', err)
  })
}

function reportRegistration(req: NextRequest, e: { ticketCode: string; email: string; name: string; phone: string; title: string; slug?: string }) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  const origin = req.headers.get('origin') || `${BRAND.website}`
  after(() => sendCapiEvent({
    eventName: 'CompleteRegistration',
    eventId: registrationEventId(e.ticketCode),
    email: e.email, name: e.name, phone: e.phone,
    ip, userAgent: req.headers.get('user-agent') || '',
    fbp: req.cookies.get('_fbp')?.value, fbc: req.cookies.get('_fbc')?.value,
    pageUrl: req.headers.get('referer') || (e.slug ? `${origin}/events/${e.slug}` : undefined),
    customData: { content_name: e.title, content_category: 'event', currency: 'USD', value: 0, status: true },
  }))
}

export async function POST(req: NextRequest) {
  try {

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const body = await req.json()

    if (detectSpam(body).spam) {
      return NextResponse.json(SPAM_REJECTION.body, { status: SPAM_REJECTION.status })
    }

    const { eventId, name, email, phone = '', company = '', notes = '' } = body

    const hasBusiness = body.hasBusiness === true
    const businessDoes = typeof body.businessDoes === 'string' ? body.businessDoes.trim() : ''
    const website = typeof body.website === 'string' ? body.website.trim() : ''
    const instagram = typeof body.instagram === 'string' ? body.instagram.trim() : ''

    const plusOne = typeof email === 'string' ? readPlusOne(body.plusOne, email) : null

    if (!eventId || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: liveEvent, error: eventErr } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: any = liveEvent
    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (event.status !== 'published') {
      return NextResponse.json({ error: 'Registration is closed' }, { status: 400 })
    }

    const paidEvent = isPaidEvent(event)

    let waitlisted = false
    if (Number(event.capacity) > 0) {
      let seats = supabase
        .from('event_attendees')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'registered')

      if (paidEvent) seats = seats.eq('paid', true)
      const { count } = await seats
      if ((count ?? 0) >= Number(event.capacity)) {
        waitlisted = true
        console.warn(`[event-register] ${eventId} is at capacity ${event.capacity}, waitlisting ${email}`)
      }
    }

    const { data: existing } = await supabase
      .from('event_attendees')
      .select('id, paid, ticket_code, notes')
      .eq('event_id', eventId)
      .eq('email', email)
      .maybeSingle()

    function newTicketCode() {
      return 'TKT-' + Array.from({ length: 6 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('')
    }
    async function addPlusOne(hostTicket: string, status: string): Promise<{ ticketCode?: string; note?: string }> {
      if (!plusOne) return {}
      const marker = plusOneMarker(hostTicket)
      const { data: already } = await supabase.from('event_attendees')
        .select('id, ticket_code, notes, email').eq('event_id', eventId)
      const rows = already ?? []
      const theirs = rows.find(r => String(r.notes || '').includes(marker))
      if (theirs) return { ticketCode: String(theirs.ticket_code || '') }
      if (rows.some(r => String(r.email || '').toLowerCase() === plusOne.email)) {
        return { note: `${plusOne.name} is already registered for this event with that email.` }
      }
      const code = newTicketCode()
      const guestRow: Record<string, unknown> = {
        id: uid(), event_id: eventId, event_title: event.title,
        name: plusOne.name, email: plusOne.email, phone: '', company: '',
        status, paid: false, paid_at: null, paid_amount: 0,
        checked_in: false, checked_in_at: null, ticket_code: code, source: 'website',
        notes: `${marker} Plus one of ${name} (${email})`,
        registered_at: new Date().toISOString(),
      }
      const g = await supabase.from('event_attendees').insert(guestRow)
      if (g.error) {
        console.error('[event-register] plus one insert failed', g.error.message)
        return { note: `We could not add ${plusOne.name}. Please register them separately.` }
      }

      if (!paidEvent) {
        const c = buildRegistrantConfirmation(event, { name: plusOne.name, ticketCode: code, notes: '' })
        void sendEmail(plusOne.email, c.subject, c.html)
      }

      try {
        const { data: lead } = await supabase.from('leads').select('id').eq('email', plusOne.email).maybeSingle()
        if (!lead) {
          const at = new Date().toISOString()
          await supabase.from('leads').insert({
            id: uid(), name: plusOne.name, email: plusOne.email, phone: '', company: null,
            source: `Event: ${event.title}`, status: 'new', tags: ['event-attendee', 'plus-one'],
            notes: `Plus one of ${name} at ${event.title}`, created_at: at, updated_at: at,
          })
        }
      } catch (err) { console.error('[event-register] plus one contact failed', err) }
      return { ticketCode: code }
    }

    if (existing && paidEvent && !existing.paid && existing.ticket_code) {
      const guest = await addPlusOne(existing.ticket_code, 'registered')
      reportRegistration(req, { ticketCode: existing.ticket_code, email, name, phone, title: String(event.title), slug: event.slug })
      return NextResponse.json({ success: true, attendeeId: existing.id, ticketCode: existing.ticket_code, resumed: true, ...(guest.ticketCode ? { guestTicketCode: guest.ticketCode } : {}), ...(guest.note ? { guestNote: guest.note } : {}) })
    }

    if (existing) {
      return NextResponse.json({ error: 'You are already registered for this event' }, { status: 400 })
    }

    const attendeeId = uid()
    const now = new Date().toISOString()
    const ticketCode = newTicketCode()

    const row: Record<string, unknown> = {
      id: attendeeId,
      event_id: eventId,
      event_title: event.title,
      name, email, phone, company,

      status: waitlisted ? 'waitlisted' : 'registered',
      paid: false,
      paid_at: null,
      paid_amount: 0,
      checked_in: false,
      checked_in_at: null,
      ticket_code: ticketCode,
      source: 'website',
      notes,
      registered_at: now,
    }
    const ins = await supabase.from('event_attendees').insert(row)
    if (ins.error) console.error('[event-register] insert failed', ins.error.message)
    const guest = ins.error ? {} : await addPlusOne(ticketCode, waitlisted ? 'waitlisted' : 'registered')

    if (event.slug) {
      await recordFunnelLead({
        funnelId: `event:${event.slug}`,
        visitorId: typeof body.visitorId === 'string' ? body.visitorId : null,
        path: `/events/${event.slug}`,
        referrer: req.headers.get('referer'),
      })
    }

    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, tags, notes')
      .eq('email', email)
      .maybeSingle()

    const contactTags = ['event-attendee', hasBusiness ? 'has-business' : 'starting-out']

    if (!existingLead) {
      await supabase.from('leads').insert({
        id: uid(),
        name, email, phone,
        company: company || businessDoes || null,
        source: `Event: ${event.title}`,
        status: 'new',
        tags: contactTags,
        notes: `Registered for event: ${event.title}`,
        created_at: now,
        updated_at: now,
      })
    } else {
      const tags: string[] = existingLead.tags ?? []
      for (const t of contactTags) if (!tags.includes(t)) tags.push(t)
      await supabase.from('leads').update({
        tags,
        notes: (existingLead.notes ? existingLead.notes + '\n' : '') + `Registered for event: ${event.title}`,
        updated_at: now,
      }).eq('id', existingLead.id)
    }

    if (hasBusiness) {
      try {
        const { data: existingDeal } = await supabase
          .from('deals').select('id').eq('client_email', email).limit(1)
        if (!existingDeal || existingDeal.length === 0) {
          await supabase.from('deals').insert({
            id: uid(),
            client_name: name,
            client_email: email,
            client_company: company || businessDoes || null,
            client_phone: phone || null,
            client_website: website || null,
            instagram: instagram || null,
            stage: 'lead',
            value: 0,
            currency: 'USD',
            service: `Event: ${event.title}`,
            notes: [
              `Registered for: ${event.title}`,
              businessDoes ? `Business: ${businessDoes}` : null,
              website ? `Website: ${website}` : null,
              instagram ? `Instagram: ${instagram}` : null,
              notes || null,
            ].filter(Boolean).join('\n'),
            tags: ['Event', 'Has business'],
            next_step: `Follow up after ${event.title}`,
            next_step_date: String(event.date || '').slice(0, 10) || null,
            created_at: now,
            updated_at: now,
          })
        }
      } catch (err) {

        console.error('[event-register] could not create deal', err)
      }
    }

    if (!paidEvent) {
      const confirmation = buildRegistrantConfirmation(event, { name, ticketCode, notes })
      void sendEmail(email, confirmation.subject, confirmation.html)
    }

    reportRegistration(req, { ticketCode, email, name, phone, title: String(event.title), slug: event.slug })
    return NextResponse.json({ success: true, attendeeId, ticketCode, ...(guest.ticketCode ? { guestTicketCode: guest.ticketCode } : {}), ...(guest.note ? { guestNote: guest.note } : {}) })
  } catch (err) {
    console.error('Event register error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
