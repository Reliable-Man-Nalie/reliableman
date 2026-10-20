import { getDeals, getLeads, getInvoices, getProposals } from './crm-store'
import { getAttendees } from './event-store'
import { getClientRecords } from './client-store'
import { getAccounts, inFeed } from './business-accounts'
import { isLikelySpam } from './apply-guard'

export type PersonStage = 'client' | 'lead' | 'contact'
export type PersonSource = 'deal' | 'lead' | 'attendee' | 'invoice' | 'proposal' | 'portal' | 'account'

export type PersonState =
  | 'client'      // Live client
  | 'group'      // In the Group Program, the group programme
  | 'retainer'    // Paying a monthly retainer, one to one
  | 'pipeline'    // In the lead pipeline (an open deal)
  | 'enquiry'     // Filled in a form, no deal yet
  | 'attendee'    // Registered for an event
  | 'attended'    // Actually turned up (checked in)
  | 'subscriber'  // Newsletter or events-notify signup
  | 'proposal'    // Has been sent a proposal
  | 'invoiced'    // Has been invoiced
  | 'portal'      // Has a client record
  | 'past'        // Worked together, nothing open now
  | 'lost'        // Pipeline closed without winning
  | 'spam'        // The classifier's verdict

export const PERSON_STATES: { value: PersonState; label: string; tone: 'good' | 'accent' | 'warn' | 'bad' | 'muted' }[] = [
  { value: 'client',     label: 'Live client',      tone: 'good' },
  { value: 'group',     label: 'Group program',    tone: 'accent' },
  { value: 'retainer',   label: 'On a retainer',    tone: 'good' },
  { value: 'pipeline',   label: 'In lead pipeline', tone: 'accent' },
  { value: 'enquiry',    label: 'Enquiry',          tone: 'accent' },
  { value: 'attendee',   label: 'Event attendee',   tone: 'warn' },
  { value: 'attended',   label: 'Attended an event',tone: 'warn' },
  { value: 'subscriber', label: 'Subscriber',       tone: 'muted' },
  { value: 'proposal',   label: 'Proposal sent',    tone: 'accent' },
  { value: 'invoiced',   label: 'Invoiced',         tone: 'good' },
  { value: 'portal',     label: 'Client record',    tone: 'good' },
  { value: 'past',       label: 'Past client',      tone: 'muted' },
  { value: 'lost',       label: 'Lost',             tone: 'muted' },
  { value: 'spam',       label: 'Likely spam',      tone: 'bad' },
]

export const stateMeta = (v: PersonState) =>
  PERSON_STATES.find(s => s.value === v) ?? { value: v, label: v, tone: 'muted' as const }

export type Person = {

  key: string
  name: string
  email: string
  company: string
  phone: string
  address: string
  website: string

  stage: PersonStage

  states: PersonState[]
  sources: PersonSource[]

  tags: string[]

  events: string[]

  counts: { deals: number; invoices: number; proposals: number; events: number }

  dealId?: string
  leadId?: string
  accountId?: string
  attendeeId?: string

  spam: boolean

  lastSeen: string

  firstSeen: string
}

export const isGroupText = (...parts: (string | null | undefined)[]) =>
  parts.some(p => /\bgroup\b/i.test(p ?? ''))

export function planSplit(c: { program?: string | null; planName?: string | null; monthlyAmount?: number | null }) {
  const group = isGroupText(c.program, c.planName)
  return { group, retainer: !group && (c.monthlyAmount ?? 0) > 0 }
}

const OPEN_DEAL: string[] = ['lead', 'discovery', 'proposal_sent', 'negotiation']
const CLIENT_DEAL: string[] = ['signed', 'active', 'completed']

const SUBSCRIBER_SOURCES = ['newsletter', 'events-notify']

const keyOf = (email?: string | null, name?: string | null) =>
  (email ?? '').trim().toLowerCase() || (name ?? '').trim().toLowerCase()

type Flags = {
  client: boolean; pipeline: boolean; enquiry: boolean; attendee: boolean
  attended: boolean; subscriber: boolean; proposal: boolean; invoiced: boolean
  portal: boolean; lost: boolean; group: boolean; retainer: boolean

  completed: boolean

  live: boolean
}

