'use client'
import { BRAND } from '@/lib/brand'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getEvents, createEvent, deleteEvent, updateEvent, duplicateEvent, getAttendees, hydrateEvents, hydrateEventsDetailed } from '@/lib/event-store'
import type { BosEvent, EventAttendee } from '@/lib/event-types'
import { eventImage } from '@/lib/event-images'
import { confirmAction } from '@/app/os/ConfirmHost'
import './events.css'
import EvIcon from './EvIcon'
import { copyText } from '@/lib/clipboard'

const iStyle: React.CSSProperties = { width: '100%', padding: '10px 13px', border: '1.5px solid var(--os-line)', borderRadius: 8, fontSize: 13, color: 'var(--os-text)', outline: 'none', background: 'var(--os-card)', fontFamily: 'inherit' }
const lStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }

const FORMAT_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  in_person: { bg: '#ecfeff', color: 'var(--os-good)', label: 'In Person' },
  online:    { bg: '#faf8ff', color: 'var(--os-accent)', label: 'Online' },
  hybrid:    { bg: 'var(--os-warn-soft)', color: 'var(--os-warn)', label: 'Hybrid' },
}
const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  draft:     { bg: 'var(--os-line)', color: 'var(--os-text-faint)' },
  published: { bg: 'var(--os-good-soft)', color: 'var(--os-good)' },
  completed: { bg: '#eff6ff', color: 'var(--os-accent)' },
  cancelled: { bg: 'var(--os-bad-soft)', color: 'var(--os-bad)' },
}

function NewEventModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({ title: '', date: '', format: 'in_person', locationName: '', location: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const event = createEvent({ ...form, format: form.format as BosEvent['format'] })
    router.push(`/os/events/${event.id}`)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(18,0,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', padding: 20 }}>
      <div style={{ background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--os-text)' }}>Create New Event</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--os-text-faint)' }}>✕</button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={lStyle}>Event Title *</label><input required value={form.title} onChange={set('title')} placeholder="e.g. Business Intensive" style={iStyle} /></div>
          <div><label style={lStyle}>Date *</label><input required type="date" value={form.date} onChange={set('date')} style={iStyle} /></div>
          <div>
            <label style={lStyle}>Format</label>
            <select value={form.format} onChange={set('format')} style={iStyle}>
              <option value="in_person">In Person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div><label style={lStyle}>Location Name</label><input value={form.locationName} onChange={set('locationName')} placeholder={form.format === 'online' ? 'Zoom' : 'Venue name, city'} style={iStyle} /></div>
          <div><label style={lStyle}>Address / Link</label><input value={form.location} onChange={set('location')} placeholder={form.format === 'online' ? 'https://zoom.us/j/...' : 'Full street address'} style={iStyle} /></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px', border: '1.5px solid var(--os-line)', borderRadius: 8, background: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--os-text-muted)' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '10px', background: 'linear-gradient(135deg,var(--os-accent),var(--os-accent))', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating…' : 'Create & Open Editor →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const todayStr = () => new Date().toISOString().slice(0, 10)

function daysTo(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return null
  return Math.round((Date.parse(`${date.slice(0, 10)}T12:00:00Z`) - Date.parse(`${todayStr()}T12:00:00Z`)) / 86_400_000)
}

const isPast = (e: BosEvent) => e.status === 'completed' || e.status === 'cancelled' || (!!e.date && e.date.slice(0, 10) < todayStr())

function seatsOf(e: BosEvent, list: EventAttendee[]) {
  const live = list.filter(a => a.status !== 'cancelled' && a.status !== 'waitlisted')
  const paidRows = live.filter(a => a.paid)
  const seats = e.price > 0 ? paidRows.length : live.length
  const revenue = paidRows.reduce((s, a) => s + (Number(a.paidAmount) || Number(e.price) || 0), 0)
  const unpaid = e.price > 0 ? live.length - paidRows.length : 0
  const showed = live.filter(a => a.checkedIn || a.status === 'attended').length
  return { seats, revenue, unpaid, showed }
}

const money = (n: number, cur = 'USD') => `${cur === 'EUR' ? '€' : '$'}${n.toLocaleString('en-US')}`

function countdown(d: number | null): { text: string; tone: string } | null {
  if (d === null) return null
  if (d < 0) return null
  if (d === 0) return { text: 'Today', tone: 'var(--os-bad)' }
  if (d === 1) return { text: 'Tomorrow', tone: 'var(--os-warn)' }
  return { text: `In ${d} days`, tone: d <= 7 ? 'var(--os-warn)' : 'var(--os-accent)' }
}

function startMs(e: BosEvent): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(e.date)) return null
  const [y, m, d] = e.date.slice(0, 10).split('-').map(Number)
  const [hh, mm] = (/^\d{1,2}:\d{2}/.test(e.time) ? e.time : '12:00').split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: e.timezone || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess))
    const g = (t: string) => Number(parts.find(p => p.type === t)?.value)
    const asZone = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
    return guess - (asZone - guess)
  } catch { return guess }
}

