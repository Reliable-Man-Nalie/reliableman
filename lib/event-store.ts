import { BRAND } from '@/lib/brand'
import type { BosEvent, EventAttendee, AttendeeStatus } from './event-types'
import { recordWriteStart, recordWriteEnd, recordWriteFailure, recordWriteSuccess } from './sync-status'

const EVENTS_KEY = 'bos_events'
const ATTENDEES_KEY = 'bos_event_attendees'

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-4)
}

export function generateTicketCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'TKT-'
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

function save<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items))
  window.dispatchEvent(new Event('bos:events'))
}

function eventToRow(e: BosEvent): Record<string, unknown> {
  return {
    id: e.id,
    slug: e.slug,
    status: e.status,
    title: e.title,
    tagline: e.tagline,
    date: e.date,
    time: e.time,
    end_time: e.endTime,
    timezone: e.timezone,
    format: e.format,
    location: e.location,
    location_name: e.locationName,
    capacity: e.capacity,
    price: e.price,
    currency: e.currency,
    cover_image: e.coverImage,
    thumbnail_image: e.thumbnailImage,
    tags: e.tags,
    speakers: e.speakers,
    agenda: e.agenda,
    faq: e.faq,
    waitlist_enabled: e.waitlistEnabled,
    requires_approval: e.requiresApproval,
    email_confirmation: e.emailConfirmation,
    email_reminder: e.emailReminder,
    email_follow_up: e.emailFollowUp,
    reminder_hours_before: e.reminderHoursBefore,
    seo_title: e.seoTitle,
    seo_description: e.seoDescription,
    data: JSON.stringify(e),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  }
}

export interface SyncResult { ok: boolean; error?: string }

async function syncEvent(e: BosEvent): Promise<SyncResult> {
  try {
    const res = await fetch('/api/os-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'upsert', table: 'events', row: eventToRow(e) }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      const error = json?.error ? String(json.error) : `The server answered ${res.status}.`
      console.error('[event-store] event sync failed:', error)
      return { ok: false, error }
    }
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Network error, could not reach the server.'
    console.error('[event-store] event sync threw:', err)
    return { ok: false, error }
  }
}

function deleteEventRemote(id: string): void {
  void writeRemote('delete', 'events', id)
}

function attendeeToRow(a: EventAttendee): Record<string, unknown> {
  return {
    id: a.id,
    event_id: a.eventId,
    event_title: a.eventTitle,
    name: a.name,
    email: a.email,
    phone: a.phone,
    company: a.company,
    status: a.status,
    paid: a.paid,
    paid_at: a.paidAt || null,
    paid_amount: a.paidAmount,
    checked_in: a.checkedIn,
    checked_in_at: a.checkedInAt || null,
    ticket_code: a.ticketCode,
    notes: a.notes,
    source: a.source,
    registered_at: a.registeredAt,
  }
}

