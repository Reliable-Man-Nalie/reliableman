import type { SupabaseClient } from '@supabase/supabase-js'

export type PaymentSource = 'invoice' | 'event' | 'program' | 'subscription' | 'link' | 'other'
export type PaymentMethod = 'card' | 'bank' | 'free'
export type PaymentStatus = 'paid' | 'refunded' | 'partly-refunded' | 'failed'

export interface PaymentRow {
  id: string
  at: string               // ISO
  amount: number           // in currency units, what was charged
  refunded: number         // in currency units
  currency: string         // upper case
  status: PaymentStatus
  method: PaymentMethod
  methodDetail: string     // "Visa •••• 4242", "Bank transfer", "Marked paid by hand"
  source: PaymentSource
  what: string             // "Invoice #2026150", "Group Coaching Kickoff"
  name: string
  email: string
  code: string             // the confirmation code to quote
  stripeUrl?: string       // Open in Stripe
  receiptUrl?: string      // Stripe's own receipt page
  linkUrl?: string         // where it lives in /os
}

export interface PaymentsFeed {
  ok: true
  rows: PaymentRow[]
  stripe: 'ok' | 'not-connected' | 'error'
  stripeError?: string
  database: 'ok' | 'not-connected' | 'error'
}

const STRIPE_LIMIT = 500

type Meta = Record<string, string>

interface StripeCharge {
  id: string; amount: number; amount_refunded: number; currency: string; created: number
  status: string; paid: boolean; refunded: boolean; livemode: boolean
  payment_intent: string | null; invoice?: string | null
  metadata: Meta; description: string | null; receipt_url: string | null
  billing_details?: { name?: string | null; email?: string | null }
  receipt_email?: string | null
  payment_method_details?: { type?: string; card?: { brand?: string; last4?: string } } | null
}

interface StripeSession {
  id: string; payment_intent: string | null; metadata: Meta | null; mode: string
  customer_details?: { name?: string | null; email?: string | null } | null
  payment_link?: string | null
}

function dashboard(id: string, live: boolean) {
  return `https://dashboard.stripe.com/${live ? '' : 'test/'}payments/${id}`
}

function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s }

async function readStripe(): Promise<{ charges: StripeCharge[]; sessions: Map<string, StripeSession> } | { error: string } | null> {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return null
  try {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(secret)
    const charges: StripeCharge[] = []
    for await (const c of stripe.charges.list({ limit: 100 })) {
      charges.push(c as unknown as StripeCharge)
      if (charges.length >= STRIPE_LIMIT) break
    }

    const sessions = new Map<string, StripeSession>()
    const oldest = charges.length ? charges[charges.length - 1].created - 86400 : 0
    let n = 0
    for await (const s of stripe.checkout.sessions.list({ limit: 100, status: 'complete', created: { gte: oldest } })) {
      const ss = s as unknown as StripeSession
      if (ss.payment_intent) sessions.set(ss.payment_intent, ss)
      if (++n >= STRIPE_LIMIT) break
    }
    return { charges, sessions }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Stripe could not be read.' }
  }
}

interface InvoiceRow {
  id: string; number: string; client_name: string | null; client_email: string | null; client_company: string | null
  project_title: string | null; line_items: { quantity?: number; price?: number }[] | null
  taxes: number | null; tax_rate: number | null; amount_paid: number | null; currency: string | null
  status: string; paid_at: string | null; created_at: string | null; deleted_at: string | null
}
interface SeatRow {
  id: string; name: string | null; email: string | null; event_id: string; event_title: string | null
  ticket_code: string | null; paid_at: string | null; paid_amount: number | null
  payment_method: string | null; payment_ref: Record<string, unknown> | null; registered_at: string | null
}

function invoiceTotal(i: InvoiceRow): number {
  if (typeof i.amount_paid === 'number' && i.amount_paid > 0) return i.amount_paid
  const sub = (i.line_items || []).reduce((s, l) => s + (Number(l.quantity) || 1) * (Number(l.price) || 0), 0)
  const tax = typeof i.taxes === 'number' ? i.taxes : i.tax_rate ? sub * (i.tax_rate / 100) : 0
  return Math.round((sub + tax) * 100) / 100
}