const zoneLabel = (tz: string) => (tz || 'UTC').split('/').pop()!.replace(/_/g, ' ')
const formatDate = (date: string, opts: Intl.DateTimeFormatOptions) =>
  date ? new Date(date.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }) : ''
const whereOf = (e: BosEvent) => e.format === 'online' ? (e.locationName || 'Online') : (e.locationName || e.location || 'Location to add')

function menuItems(event: BosEvent, past: boolean, h: { onDelete: () => void; onTogglePublish: () => void; onMarkPast: () => void; onDuplicate: () => void }) {
  return [
    ...(!past ? [{ label: event.status === 'published' ? 'Unpublish' : 'Publish', icon: 'ti-eye', action: h.onTogglePublish }] : []),
    { label: 'Plan the same one week later', icon: 'ti-copy-plus', action: h.onDuplicate },
    ...(!past ? [{ label: 'Mark as past', icon: 'ti-archive', action: h.onMarkPast }] : []),
    { label: 'View public page', icon: 'ti-external-link', action: () => window.open(`/events/${event.slug}`, '_blank') },
    { label: 'Copy link', icon: 'ti-copy', action: () => { void copyText(`${BRAND.website}/events/${event.slug}`) } },
    { label: 'Delete', icon: 'ti-trash', action: h.onDelete, danger: true },
  ]
}

type Handlers = { onDelete: () => void; onTogglePublish: () => void; onMarkPast: () => void; onDuplicate: () => void }