async function writeRemote(op: 'upsert' | 'delete', table: string, payload: Record<string, unknown> | string) {
  const key = `${op}:${table}:${typeof payload === 'string' ? payload : String(payload.id ?? '')}`
  const body = op === 'upsert' ? { op, table, row: payload } : { op, table, id: payload }
  recordWriteStart()
  try {
    const res = await fetch('/api/os-write', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = res.ok ? await res.json().catch(() => null) : null
    if (!res.ok || (data && data.ok === false)) {
      recordWriteFailure({ key, op, table, payload, reason: String(data?.error ?? `${res.status} ${res.statusText}`.trim()) })
      return
    }
    recordWriteSuccess(key)
  } catch (err) {
    recordWriteFailure({ key, op, table, payload, reason: err instanceof Error ? err.message : 'network error' })
  } finally {
    recordWriteEnd()
  }
}

function syncAttendee(a: EventAttendee): void {
  void writeRemote('upsert', 'event_attendees', attendeeToRow(a))
}

function deleteAttendeeRemote(id: string): void {
  void writeRemote('delete', 'event_attendees', id)
}

const DEFAULT_CONFIRMATION = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#12002a,#2d0060);padding:32px 40px;text-align:center;border-radius:12px 12px 0 0">
    <div style="color:#a855f7;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">${BRAND.name}</div>
    <div style="color:#fff;font-size:22px;font-weight:900">{{eventTitle}}</div>
  </div>
  <div style="background:#fff;padding:36px 40px;border:1px solid #ede8fb">
    <p style="color:#12002a;font-size:16px;margin:0 0 16px">Hi {{name}},</p>
    <p style="color:#444;line-height:1.7;margin:0 0 20px">You're in! Your spot for <strong>{{eventTitle}}</strong> is confirmed. We're so excited to have you.</p>
    <div style="background:#faf8ff;border:2px solid #7c3aed;border-radius:12px;padding:20px 24px;margin:24px 0;text-align:center">
      <div style="color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Your Ticket Code</div>
      <div style="color:#7c3aed;font-size:28px;font-weight:900;letter-spacing:3px">{{ticketCode}}</div>
      <div style="color:#aaa;font-size:11px;margin-top:6px">Present this at the event</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:10px 0;color:#888;font-size:13px;border-bottom:1px solid #f0eafc;width:40%">📅 Date</td><td style="padding:10px 0;font-weight:700;color:#12002a;border-bottom:1px solid #f0eafc">{{date}}</td></tr>
      <tr><td style="padding:10px 0;color:#888;font-size:13px;border-bottom:1px solid #f0eafc">🕐 Time</td><td style="padding:10px 0;font-weight:700;color:#12002a;border-bottom:1px solid #f0eafc">{{time}}</td></tr>
      <tr><td style="padding:10px 0;color:#888;font-size:13px">📍 Location</td><td style="padding:10px 0;font-weight:700;color:#12002a">{{location}}</td></tr>
    </table>
    <p style="color:#444;line-height:1.7;margin:0 0 20px">If you have any questions before the event, just reply to this email and we'll get back to you.</p>
    <p style="color:#444;margin:0">Warm regards,<br><strong style="color:#12002a">The team</strong></p>
  </div>
  <div style="background:#f9f6ff;padding:16px 40px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #ede8fb;border-top:none">
    <div style="font-size:11px;color:#aaa">© ${BRAND.name} · <a href="mailto:${BRAND.email}" style="color:#7c3aed;text-decoration:none">${BRAND.email}</a></div>
  </div>
</div>`

const DEFAULT_REMINDER = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#12002a,#2d0060);padding:32px 40px;text-align:center;border-radius:12px 12px 0 0">
    <div style="color:#a855f7;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Event Reminder</div>
    <div style="color:#fff;font-size:22px;font-weight:900">{{eventTitle}}</div>
  </div>
  <div style="background:#fff;padding:36px 40px;border:1px solid #ede8fb">
    <p style="color:#12002a;font-size:16px;margin:0 0 16px">Hi {{name}},</p>
    <p style="color:#444;line-height:1.7;margin:0 0 20px">Just a reminder, <strong>{{eventTitle}}</strong> is coming up soon! We can't wait to see you there.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:10px 0;color:#888;font-size:13px;border-bottom:1px solid #f0eafc;width:40%">📅 Date</td><td style="padding:10px 0;font-weight:700;color:#12002a;border-bottom:1px solid #f0eafc">{{date}}</td></tr>
      <tr><td style="padding:10px 0;color:#888;font-size:13px;border-bottom:1px solid #f0eafc">🕐 Time</td><td style="padding:10px 0;font-weight:700;color:#12002a;border-bottom:1px solid #f0eafc">{{time}}</td></tr>
      <tr><td style="padding:10px 0;color:#888;font-size:13px">📍 Location</td><td style="padding:10px 0;font-weight:700;color:#12002a">{{location}}</td></tr>
    </table>
    <p style="color:#444;line-height:1.7;margin:0">See you soon!<br><strong style="color:#12002a">The team</strong></p>
  </div>
  <div style="background:#f9f6ff;padding:16px 40px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #ede8fb;border-top:none">
    <div style="font-size:11px;color:#aaa">© ${BRAND.name} · <a href="mailto:${BRAND.email}" style="color:#7c3aed;text-decoration:none">${BRAND.email}</a></div>
  </div>
</div>`

const DEFAULT_FOLLOWUP = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#12002a,#2d0060);padding:32px 40px;text-align:center;border-radius:12px 12px 0 0">
    <div style="color:#a855f7;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Thank You</div>
    <div style="color:#fff;font-size:22px;font-weight:900">{{eventTitle}}</div>
  </div>
  <div style="background:#fff;padding:36px 40px;border:1px solid #ede8fb">
    <p style="color:#12002a;font-size:16px;margin:0 0 16px">Hi {{name}},</p>
    <p style="color:#444;line-height:1.7;margin:0 0 20px">Thank you for joining <strong>{{eventTitle}}</strong>, it was truly incredible to have you there. Your energy and presence made the event special.</p>
    <p style="color:#444;line-height:1.7;margin:0 0 20px">We'd love to hear your thoughts. Hit reply and tell us what you got out of it, what you'd love to see next, or just say hi.</p>
    <p style="color:#444;line-height:1.7;margin:0 0 20px">Stay tuned for more upcoming events and opportunities.</p>
    <p style="color:#444;margin:0">Warm regards,<br><strong style="color:#12002a">The team</strong></p>
  </div>
  <div style="background:#f9f6ff;padding:16px 40px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #ede8fb;border-top:none">
    <div style="font-size:11px;color:#aaa">© ${BRAND.name} · <a href="mailto:${BRAND.email}" style="color:#7c3aed;text-decoration:none">${BRAND.email}</a></div>
  </div>
</div>`

export function importEvents(incoming: BosEvent[]): void {
  const existing = load<BosEvent>(EVENTS_KEY)
  const existingIds = new Set(existing.map(e => e.id))
  const newEvents = incoming
    .filter(e => !existingIds.has(e.id))
    .map(e => ({
      ...e,
      emailConfirmation: e.emailConfirmation || DEFAULT_CONFIRMATION,
      emailReminder:     e.emailReminder     || DEFAULT_REMINDER,
      emailFollowUp:     e.emailFollowUp     || DEFAULT_FOLLOWUP,
    }))
  if (newEvents.length === 0) return
  save(EVENTS_KEY, [...newEvents, ...existing])
}

export function getEvents(): BosEvent[] { return load<BosEvent>(EVENTS_KEY) }

export function getEvent(id: string): BosEvent | null {
  return load<BosEvent>(EVENTS_KEY).find(e => e.id === id) ?? null
}

export function getEventBySlug(slug: string): BosEvent | null {
  return load<BosEvent>(EVENTS_KEY).find(e => e.slug === slug) ?? null
}

export function createEvent(data: Partial<BosEvent>): BosEvent {
  const now = new Date().toISOString()
  const event: BosEvent = {
    id: uid(),
    slug: slugify(data.title ?? 'event'),
    title: data.title ?? '',
    tagline: data.tagline ?? '',
    description: data.description ?? '',
    date: data.date ?? '',
    time: data.time ?? '09:00',
    endTime: data.endTime ?? '11:00',
    timezone: data.timezone ?? 'UTC',
    format: data.format ?? 'in_person',
    location: data.location ?? '',
    locationName: data.locationName ?? '',
    capacity: data.capacity ?? 0,
    price: data.price ?? 0,
    currency: data.currency ?? 'USD',
    coverImage: data.coverImage ?? '',
    thumbnailImage: data.thumbnailImage ?? '',
    status: 'draft',
    tags: data.tags ?? [],
    speakers: data.speakers ?? [],
    agenda: data.agenda ?? [],
    faq: data.faq ?? [],
    waitlistEnabled: data.waitlistEnabled ?? false,
    requiresApproval: data.requiresApproval ?? false,
    emailConfirmation: DEFAULT_CONFIRMATION,
    emailReminder: DEFAULT_REMINDER,
    emailFollowUp: DEFAULT_FOLLOWUP,
    reminderHoursBefore: 24,
    seoTitle: data.seoTitle ?? '',
    seoDescription: data.seoDescription ?? '',
    createdAt: now,
    updatedAt: now,
  }
  const events = load<BosEvent>(EVENTS_KEY)
  save(EVENTS_KEY, [event, ...events])
  syncEvent(event)
  return event
}

export function duplicateEvent(id: string, daysLater = 7): BosEvent | null {
  const events = load<BosEvent>(EVENTS_KEY)
  const src = events.find(e => e.id === id)
  if (!src) return null
  const now = new Date().toISOString()
  let date = src.date
  if (/^\d{4}-\d{2}-\d{2}/.test(src.date)) {
    const d = new Date(`${src.date.slice(0, 10)}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + daysLater)
    date = d.toISOString().slice(0, 10)
  }
  const copy: BosEvent = { ...src, id: uid(), slug: slugify(src.title || 'event'), date, status: 'draft', createdAt: now, updatedAt: now }
  save(EVENTS_KEY, [copy, ...events])
  syncEvent(copy)
  return copy
}

