const ABC_ZONES: { tz: string; label: string }[] = []

const INTERNATIONAL_ZONES: { tz: string; label: string }[] = []

function zonesFor(timeZone: string) {
  return timeZone === 'UTC' ? ABC_ZONES : INTERNATIONAL_ZONES
}

function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 60 + Number(m[3]))
}

export function eventInstant(dateISO: string, time: string, timeZone: string): Date | null {
  if (!dateISO || !time || !/^\d{2}:\d{2}$/.test(time)) return null
  const guess = new Date(`${dateISO}T${time}:00Z`)
  if (Number.isNaN(guess.getTime())) return null
  return new Date(guess.getTime() - zoneOffsetMinutes(timeZone, guess) * 60_000)
}

function formatIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
}

export interface ZoneTime {
  label: string

  range: string
}

export function eventTimesAcrossZones(
  dateISO: string,
  time: string,
  endTime: string | undefined,
  timeZone: string,
): ZoneTime[] {
  const start = eventInstant(dateISO, time, timeZone)
  if (!start) return []
  const end = endTime ? eventInstant(dateISO, endTime, timeZone) : null
  return zonesFor(timeZone).map(zone => ({
    label: zone.label,
    range: end ? `${formatIn(start, zone.tz)} – ${formatIn(end, zone.tz)}` : formatIn(start, zone.tz),
  }))
}

export function eventTimeLine(dateISO: string, time: string, timeZone: string): string {
  const start = eventInstant(dateISO, time, timeZone)
  if (!start) return ''
  return zonesFor(timeZone).map(zone => `${formatIn(start, zone.tz)} ${zone.label}`).join(' · ')
}

export function eventTimeRangesLine(
  dateISO: string,
  time: string,
  endTime: string | undefined,
  timeZone: string,
): string {
  return eventTimesAcrossZones(dateISO, time, endTime, timeZone)
    .map(z => `${z.label} ${z.range}`)
    .join(' · ')
}