function MoreMenu({ event, past, h }: { event: BosEvent; past: boolean; h: Handlers }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function close(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    if (open) document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="evx-mini" aria-label="More actions" onClick={() => setOpen(o => !o)} style={{ color: 'var(--os-text-faint)' }}><EvIcon name="ti-dots" /></button>
      {open && (
        <div className="evx-menu">
          {menuItems(event, past, h).map(item => (
            <button key={item.label} className={item.danger ? 'is-danger' : undefined} onClick={() => { item.action(); setOpen(false) }}>
              <EvIcon name={item.icon} />{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EventCard({ event, attendees, h }: { event: BosEvent; attendees: EventAttendee[]; h: Handlers }) {
  const router = useRouter()
  const fmt = FORMAT_COLORS[event.format] ?? FORMAT_COLORS.in_person
  const past = isPast(event)
  const statusLabel = past && event.status !== 'cancelled' ? 'Past' : event.status
  const ss = STATUS_STYLES[past && event.status !== 'cancelled' ? 'completed' : event.status] ?? STATUS_STYLES.draft
  const cd = past ? null : countdown(daysTo(event.date))
  const { seats, revenue, unpaid, showed } = seatsOf(event, attendees)
  const fill = event.capacity > 0 ? Math.min(1, seats / event.capacity) : null
  const open = () => router.push(`/os/events/${event.id}`)

  return (
    <div role="button" tabIndex={0} className={`evx-card${past ? ' is-past' : ''}`} onClick={open} onKeyDown={e => { if (e.key === 'Enter') open() }}>
      <div className="evx-card-media">
        <img src={eventImage(event)} alt="" />
        {event.date && (
          <div className="evx-datechip">
            <div className="evx-datechip-m">{formatDate(event.date, { month: 'short' })}</div>
            <div className="evx-datechip-d">{formatDate(event.date, { day: 'numeric' })}</div>
          </div>
        )}
        <span className="evx-pill evx-pill-tr" style={{ color: ss.color === 'var(--os-text-faint)' ? '#5a5274' : ss.color }}>{statusLabel}</span>
        <div className="evx-card-foot-media">
          <span>{formatDate(event.date, { weekday: 'long' }) || 'No date set'}{event.time ? ` · ${event.time}` : ''}</span>
          {cd && <span className="evx-cd">{cd.text}</span>}
        </div>
      </div>
      <div className="evx-card-body">
        <div className="evx-card-title">{event.title || 'Untitled Event'}</div>
        {event.tagline && <div className="evx-card-tag">{event.tagline}</div>}
        <div className="evx-card-meta">
          <span style={{ color: fmt.color }}><EvIcon name={event.format === 'online' ? 'ti-video' : 'ti-map-pin'} />{fmt.label}</span>
          <span><EvIcon name="ti-world" />{zoneLabel(event.timezone)} time</span>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 4 }}>
          <div className="evx-seatline">
            <span>{seats}{event.capacity > 0 ? ` / ${event.capacity}` : ''} {event.price > 0 ? 'paid seats' : 'registered'}</span>
            {past && seats > 0 ? <span style={{ color: 'var(--os-text-faint)' }}>{showed} came</span> : fill !== null && <span style={{ color: 'var(--os-text-faint)' }}>{Math.round(fill * 100)}%</span>}
          </div>
          {fill !== null && <div className={`evx-bar${fill >= 0.8 ? ' is-full' : ''}`}><div style={{ width: `${Math.max(fill * 100, seats ? 3 : 0)}%` }} /></div>}
          {unpaid > 0 && <div className="evx-warn"><EvIcon name="ti-alert-circle" />{unpaid} started checkout and did not pay</div>}
        </div>
      </div>
      <div className="evx-card-foot" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="evx-price">{event.price === 0 ? 'Free' : money(event.price, event.currency)}</span>
          {revenue > 0 && <span className="evx-rev">{money(revenue, event.currency)} in</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href={`/os/events/${event.id}`} className="evx-mini">Open</Link>
          <MoreMenu event={event} past={past} h={h} />
        </div>
      </div>
    </div>
  )
}

function SeatRing({ fill }: { fill: number }) {
  const r = 34, c = 2 * Math.PI * r
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden>
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="url(#evxRing)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${c * Math.max(fill, 0.02)} ${c}`} transform="rotate(-90 42 42)" />
      <defs><linearGradient id="evxRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7cf73" /><stop offset="1" stopColor="#eaa92e" /></linearGradient></defs>
      <text x="42" y="47" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900">{Math.round(fill * 100)}%</text>
    </svg>
  )
}

function NextUp({ event, attendees, now, h }: { event: BosEvent; attendees: EventAttendee[]; now: number; h: Handlers }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const { seats, revenue, unpaid } = seatsOf(event, attendees)
  const fill = event.capacity > 0 ? Math.min(1, seats / event.capacity) : 0
  const start = startMs(event)
  const left = start && now ? Math.max(0, start - now) : null
  const cells = left === null ? null : [
    { n: Math.floor(left / 86_400_000), l: 'Days' },
    { n: Math.floor(left / 3_600_000) % 24, l: 'Hours' },
    { n: Math.floor(left / 60_000) % 60, l: 'Min' },
  ]
  const open = () => router.push(`/os/events/${event.id}`)
  const d = daysTo(event.date)
  const when = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="evx-spot" role="button" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === 'Enter') open() }}>
      <img className="evx-spot-img" src={eventImage(event)} alt="" />
      <div className="evx-spot-main">
        <span className="evx-spot-tag"><span className="evx-live-dot" />Next up · {when}{event.status !== 'published' ? ' · Draft' : ''}</span>
        <h2 className="evx-spot-title">{event.title || 'Untitled Event'}</h2>
        {event.tagline && <div className="evx-spot-tagline">{event.tagline}</div>}
        <div className="evx-meta">
          <span><EvIcon name="ti-calendar" />{formatDate(event.date, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          {event.time && <span><EvIcon name="ti-clock" />{event.time}{event.endTime ? `–${event.endTime}` : ''} {zoneLabel(event.timezone)}</span>}
          <span><EvIcon name={event.format === 'online' ? 'ti-video' : 'ti-map-pin'} />{whereOf(event)}</span>
          <span><EvIcon name="ti-ticket" />{event.price === 0 ? 'Free' : money(event.price, event.currency)}</span>
        </div>
        {cells && (
          <div className="evx-count" aria-label="Time until the event starts">
            {cells.map(c => <div key={c.l} className="evx-count-cell"><div className="evx-count-n">{String(c.n).padStart(2, '0')}</div><div className="evx-count-l">{c.l}</div></div>)}
          </div>
        )}
        <div className="evx-spot-ctas" onClick={stop}>
          <Link href={`/os/events/${event.id}`} className="evx-btn evx-btn-gold"><EvIcon name="ti-layout-dashboard" /> Open the event</Link>
          <a href={`/events/${event.slug}`} target="_blank" rel="noreferrer" className="evx-btn evx-btn-glass"><EvIcon name="ti-external-link" /> Public page</a>
          <button className="evx-btn evx-btn-glass" onClick={() => { void copyText(`${BRAND.website}/events/${event.slug}`); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>
            <EvIcon name={copied ? 'ti-check' : 'ti-link'} /> {copied ? 'Copied' : 'Copy link'}
          </button>
          {event.status !== 'published' && <button className="evx-btn evx-btn-glass" onClick={h.onTogglePublish}><EvIcon name="ti-eye" /> Publish</button>}
        </div>
      </div>
      <div className="evx-spot-side" onClick={stop}>
        <div className="evx-glass">
          <div className="evx-ring-wrap">
            <SeatRing fill={fill} />
            <div>
              <div className="evx-ring-big">{seats}{event.capacity > 0 ? ` / ${event.capacity}` : ''}</div>
              <div className="evx-ring-label">{event.price > 0 ? 'paid seats' : 'registered'}</div>
            </div>
          </div>
          <div className="evx-glass-row"><span>Ticket revenue</span><b>{money(revenue, event.currency)}</b></div>
          {event.capacity > 0 && <div className="evx-glass-row"><span>Seats still open</span><b>{Math.max(0, event.capacity - seats)}</b></div>}
          {unpaid > 0 && <div className="evx-glass-warn"><EvIcon name="ti-alert-circle" />{unpaid} started checkout and did not pay. Message them today.</div>}
        </div>
      </div>
    </div>
  )
}

type Tab = 'upcoming' | 'drafts' | 'past'
const TAB_LABEL: Record<Tab, string> = { upcoming: 'Upcoming', drafts: 'Drafts', past: 'Past events' }

export default function EventsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<BosEvent[]>([])
  const [attendees, setAttendees] = useState<EventAttendee[]>([])

  const [tab, setTab] = useState<Tab>('upcoming')
  const [showNew, setShowNew] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const [now, setNow] = useState(0)
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0)
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [])

  const reload = useCallback(() => { setEvents(getEvents()); setAttendees(getAttendees()) }, [])
  useEffect(() => {
    reload()

    void hydrateEvents().then(ok => { if (ok) reload() })
    window.addEventListener('bos:events', reload)
    return () => window.removeEventListener('bos:events', reload)
  }, [reload])

  async function syncFromCloud() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const result = await hydrateEventsDetailed()
      if (!result.ok) { setSyncMsg(`Sync failed. ${result.reason ?? 'Check the connection and try again.'}`); return }
      reload()
      const n = getEvents().length
      const a = getAttendees().length
      setSyncMsg(`${n} event${n === 1 ? '' : 's'} and ${a} attendee${a === 1 ? '' : 's'} synced`)
    } catch {
      setSyncMsg('Sync failed. Check the connection and try again.')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 5000)
    }
  }

  const byEvent = new Map<string, EventAttendee[]>()
  for (const a of attendees) { const l = byEvent.get(a.eventId); if (l) l.push(a); else byEvent.set(a.eventId, [a]) }
  const listFor = (id: string) => byEvent.get(id) ?? []

  const inTab = (e: BosEvent, t: Tab) => {
    if (t === 'upcoming') return !isPast(e)
    if (t === 'drafts') return e.status === 'draft' && !isPast(e)
    return isPast(e)
  }
  const sorted = events.filter(e => inTab(e, tab)).sort((a, b) =>
    tab === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))

  const spotlight = tab === 'upcoming' ? sorted[0] : undefined
  const filtered = spotlight ? sorted.slice(1) : sorted

  const upcoming = events.filter(e => !isPast(e))
  const upcomingSeats = upcoming.reduce((s, e) => s + seatsOf(e, listFor(e.id)).seats, 0)
  const revenue = events.reduce((s, e) => s + seatsOf(e, listFor(e.id)).revenue, 0)
  const pastWithPeople = events.filter(e => isPast(e)).map(e => seatsOf(e, listFor(e.id))).filter(x => x.seats > 0)
  const pastSeats = pastWithPeople.reduce((s, x) => s + x.seats, 0)
  const pastShowed = pastWithPeople.reduce((s, x) => s + x.showed, 0)
  const pastPeople = events.filter(e => isPast(e)).reduce((s, e) => s + listFor(e.id).filter(a => a.status !== 'cancelled').length, 0)

  const showRate = pastSeats && pastShowed ? `${Math.round((pastShowed / pastSeats) * 100)}%` : null

  async function togglePublish(e: BosEvent) {
    if (e.status !== 'published') {
      const sells = e.price > 0 ? ` It starts selling at ${money(e.price, e.currency)} the moment it is live.` : ''
      if (!(await confirmAction({ message: `Publish "${e.title}"?`, detail: `The page goes live for everyone.${sells}`, confirmLabel: 'Publish', destructive: false }))) return
    }
    void updateEvent(e.id, { status: e.status === 'published' ? 'draft' : 'published' })
  }
  async function markPast(e: BosEvent) {
    if (!(await confirmAction({ message: `Mark "${e.title}" as past?`, detail: 'It leaves the public site and stops taking registrations. Every registrant is kept, and no email is sent.', confirmLabel: 'Mark as past', destructive: false }))) return
    void updateEvent(e.id, { status: 'completed' })
  }
  function duplicate(e: BosEvent) {
    const copy = duplicateEvent(e.id, 7)
    if (copy) router.push(`/os/events/${copy.id}`)
  }
  const handlers = (event: BosEvent): Handlers => ({
    onDelete: async () => { if (await confirmAction({ message: 'Delete this event for good?', detail: 'Every attendee registered to it goes too, and this cannot be undone. "Mark as past" keeps everything instead.', confirmLabel: 'Delete for good' })) deleteEvent(event.id) },
    onTogglePublish: () => void togglePublish(event),
    onMarkPast: () => void markPast(event),
    onDuplicate: () => duplicate(event),
  })

  const kpis = [
    { label: 'Upcoming events', value: String(upcoming.length), icon: 'ti-calendar-event', tint: 'rgba(139,92,246,.14)', color: '#7C3AED' },
    { label: 'Seats taken, upcoming', value: String(upcomingSeats), icon: 'ti-ticket', tint: 'rgba(234,169,46,.16)', color: '#C27C0E' },
    { label: 'Ticket revenue, all time', value: money(revenue), icon: 'ti-cash', tint: 'var(--os-good-soft)', color: 'var(--os-good)' },
    showRate
      ? { label: 'Show rate, past events', value: showRate, icon: 'ti-user-check', tint: 'rgba(59,130,246,.14)', color: '#2563EB' }
      : { label: 'People in past events', value: String(pastPeople), icon: 'ti-users', tint: 'rgba(59,130,246,.14)', color: '#2563EB' },
  ]

  return (
    <div className="evx-page">
      <div className="evx-head">
        <div>
          <div className="evx-eyebrow">Events</div>
          <h1 className="evx-title">Fill the room. Then fill the group program.</h1>
          <div className="evx-sub">Plan the event, sell the seats, run the room, follow up.</div>
        </div>
        <div className="evx-actions">
          {syncMsg && <span style={{ fontSize: 12, color: 'var(--os-accent)', fontWeight: 600 }}>{syncMsg}</span>}
          <button className="evx-btn evx-btn-ghost" onClick={syncFromCloud} disabled={syncing}>
            <EvIcon name={syncing ? 'ti-loader-2' : 'ti-refresh'} /> {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <button className="evx-btn evx-btn-primary" onClick={() => setShowNew(true)}>
            <EvIcon name="ti-plus" /> New event
          </button>
        </div>
      </div>

      <div className="evx-kpis">
        {kpis.map(s => (
          <div key={s.label} className="evx-kpi">
            <div className="evx-kpi-icon" style={{ background: s.tint, color: s.color }}><EvIcon name={s.icon} size={20} /></div>
            <div>
              <div className="evx-kpi-n">{s.value}</div>
              <div className="evx-kpi-l">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="evx-filter">
        <div className="evx-seg" role="tablist">
          {(['upcoming', 'drafts'] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}<span className="evx-seg-n">{events.filter(e => inTab(e, t)).length}</span>
            </button>
          ))}
        </div>
        <button className="evx-past-btn" aria-pressed={tab === 'past'} onClick={() => setTab(tab === 'past' ? 'upcoming' : 'past')}>
          <EvIcon name={tab === 'past' ? 'ti-arrow-left' : 'ti-history'} />
          {tab === 'past' ? 'Back to upcoming' : `Past events (${events.filter(e => inTab(e, 'past')).length})`}
        </button>
      </div>
      {tab === 'past' && <div className="evx-section-h"><h2>Past events</h2><span>Newest first. Every registrant is kept.</span></div>}

      {spotlight && <NextUp event={spotlight} attendees={listFor(spotlight.id)} now={now} h={handlers(spotlight)} />}

      {sorted.length === 0 ? (
        <div className="evx-empty">
          <div className="evx-empty-icon"><EvIcon name="ti-calendar-plus" size={30} /></div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--os-text)', marginBottom: 8 }}>{tab === 'past' ? 'Nothing archived yet' : tab === 'drafts' ? 'No drafts' : 'Nothing coming up'}</div>
          <div style={{ fontSize: 14, color: 'var(--os-text-faint)', marginBottom: 22 }}>Plan the next room, or copy a past one from its menu.</div>
          <button className="evx-btn evx-btn-primary" onClick={() => setShowNew(true)}><EvIcon name="ti-plus" /> Plan an event</button>
        </div>
      ) : filtered.length > 0 && (
        <>
          {spotlight && <div className="evx-section-h"><h2>Coming up after that</h2><span>{filtered.length} event{filtered.length === 1 ? '' : 's'}</span></div>}
          <div className="evx-grid">
            {filtered.map(event => <EventCard key={event.id} event={event} attendees={listFor(event.id)} h={handlers(event)} />)}
          </div>
        </>
      )}

      {showNew && <NewEventModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
