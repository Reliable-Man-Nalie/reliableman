import type { Deal, Lead, Proposal, Invoice, ActivityEntry } from './crm-types'
import type { EventAttendee } from './event-types'

export type HistoryKind =
  | 'lead'        // entered the system
  | 'stage'       // moved in the pipeline
  | 'activity'    // a logged interaction: call, message, email, note
  | 'proposal'    // an offer was made
  | 'signed'      // an offer was accepted
  | 'invoice'     // money was asked for
  | 'paid'        // money arrived
  | 'won'
  | 'lost'
  | 'event'       // registered for an event
  | 'checkin'     // showed up and was checked in

export interface HistoryEvent {
  id: string
  at: string                 // ISO
  kind: HistoryKind
  title: string
  detail?: string
  amount?: number
  currency?: string
  href?: string              // where to go to see the whole thing
}

export type PersonStatus = 'lead' | 'client' | 'past-client' | 'contact'

export interface PersonRecord {
  email: string
  name: string
  company?: string
  status: PersonStatus
  openDeal?: Deal
  events: HistoryEvent[]
  totalBilled: number        // sum of invoices raised, in their own currencies
  totalPaid: number
  firstSeen?: string
  lastTouch?: string
}

const key = (e?: string) => (e ?? '').trim().toLowerCase()

export function invoiceTotal(inv: Invoice): number {
  const sub = (inv.lineItems ?? []).reduce((n, li) => n + (li.quantity ?? 1) * (li.price ?? 0), 0)
  return sub + (inv.taxes ?? 0)
}

const CLOSED_STAGES = ['signed', 'active', 'completed', 'lost']
export function isOpenDeal(d: Deal): boolean {
  return !CLOSED_STAGES.includes(d.stage ?? '')
}