export function updateEvent(id: string, patch: Partial<BosEvent>): Promise<SyncResult> {
  const events = load<BosEvent>(EVENTS_KEY)
  let updated: BosEvent | null = null
  const next = events.map(e => {
    if (e.id !== id) return e
    updated = { ...e, ...patch, updatedAt: new Date().toISOString() }
    return updated
  })
  save(EVENTS_KEY, next)
  return updated ? syncEvent(updated) : Promise.resolve({ ok: false, error: 'Event not found locally' })
}

export function deleteEvent(id: string): void {
  save(EVENTS_KEY, load<BosEvent>(EVENTS_KEY).filter(e => e.id !== id))
  const attendees = load<EventAttendee>(ATTENDEES_KEY).filter(a => a.eventId !== id)
  localStorage.setItem(ATTENDEES_KEY, JSON.stringify(attendees))
  window.dispatchEvent(new Event('bos:events'))
  deleteEventRemote(id)
}

export function getAttendees(eventId?: string): EventAttendee[] {
  const all = load<EventAttendee>(ATTENDEES_KEY)
  return eventId ? all.filter(a => a.eventId === eventId) : all
}

export function addAttendee(data: Omit<EventAttendee, 'id' | 'registeredAt'>): EventAttendee {
  const attendee: EventAttendee = { ...data, id: uid(), registeredAt: new Date().toISOString() }
  const all = load<EventAttendee>(ATTENDEES_KEY)
  save(ATTENDEES_KEY, [attendee, ...all])
  syncAttendee(attendee)
  return attendee
}

