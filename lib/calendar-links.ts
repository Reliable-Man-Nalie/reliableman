import { BRAND } from '@/lib/brand'
import type { BosEvent } from './event-types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toIcalDate(dateStr: string, timeStr: string, timeZone?: string): string {
  if (!dateStr) return ''
  const naive = `${dateStr}T${timeStr || '00:00'}:00`
  let d = new Date(naive)
  if (timeZone) {
    try {
      const probe = new Date(naive + 'Z')
      const zoned = new Date(probe.toLocaleString('sv-SE', { timeZone }) + 'Z')
      d = new Date(probe.getTime() + (probe.getTime() - zoned.getTime()))
    } catch { /* fall back to the visitor's zone rather than break the link */ }
  }
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
}

export function googleCalUrl(event: BosEvent): string {
  const start = toIcalDate(event.date, event.time || '00:00', event.timezone)
  const end = toIcalDate(event.date, event.endTime || event.time || '01:00', event.timezone)
  const title = encodeURIComponent(event.title)
  const loc = encodeURIComponent(event.locationName || event.location || '')
  const desc = encodeURIComponent(
    [
      event.locationName || event.location || '',
      (event.tagline || event.description?.replace(/<[^>]+>/g, '').slice(0, 200) || ''),
    ].filter(Boolean).join('\n\n').replace(/\n/g, '\\n'),
  )
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${desc}&location=${loc}`
}

export function icalString(event: BosEvent): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
    `DTSTART:${toIcalDate(event.date, event.time || '00:00', event.timezone)}`,
    `DTEND:${toIcalDate(event.date, event.endTime || event.time || '01:00', event.timezone)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${(event.tagline || '').replace(/,/g, '\\,')}`,
    `LOCATION:${(event.locationName || event.location || '').replace(/,/g, '\\,')}`,
    `URL:${BRAND.website}/events/${event.slug}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export function googleCalendarBlockUrl(o: {
  title: string
  details?: string
  start: string
  minutes: number
  timeZone?: string
}): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(o.start)
  if (!m || !o.title.trim()) return ''
  const [, y, mo, d, h, mi] = m.map(Number)
  const mins = Math.min(Math.max(Math.round(o.minutes) || 60, 5), 24 * 60)

  const s = new Date(Date.UTC(y, mo - 1, d, h, mi))
  const e = new Date(s.getTime() + mins * 60_000)
  const fmt = (x: Date) =>
    `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00`
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: o.title.trim().slice(0, 300),
    dates: `${fmt(s)}/${fmt(e)}`,
  })
  if (o.details) q.set('details', o.details.slice(0, 1500))
  if (o.timeZone) q.set('ctz', o.timeZone)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}