type Draft = Omit<Person, 'stage' | 'spam' | 'states'> & Flags & { spamVotes: number; spamChecks: number }

export interface PeopleSources {
  deals: ReturnType<typeof getDeals>
  proposals: ReturnType<typeof getProposals>
  invoices: ReturnType<typeof getInvoices>
  portal: ReturnType<typeof getClientRecords>
  accounts: ReturnType<typeof getAccounts>
  leads: ReturnType<typeof getLeads>
  attendees: ReturnType<typeof getAttendees>
}

export function getPeople(opts: { includeSpam?: boolean } = {}): Person[] {
  return buildPeople({
    deals: getDeals(), proposals: getProposals(), invoices: getInvoices(),
    portal: getClientRecords(), accounts: getAccounts(), leads: getLeads(),
    attendees: getAttendees(),
  }, opts)
}

export function buildPeople(src: PeopleSources, opts: { includeSpam?: boolean } = {}): Person[] {
  const map = new Map<string, Draft>()

  const fold = (
    src: PersonSource,
    row: { name?: string | null; email?: string | null; company?: string | null; phone?: string | null; address?: string | null; website?: string | null; at?: string | null },
    flags: Partial<Flags> & { dealId?: string; leadId?: string; accountId?: string; attendeeId?: string; spam?: boolean | null; tags?: string[] | null; event?: string | null } = {},
  ) => {
    const key = keyOf(row.email, row.name)
    if (!key) return
    const cur = map.get(key) ?? {
      key, name: '', email: '', company: '', phone: '', address: '', website: '',
      sources: [], tags: [], events: [],
      counts: { deals: 0, invoices: 0, proposals: 0, events: 0 },
      client: false, pipeline: false, enquiry: false, attendee: false,
      attended: false, subscriber: false, proposal: false, invoiced: false,
      portal: false, lost: false, completed: false, live: false,
      group: false, retainer: false,
      spamVotes: 0, spamChecks: 0, lastSeen: '', firstSeen: '',
    }
    cur.name ||= (row.name ?? '').trim()
    cur.email ||= (row.email ?? '').trim()
    cur.company ||= (row.company ?? '').trim()
    cur.phone ||= (row.phone ?? '').trim()
    cur.address ||= (row.address ?? '').trim()
    cur.website ||= (row.website ?? '').trim()
    if (!cur.sources.includes(src)) cur.sources.push(src)
    for (const k of ['client', 'pipeline', 'enquiry', 'attendee', 'attended', 'subscriber', 'proposal', 'invoiced', 'portal', 'lost', 'completed', 'live', 'group', 'retainer'] as const) {
      if (flags[k]) cur[k] = true
    }
    if (flags.dealId) cur.dealId ||= flags.dealId
    if (flags.leadId) cur.leadId ||= flags.leadId
    if (flags.accountId) cur.accountId ||= flags.accountId
    if (flags.attendeeId) cur.attendeeId ||= flags.attendeeId
    for (const t of flags.tags ?? []) if (t && !cur.tags.includes(t)) cur.tags.push(t)
    if (flags.event && !cur.events.includes(flags.event)) cur.events.push(flags.event)
    if (flags.spam != null) { cur.spamChecks += 1; if (flags.spam) cur.spamVotes += 1 }
    const at = row.at ?? ''
    if (at > cur.lastSeen) cur.lastSeen = at
    if (at && (!cur.firstSeen || at < cur.firstSeen)) cur.firstSeen = at
    map.set(key, cur)
  }

  for (const d of src.deals) {
    const open = OPEN_DEAL.includes(d.stage)
    const won = CLIENT_DEAL.includes(d.stage)
    fold('deal', { name: d.clientName, email: d.clientEmail, company: d.clientCompany, phone: d.clientPhone, address: d.clientAddress ?? d.location, website: d.clientWebsite, at: d.updatedAt ?? d.createdAt }, {
      dealId: d.id,
      client: won,
      pipeline: open,
      completed: d.stage === 'completed',
      group: won && isGroupText(d.service),
      live: d.stage === 'active',
      lost: d.stage === 'lost',
      tags: d.tags,
      spam: isLikelySpam({ name: d.clientName, email: d.clientEmail, clientCompany: d.clientCompany, tags: d.tags }),
    })
    const p = map.get(keyOf(d.clientEmail, d.clientName)); if (p) p.counts.deals += 1
  }
  for (const p of src.proposals) {
    fold('proposal', { name: p.clientName, email: p.clientEmail, company: p.clientCompany, phone: p.clientPhone, address: p.clientAddress, at: p.createdAt }, {
      client: p.status === 'signed',

      proposal: p.status !== 'draft' && p.status !== 'void',

      group: p.status === 'signed' && isGroupText(p.title, ...(p.services ?? [])),
    })
    const r = map.get(keyOf(p.clientEmail, p.clientName)); if (r) r.counts.proposals += 1
  }
  for (const inv of src.invoices) {
    const real = inv.status !== 'draft' && inv.status !== 'void'
    fold('invoice', { name: inv.clientName, email: inv.clientEmail, company: inv.clientCompany, phone: inv.clientPhone, address: inv.clientAddress, at: inv.createdAt }, {
      client: real, invoiced: real,
    })
    const r = map.get(keyOf(inv.clientEmail, inv.clientName)); if (r) r.counts.invoices += 1
  }
  for (const c of src.portal) {
    fold('portal', { name: c.name, email: c.email, company: c.company, phone: c.phone, website: c.website, at: c.createdAt }, {
      client: true, portal: true, live: c.status === 'active',
      group: isGroupText(c.program, c.planName),

      retainer: !isGroupText(c.program, c.planName) && (c.monthlyAmount ?? 0) > 0,
    })
  }
  for (const a of src.accounts) {
    if (!a.clientEmail && !a.clientName) continue
    fold('account', { name: a.clientName, email: a.clientEmail, company: a.name, at: a.createdAt }, { accountId: a.id, client: inFeed(a), live: inFeed(a) })
  }
  for (const l of src.leads) {
    const subscriber = SUBSCRIBER_SOURCES.includes((l.source ?? '').toLowerCase())
    fold('lead', { name: l.name, email: l.email, company: l.company, phone: l.phone, at: l.createdAt }, {
      leadId: l.id,
      subscriber,
      enquiry: !subscriber && l.status !== 'lost' && l.status !== 'unqualified',
      lost: l.status === 'lost',
      client: l.status === 'client',
      tags: (l as typeof l & { tags?: string[] }).tags,
      spam: isLikelySpam({ name: l.name, email: l.email, company: l.company }),
    })
  }
  for (const a of src.attendees) {
    fold('attendee', { name: a.name, email: a.email, company: a.company, phone: a.phone, at: a.registeredAt }, {
      attendeeId: a.id, attendee: true, attended: !!a.checkedIn, event: a.eventTitle,
    })
    const r = map.get(keyOf(a.email, a.name)); if (r) r.counts.events += 1
  }

  const order = PERSON_STATES.map(s => s.value)
  const people: Person[] = [...map.values()].map(d => {
    const { client, pipeline, enquiry, attendee, attended, subscriber, proposal, invoiced, portal, lost, completed, live, group, retainer, spamVotes, spamChecks, ...rest } = d
    const spam = !client && spamChecks > 0 && spamVotes === spamChecks

    const held: Record<PersonState, boolean> = {
      client, pipeline, enquiry, attendee, attended, subscriber,
      proposal, invoiced, portal,

      group, retainer: retainer && !group,
      past: completed && !live && !pipeline,
      lost: lost && !client, spam,
    }
    const states = order.filter(s => held[s])
    return {
      ...rest,
      stage: client ? 'client' : (pipeline || enquiry) ? 'lead' : 'contact',
      states,
      spam,
    }
  })

  return (opts.includeSpam ? people : people.filter(p => !p.spam))
    .sort((a, b) => (b.lastSeen > a.lastSeen ? 1 : b.lastSeen < a.lastSeen ? -1 : a.name.localeCompare(b.name)))
}

export const getClients = () => getPeople().filter(p => p.stage === 'client')

export function personLabel(p: Person): string {
  const bits = [p.name || p.email, p.company, p.name && p.email ? p.email : ''].filter(Boolean)
  return bits.join(' · ')
}
