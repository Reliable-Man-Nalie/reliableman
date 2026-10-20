import { BRAND } from '@/lib/brand'
import { NextResponse } from 'next/server'
import { SITE as LAUNCH } from '@/lib/site'

export const dynamic = 'force-dynamic'

function money(n: unknown): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''))
  return Number.isFinite(v) && v > 0 ? v : 0
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* handled below */ }

  const invoiceId = String(body.invoiceId ?? '').trim()
  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: 'Missing invoice id' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const secret = process.env.STRIPE_SECRET_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: 'Database not configured' }, { status: 500 })
  }
  if (!secret) {

    return NextResponse.json({ ok: false, error: 'Card payments are not enabled yet' }, { status: 503 })
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const { data: inv } = await sb.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
    if (!inv) return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 })

    if (inv.status === 'paid' || inv.paid_at) {
      return NextResponse.json({ ok: false, error: 'This invoice is already paid' }, { status: 409 })
    }

    const lineItems: Array<Record<string, unknown>> = Array.isArray(inv.line_items) ? inv.line_items : []

    const signed = (n: unknown) => {
      const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''))
      return Number.isFinite(v) ? v : 0
    }
    const subtotal = lineItems.reduce((n, li) => n + money(li.quantity ?? 1) * signed(li.price), 0)
    const total = subtotal + money(inv.taxes)
    const due = Math.max(0, total - money(inv.amount_paid))
    if (due <= 0) {
      return NextResponse.json({ ok: false, error: 'Nothing outstanding on this invoice' }, { status: 409 })
    }

    const currency = String(inv.currency || 'USD').toLowerCase()
    const number = String(inv.number || invoiceId)

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(secret)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: `Invoice ${number}`,
            description: String(inv.project_title || BRAND.name).slice(0, 200),
          },

          unit_amount: Math.round(due * 100),
        },
        quantity: 1,
      }],
      success_url: `${LAUNCH.siteUrl}/invoice/${invoiceId}?paid=1`,
      cancel_url: `${LAUNCH.siteUrl}/invoice/${invoiceId}?payment=cancelled`,
      customer_email: String(inv.client_email || '') || undefined,

      metadata: { kind: 'invoice', invoiceId, invoiceNumber: number },
    })

    return NextResponse.json({ ok: true, url: session.url })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Could not start payment' },
      { status: 500 },
    )
  }
}