export function updateAttendee(id: string, patch: Partial<EventAttendee>): void {
  const all = load<EventAttendee>(ATTENDEES_KEY)
  let updated: EventAttendee | null = null
  let previousEmail = ''
  const next = all.map(a => {
    if (a.id !== id) return a
    previousEmail = String(a.email || '')
    updated = { ...a, ...patch }
    return updated
  })
  save(ATTENDEES_KEY, next)
  if (updated) syncAttendee(updated)

  const newEmail = String(patch.email ?? '').trim().toLowerCase()
  if (updated && newEmail && newEmail !== previousEmail.trim().toLowerCase() && typeof window !== 'undefined') {
    const announce = (detail: Record<string, unknown>) =>
      window.dispatchEvent(new CustomEvent('bos:attendee-email', { detail: { id, email: newEmail, ...detail } }))
    fetch('/api/os/event-attendee-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendeeId: id, email: newEmail }),
    })
      .then(r => r.json().catch(() => ({ ok: false })))
      .then(json => announce(json as Record<string, unknown>))
      .catch(() => announce({ ok: false }))
  }
}

export function updateAttendeeStatus(id: string, status: AttendeeStatus): void {
  updateAttendee(id, { status })
}

export function markPaid(id: string, amount = 0): void {
  updateAttendee(id, { paid: true, paidAt: new Date().toISOString(), paidAmount: amount })
}

export function markCheckedIn(id: string): void {
  updateAttendee(id, { checkedIn: true, checkedInAt: new Date().toISOString(), status: 'attended' })
}

export function removeAttendee(id: string): void {
  save(ATTENDEES_KEY, load<EventAttendee>(ATTENDEES_KEY).filter(a => a.id !== id))
  deleteAttendeeRemote(id)
}