export async function buildPaymentsFeed(db: SupabaseClient | null): Promise<PaymentsFeed> {
  const [stripeRes, invRes, seatRes, evRes] = await Promise.all([
    readStripe(),
    db ? db.from('invoices').select('id, number, client_name, client_email, client_company, project_title, line_items, taxes, tax_rate, amount_paid, currency, status, paid_at, created_at, deleted_at').eq('status', 'paid') : null,
    db ? db.from('event_attendees').select('id, name, email, event_id, event_title, ticket_code, paid_at, paid_amount, payment_method, payment_ref, registered_at').eq('paid', true) : null,
    db ? db.from('events').select('id, title, currency') : null,
  ])

  const invoices = ((invRes && !invRes.error ? invRes.data : []) || []) as InvoiceRow[]
  const seats = ((seatRes && !seatRes.error ? seatRes.data : []) || []) as SeatRow[]
  const events = new Map<string, { title: string; currency: string }>()
  for (const e of ((evRes && !evRes.error ? evRes.data : []) || []) as { id: string; title: string; currency: string | null }[]) {
    events.set(e.id, { title: e.title, currency: (e.currency || 'USD').toUpperCase() })
  }
  const invoiceById = new Map(invoices.map(i => [i.id, i]))
  const seatByTicket = new Map(seats.filter(s => s.ticket_code).map(s => [String(s.ticket_code), s]))

  const rows: PaymentRow[] = []
  const coveredInvoices = new Set<string>()
  const coveredPIs = new Set<string>()

  let stripe: PaymentsFeed['stripe'] = 'not-connected'
  let stripeError: string | undefined
  if (stripeRes && 'error' in stripeRes) { stripe = 'error'; stripeError = stripeRes.error }
  else if (stripeRes) {
    stripe = 'ok'
    for (const c of stripeRes.charges) {
      const session = c.payment_intent ? stripeRes.sessions.get(c.payment_intent) : undefined
      const meta: Meta = { ...(c.metadata || {}), ...(session?.metadata || {}) }
      const kind = meta.kind || ''
      const name = session?.customer_details?.name || c.billing_details?.name || ''
      const email = session?.customer_details?.email || c.billing_details?.email || c.receipt_email || ''
      let source: PaymentSource = 'other'
      let what = c.description || 'Card payment'
      let linkUrl: string | undefined

      if (kind === 'invoice' && meta.invoiceId) {
        source = 'invoice'
        coveredInvoices.add(meta.invoiceId)
        const inv = invoiceById.get(meta.invoiceId)
        what = `Invoice #${meta.invoiceNumber || inv?.number || ''}`.trim()
        if (inv?.project_title) what += ` · ${inv.project_title}`
        linkUrl = `/os/invoices/${meta.invoiceId}`
      } else if (kind === 'event-ticket') {
        source = 'event'
        const seat = meta.ticketCode ? seatByTicket.get(meta.ticketCode) : undefined
        what = events.get(meta.eventId)?.title || seat?.event_title || 'Event ticket'
        if (meta.eventId) linkUrl = `/os/events/${meta.eventId}?tab=attendees`
      } else if (kind === 'circle-first-month') {
        source = 'program'; what = meta.program || 'Circle, first month'
      } else if (meta.upsellForSession) {
        source = 'program'; what = 'Add-on after checkout'
      } else if (meta.tierId || meta.program) {
        source = session?.mode === 'subscription' ? 'subscription' : 'program'
        what = meta.program || meta.tierId
      } else if (c.invoice) {
        source = 'subscription'; what = c.description || 'Subscription payment'
      } else if (session?.payment_link || meta.created_from === 'os-payment-links') {
        source = 'link'; what = c.description || 'Payment link'
      }

      if (session) {
        const str = `STR-${session.id.slice(-8).toUpperCase()}`
        for (const i of invoices) if (i.number === str) coveredInvoices.add(i.id)
      }
      if (c.payment_intent) coveredPIs.add(c.payment_intent)

      const card = c.payment_method_details?.card
      const methodDetail = card?.last4 ? `${cap(card.brand || 'Card')} •••• ${card.last4}` : cap(c.payment_method_details?.type || 'card')
      const status: PaymentStatus = c.status === 'failed' || (!c.paid && c.status !== 'pending') ? 'failed'
        : c.refunded ? 'refunded' : c.amount_refunded > 0 ? 'partly-refunded' : 'paid'
      const ref = c.payment_intent || c.id
      rows.push({
        id: c.id, at: new Date(c.created * 1000).toISOString(),
        amount: c.amount / 100, refunded: c.amount_refunded / 100, currency: c.currency.toUpperCase(),
        status, method: 'card', methodDetail, source, what, name, email,
        code: ref, stripeUrl: dashboard(ref, c.livemode), receiptUrl: c.receipt_url || undefined, linkUrl,
      })
    }
  }

  for (const i of invoices) {
    if (i.deleted_at || coveredInvoices.has(i.id)) continue

    const fromStripe = i.number?.startsWith('STR-')
    if (fromStripe && stripe === 'ok') continue
    rows.push({
      id: `inv-${i.id}`, at: i.paid_at || i.created_at || new Date(0).toISOString(),
      amount: invoiceTotal(i), refunded: 0, currency: (i.currency || 'USD').toUpperCase(),
      status: 'paid', method: fromStripe ? 'card' : 'bank',
      methodDetail: fromStripe ? 'Card (Stripe)' : 'Recorded paid in invoices',
      source: fromStripe ? 'program' : 'invoice',
      what: fromStripe ? (i.project_title || 'Online program') : `Invoice #${i.number}${i.project_title ? ` · ${i.project_title}` : ''}`,
      name: i.client_company ? `${i.client_name || ''}${i.client_name ? ', ' : ''}${i.client_company}` : (i.client_name || ''),
      email: i.client_email || '',
      code: fromStripe ? i.number : `#${i.number}`,
      linkUrl: `/os/invoices/${i.id}`,
    })
  }

  for (const s of seats) {
    const ref = (s.payment_ref || {}) as Record<string, unknown>
    const pi = typeof ref.paymentIntent === 'string' ? ref.paymentIntent : ''
    const isCard = s.payment_method === 'card' || ref.via === 'card'
    if (isCard && (stripe === 'ok' && (!pi || coveredPIs.has(pi)))) continue
    const amount = Number(s.paid_amount) || 0
    const ev = events.get(s.event_id)
    const free = s.payment_method === 'referral' || ref.via === 'referral' || amount === 0
    const via = String(ref.via || '')
    rows.push({
      id: `seat-${s.id}`, at: s.paid_at || s.registered_at || new Date(0).toISOString(),
      amount, refunded: 0,
      currency: (typeof ref.currency === 'string' ? ref.currency : ev?.currency || 'USD').toUpperCase(),
      status: 'paid',
      method: free ? 'free' : isCard ? 'card' : 'bank',
      methodDetail: free ? 'Free seat (invited friends)'
        : isCard ? 'Card (Stripe)'
        : via === 'bank-auto' ? 'Bank transfer · proof matched by Assistant'
        : via === 'bank-manual' ? 'Bank transfer · marked paid by hand'
        : 'Bank transfer',
      source: 'event', what: ev?.title || s.event_title || 'Event ticket',
      name: s.name || '', email: s.email || '',
      code: pi || s.ticket_code || '',
      stripeUrl: pi ? dashboard(pi, ref.livemode !== false) : undefined,
      linkUrl: `/os/events/${s.event_id}?tab=attendees`,
    })
  }

  rows.sort((a, b) => b.at.localeCompare(a.at))
  const database: PaymentsFeed['database'] = !db ? 'not-connected'
    : (invRes?.error || seatRes?.error) ? 'error' : 'ok'
  return { ok: true, rows, stripe, stripeError, database }
}
