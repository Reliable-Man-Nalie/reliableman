import type { SupabaseClient } from '@supabase/supabase-js'

export const eventFunnelId = (slug: string) => `event:${slug}`.slice(0, 60)

export type EventRow = {
  id: string; slug: string; title: string; status: string; date: string; time: string
  timezone: string; price: number; currency: string; capacity: number; created_at?: string
}
export type AttendeeRow = {
  email: string; status: string; paid: boolean; paid_amount: number | null
  checked_in: boolean; source: string | null; registered_at: string
}
export type ViewRow = { visitor_id: string | null; referrer: string | null; created_at: string }
export type DealRow = { client_email: string | null; stage: string | null }

export type EventAnalytics = {
  event: { id: string; slug: string; title: string; status: string; date: string; time: string; timezone: string; price: number; currency: string; capacity: number }
  daysToGo: number | null
  views: number
  visitors: number
  registered: number
  cancelled: number
  waitlisted: number
  paid: number
  unpaid: number
  revenue: number
  showedUp: number

  visitToSignup: number | null

  signupToPaid: number | null

  showRate: number | null
  capacityFill: number | null

  byDay: { day: string; registered: number; views: number }[]
  sources: { label: string; count: number }[]
  referrers: { label: string; count: number }[]
  inPipeline: number
  becameClients: number
}

const CLIENT_STAGES = new Set(['signed', 'active', 'completed'])
const CLOSED = new Set(['lost'])

function host(ref: string | null): string {
  if (!ref) return 'Direct or app'
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '')
    if (/instagram/.test(h)) return 'Instagram'
    if (/facebook|fb\.com|fb\.me/.test(h)) return 'Facebook'
    if (/whatsapp|wa\.me/.test(h)) return 'WhatsApp'
    if (/linkedin|lnkd/.test(h)) return 'LinkedIn'
    if (/google\./.test(h)) return 'Google'
    return h
  } catch { return 'Direct or app' }
}

function tally(items: string[]): { label: string; count: number }[] {
  const m = new Map<string, number>()
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1)
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6)
}