export function exportAttendeesCSV(eventId: string): void {
  const attendees = getAttendees(eventId)
  if (attendees.length === 0) return

  const headers = ['Name', 'Email', 'Phone', 'Company', 'Status', 'Paid', 'Paid Amount', 'Checked In', 'Ticket Code', 'Source', 'Registered At']
  const rows = attendees.map(a => [
    a.name, a.email, a.phone, a.company, a.status,
    a.paid ? 'Yes' : 'No', String(a.paidAmount),
    a.checkedIn ? 'Yes' : 'No', a.ticketCode, a.source,
    new Date(a.registeredAt).toLocaleString(),
  ])

  const csv = [headers, ...rows].map(row => row.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `attendees-${eventId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToAttendee(r: any): EventAttendee {
  return {
    id: String(r.id),
    eventId: String(r.event_id ?? ''),
    eventTitle: String(r.event_title ?? ''),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    company: String(r.company ?? ''),
    status: (r.status ?? 'registered') as AttendeeStatus,
    paid: Boolean(r.paid),
    paidAt: String(r.paid_at ?? ''),
    paidAmount: Number(r.paid_amount ?? 0),
    checkedIn: Boolean(r.checked_in),
    checkedInAt: String(r.checked_in_at ?? ''),
    ticketCode: String(r.ticket_code ?? ''),
    notes: String(r.notes ?? ''),
    source: String(r.source ?? ''),
    registeredAt: String(r.registered_at ?? r.created_at ?? ''),
    paymentMethod: r.payment_method ? String(r.payment_method) : undefined,
    proofPath: r.proof_path ? String(r.proof_path) : undefined,
    proofCheck: r.proof_check && typeof r.proof_check === 'object' ? r.proof_check : null,
    paymentRef: r.payment_ref && typeof r.payment_ref === 'object' ? r.payment_ref : null,
    referralCode: r.referral_code ? String(r.referral_code) : undefined,
    referredBy: r.referred_by ? String(r.referred_by) : undefined,
    referralRewards: Array.isArray(r.referral_rewards) ? r.referral_rewards : [],
  }
}

function rowToEvent(r: any): BosEvent {

  let extra: Record<string, unknown> = {}
  if (r.data) {
    try { extra = typeof r.data === 'string' ? JSON.parse(r.data) : r.data } catch { extra = {} }
  }

  const str = (v: unknown, fb = '') => (v === null || v === undefined || v === '' ? fb : String(v))
  const num = (v: unknown, fb = 0) => (v === null || v === undefined || v === '' ? fb : Number(v) || fb)
  const e = extra as Record<string, unknown>
  return {
    ...(extra as object),
    id: String(r.id),
    slug: str(r.slug, str(e.slug)),
    title: str(r.title, str(e.title)),
    tagline: str(r.tagline, str(e.tagline)),
    description: str(r.description, str(e.description)),
    date: str(r.date, str(e.date)).slice(0, 10),
    time: str(r.time, str(e.time)),
    endTime: str(r.end_time, str(e.endTime)),
    timezone: str(r.timezone, str(e.timezone) || 'UTC'),
    format: str(r.format, str(e.format) || 'online'),
    capacity: num(r.capacity, num(e.capacity)),
    price: num(r.price, num(e.price)),
    currency: str(r.currency, str(e.currency) || 'USD'),
    coverImage: str(r.cover_image, str(e.coverImage)),
    thumbnailImage: str(r.thumbnail_image, str(e.thumbnailImage)),
    status: (r.status ?? e.status ?? 'draft') as BosEvent['status'],
    location: str(r.location, str(e.location)),
    locationName: str(r.location_name, str(e.locationName)),

    ...(Array.isArray(r.agenda) && r.agenda.length ? { agenda: r.agenda } : {}),
    ...(Array.isArray(r.faq) && r.faq.length ? { faq: r.faq } : {}),
    ...(Array.isArray(r.speakers) && r.speakers.length ? { speakers: r.speakers } : {}),
  } as BosEvent
}

export async function hydrateEvents(): Promise<boolean> {
  return (await hydrateEventsDetailed()).ok
}

export async function hydrateEventsDetailed(): Promise<{ ok: boolean; reason?: string; events: number; attendees: number }> {
  if (typeof window === 'undefined') return { ok: false, reason: 'Not in a browser', events: 0, attendees: 0 }
  try {
    const res = await fetch('/api/os-data?parts=events', { cache: 'no-store' })
    if (!res.ok) {
      return {
        ok: false,
        events: 0, attendees: 0,
        reason: res.status === 401 || res.status === 403
          ? 'Not signed in as admin. Sign out and back in, then try again.'
          : `The server answered ${res.status}.`,
      }
    }
    const json = await res.json()
    if (!json?.ok) {
      return { ok: false, reason: json?.error ? String(json.error) : 'The server did not return data.', events: 0, attendees: 0 }
    }
    let events = 0, attendees = 0
    if (Array.isArray(json.events)) { save(EVENTS_KEY, json.events.map(rowToEvent)); events = json.events.length }
    if (Array.isArray(json.eventAttendees)) { save(ATTENDEES_KEY, json.eventAttendees.map(rowToAttendee)); attendees = json.eventAttendees.length }
    if (!Array.isArray(json.events) && !Array.isArray(json.eventAttendees)) {
      return { ok: false, reason: 'The response carried no events or attendees.', events: 0, attendees: 0 }
    }
    return { ok: true, events, attendees }
  } catch (err) {
    return {
      ok: false,
      events: 0, attendees: 0,
      reason: err instanceof Error ? err.message : 'The request could not be made.',
    }
  }
}