export function buildPersonHistory(
  email: string,
  src: { deals?: Deal[]; leads?: Lead[]; proposals?: Proposal[]; invoices?: Invoice[]; attendees?: EventAttendee[] },
): PersonRecord {
  const k = key(email)
  const deals = (src.deals ?? []).filter(d => key(d.clientEmail) === k)
  const leads = (src.leads ?? []).filter(l => key(l.email) === k)
  const proposals = (src.proposals ?? []).filter(p => key(p.clientEmail) === k)
  const invoices = (src.invoices ?? []).filter(i => key(i.clientEmail) === k)
  const attendees = (src.attendees ?? []).filter(a => key(a.email) === k)

  const events: HistoryEvent[] = []
  const push = (e: HistoryEvent | null) => { if (e && e.at) events.push(e) }

  for (const l of leads) {
    push({ id: `lead-${l.id}`, at: l.createdAt, kind: 'lead',
      title: 'Entered the system', detail: l.source ? `via ${l.source}` : undefined })
  }

  for (const d of deals) {
    push({ id: `deal-${d.id}`, at: d.createdAt, kind: 'lead',
      title: 'Added to the pipeline', detail: d.service || d.stage, href: `/os/deals/${d.id}` })

    if (!isOpenDeal(d)) {
      const won = d.stage !== 'lost'
      push({ id: `close-${d.id}`, at: d.updatedAt ?? d.createdAt, kind: won ? 'won' : 'lost',
        title: won ? 'Deal won' : 'Deal closed without a sale',
        detail: d.service, amount: won ? d.value : undefined, href: `/os/deals/${d.id}` })
    }

    for (const a of (d.activity ?? []) as ActivityEntry[]) {
      push({ id: `act-${d.id}-${a.id}`, at: a.ts ?? d.createdAt, kind: 'activity',
        title: a.type ? String(a.type).charAt(0).toUpperCase() + String(a.type).slice(1) : 'Interaction',
        detail: a.text, href: `/os/deals/${d.id}` })
    }
  }

  for (const p of proposals) {
    push({ id: `prop-${p.id}`, at: p.sentAt ?? p.createdAt, kind: 'proposal',
      title: p.sentAt ? 'Offer sent' : 'Offer drafted', detail: p.title,
      amount: p.total, currency: p.currency, href: `/os/proposals` })
    if (p.signedAt) {
      push({ id: `sign-${p.id}`, at: p.signedAt, kind: 'signed',
        title: 'Offer signed', detail: p.title, amount: p.total, currency: p.currency, href: `/os/proposals` })
    }
  }

  for (const inv of invoices) {
    if (inv.status !== 'draft') {
      push({ id: `inv-${inv.id}`, at: inv.sentAt ?? inv.issueDate ?? inv.createdAt, kind: 'invoice',
        title: inv.recurring ? 'Recurring invoice raised' : 'Invoice sent',
        detail: inv.projectTitle || inv.number, amount: invoiceTotal(inv), currency: inv.currency,
        href: `/os/invoices` })
    }
    if (inv.paidAt) {
      push({ id: `paid-${inv.id}`, at: inv.paidAt, kind: 'paid', title: 'Payment received',
        detail: inv.projectTitle || inv.number, amount: invoiceTotal(inv), currency: inv.currency,
        href: `/os/invoices` })
    }
  }

  for (const a of attendees) {
    push({ id: `evt-${a.id}`, at: a.registeredAt, kind: 'event',
      title: `Registered for ${a.eventTitle || 'an event'}`,
      detail: a.paid ? 'Paid ticket' : undefined, href: `/os/events/${a.eventId}` })
    if (a.checkedIn) {
      push({ id: `evt-in-${a.id}`, at: a.checkedInAt || a.registeredAt, kind: 'checkin',
        title: `Attended ${a.eventTitle || 'the event'}`, href: `/os/events/${a.eventId}` })
    }
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  const openDeal = deals.find(isOpenDeal)
  const paidInvoices = invoices.filter(i => i.status === 'paid' || i.paidAt)
  const hasPaid = paidInvoices.length > 0 || proposals.some(p => p.status === 'signed')

  const status: PersonStatus =
    hasPaid && openDeal ? 'client'
    : hasPaid ? (invoices.some(i => i.recurring && i.status !== 'draft') ? 'client' : 'past-client')
    : openDeal ? 'lead'
    : 'contact'

  const first = [...events].reverse()[0]
  const baseCreatedAt = deals[0]?.createdAt ?? leads[0]?.createdAt ?? attendees[0]?.registeredAt

  return {
    email,
    name: deals[0]?.clientName ?? leads[0]?.name ?? proposals[0]?.clientName ?? invoices[0]?.clientName ?? attendees[0]?.name ?? email,
    company: deals[0]?.clientCompany ?? leads[0]?.company ?? proposals[0]?.clientCompany ?? attendees[0]?.company,
    status,
    openDeal,
    events,
    totalBilled: invoices.filter(i => i.status !== 'draft').reduce((n, i) => n + invoiceTotal(i), 0),
    totalPaid: paidInvoices.reduce((n, i) => n + invoiceTotal(i), 0),
    firstSeen: first?.at ?? baseCreatedAt,
    lastTouch: events[0]?.at,
  }
}

export type ContactState =
  | 'hot' | 'warm' | 'cold'          // lead
  | 'active' | 'paused' | 'upsell'   // client
  | 'reengage' | 'lost'              // past client
  | 'new'                            // contact, nothing decided yet

export interface StateOption {
  id: ContactState
  label: string
  hint: string
  color: string
}

const S = (id: ContactState, label: string, hint: string, color: string): StateOption =>
  ({ id, label, hint, color })

export const STATES_BY_STAGE: Record<PersonStatus, StateOption[]> = {
  lead: [
    S('hot',  'Hot',  'Ready to buy, move now', '#dc2626'),
    S('warm', 'Warm', 'Interested, needs another touch', '#e0683f'),
    S('cold', 'Cold', 'No movement, park it', '#6b78e8'),
  ],
  client: [
    S('active', 'Active', 'Delivering now', '#1f8a5b'),
    S('paused', 'Paused', 'Still a client, work on hold', '#e8a516'),
    S('upsell', 'Upsell', 'Ready for the next level', '#7c4dd6'),
  ],
  'past-client': [
    S('reengage', 'Re-engage', 'Worth reaching out to again', '#0891b2'),
    S('lost',     'Lost',      'Not coming back, keep the record', '#9a8cba'),
  ],
  contact: [
    S('new',  'New',  'In the base, nothing decided yet', '#6b78e8'),
    S('warm', 'Warm', 'Worth a conversation', '#e0683f'),
    S('cold', 'Cold', 'Keep on file', '#9a8cba'),
  ],
}

export function defaultState(stage: PersonStatus): ContactState {
  return STATES_BY_STAGE[stage][0].id
}

export function resolveState(stage: PersonStatus, stored?: string): StateOption {
  const options = STATES_BY_STAGE[stage]
  return options.find(o => o.id === stored) ?? options[0]
}

export const STATUS_LABEL: Record<PersonStatus, string> = {
  lead: 'Lead',
  client: 'Active client',
  'past-client': 'Past client',
  contact: 'Contact',
}

export const STATUS_HINT: Record<PersonStatus, string> = {
  lead: 'Actively in the pipeline',
  client: 'Paying now',
  'past-client': 'Has paid before, nothing open',
  contact: 'Not in the pipeline',
}