export function computeEventAnalytics(ev: EventRow, attendees: AttendeeRow[], views: ViewRow[], deals: DealRow[], now = new Date()): EventAnalytics {
  const live = attendees.filter(a => a.status !== 'cancelled')
  const seated = live.filter(a => a.status !== 'waitlisted')
  const isPaid = Number(ev.price) > 0
  const paid = seated.filter(a => a.paid)

  const registered = isPaid ? paid.length : seated.length
  const unpaid = isPaid ? seated.length - paid.length : 0
  const revenue = paid.reduce((s, a) => s + (Number(a.paid_amount) || Number(ev.price) || 0), 0)
  const showedUp = seated.filter(a => a.checked_in || a.status === 'attended').length

  const today = now.toISOString().slice(0, 10)
  const daysToGo = ev.date ? Math.round((Date.parse(`${ev.date.slice(0, 10)}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000) : null
  const past = daysToGo !== null && daysToGo < 0

  const visitorSet = new Set(views.map(v => v.visitor_id || '').filter(Boolean))
  const visitors = visitorSet.size || views.length

  const days: { day: string; registered: number; views: number }[] = []
  for (let i = 20; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    days.push({ day: d, registered: 0, views: 0 })
  }
  const idx = new Map(days.map((d, i) => [d.day, i]))
  for (const a of seated) { const i = idx.get(String(a.registered_at).slice(0, 10)); if (i !== undefined) days[i].registered++ }
  for (const v of views) { const i = idx.get(String(v.created_at).slice(0, 10)); if (i !== undefined) days[i].views++ }

  const emails = new Set(seated.map(a => a.email.toLowerCase()).filter(Boolean))
  const mine = deals.filter(d => d.client_email && emails.has(d.client_email.toLowerCase()))
  const clientEmails = new Set(mine.filter(d => CLIENT_STAGES.has(String(d.stage))).map(d => d.client_email!.toLowerCase()))
  const pipeEmails = new Set(mine.filter(d => !CLOSED.has(String(d.stage)) && !CLIENT_STAGES.has(String(d.stage))).map(d => d.client_email!.toLowerCase()))

  return {
    event: { id: ev.id, slug: ev.slug, title: ev.title, status: ev.status, date: ev.date?.slice(0, 10) ?? '', time: ev.time, timezone: ev.timezone, price: Number(ev.price) || 0, currency: ev.currency || 'USD', capacity: Number(ev.capacity) || 0 },
    daysToGo,
    views: views.length,
    visitors,
    registered,
    cancelled: attendees.length - live.length,
    waitlisted: live.filter(a => a.status === 'waitlisted').length,
    paid: paid.length,
    unpaid,
    revenue,
    showedUp,
    visitToSignup: visitors ? Math.min(1, registered / visitors) : null,
    signupToPaid: isPaid && seated.length ? paid.length / seated.length : null,
    showRate: past && registered ? showedUp / registered : null,
    capacityFill: ev.capacity ? registered / Number(ev.capacity) : null,
    byDay: days,
    sources: tally(seated.map(a => (a.source || 'event page').replace(/_/g, ' '))),
    referrers: tally(views.map(v => host(v.referrer))),
    inPipeline: pipeEmails.size,
    becameClients: clientEmails.size,
  }
}

export async function gatherEventAnalytics(db: SupabaseClient, eventId: string, now = new Date()): Promise<EventAnalytics | null> {
  const { data: ev } = await db.from('events')
    .select('id, slug, title, status, date, time, timezone, price, currency, capacity, created_at')
    .eq('id', eventId).maybeSingle()
  if (!ev) return null
  const [att, views] = await Promise.all([
    db.from('event_attendees').select('email, status, paid, paid_amount, checked_in, source, registered_at').eq('event_id', eventId).limit(5000),
    db.from('funnel_events').select('visitor_id, referrer, created_at').eq('funnel_id', eventFunnelId(String(ev.slug))).eq('step', 'view').limit(20000),
  ])
  const attendees = (att.data ?? []) as AttendeeRow[]
  const emails = [...new Set(attendees.map(a => (a.email || '').toLowerCase()).filter(Boolean))]
  let deals: DealRow[] = []

  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await db.from('deals').select('client_email, stage').in('client_email', emails.slice(i, i + 200))
    deals = deals.concat((data ?? []) as DealRow[])
  }
  return computeEventAnalytics(ev as EventRow, attendees, (views.data ?? []) as ViewRow[], deals, now)
}

export function ruleInsights(a: EventAnalytics): string[] {
  const out: string[] = []
  const cur = a.event.currency === 'EUR' ? '€' : '$'
  if (a.daysToGo !== null && a.daysToGo >= 0) {
    if (a.event.status !== 'published') out.push(`This event is still a draft, ${a.daysToGo} days out. Nobody can sign up until it is published.`)
    if (a.capacityFill !== null && a.capacityFill < 0.3 && a.daysToGo <= 7) out.push(`${a.registered} of ${a.event.capacity} seats are taken with ${a.daysToGo} days to go. Push the invitation posts and a WhatsApp broadcast today.`)
    if (a.unpaid > 0) out.push(`${a.unpaid} people started checkout and did not pay. A personal message to each is the cheapest seat you will sell.`)
    if (a.visitors >= 30 && a.visitToSignup !== null && a.visitToSignup < 0.05) out.push(`${a.visitors} people saw the page and ${a.registered} signed up (${Math.round(a.visitToSignup * 100)}%). The page is the bottleneck: sharpen the headline and the first screen.`)
    if (a.visitors === 0) out.push('No page visits are recorded yet. Visits are tracked from 9 October, so share the link and this fills in.')
  } else if (a.daysToGo !== null) {
    if (a.showRate !== null) out.push(`${a.showedUp} of ${a.registered} showed up (${Math.round(a.showRate * 100)}%).`)
    out.push(`${a.inPipeline} attendees are in the pipeline and ${a.becameClients} became clients. Everyone who came and is not in the pipeline is the follow-up list.`)
  }
  if (a.revenue > 0) out.push(`${cur}${a.revenue.toLocaleString('en-US')} taken from ${a.paid} paid seats.`)
  return out.slice(0, 4)
}
