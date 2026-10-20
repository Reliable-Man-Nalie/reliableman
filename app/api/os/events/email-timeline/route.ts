import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const eventId = req.nextUrl.searchParams.get('eventId') || ''
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

  const sb = serverSupabase()

  const { data: ev, error: evErr } = await sb
    .from('events')
    .select('id, title, date, time, end_time, timezone')
    .eq('id', eventId)
    .maybeSingle()
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })
  if (!ev) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  const { data: rows, error } = await sb
    .from('event_attendees')
    .select('status, reminder_sent_24, reminder_sent_10, reminder_sent_5, reminder_sent_3, reminder_sent, reminder_sent_at, followup_sent')
    .eq('event_id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const attendees = rows ?? []

  const owed = attendees.filter(a => ['registered', 'attended'].includes(String(a.status)))
  const total = owed.length

  const tz = String(ev.timezone || 'Europe/Amsterdam')
  const toInstant = (t: string) => {
    try {

      const probe = new Date(`${ev.date}T${t || '00:00'}:00Z`)
      const zoned = new Date(probe.toLocaleString('sv-SE', { timeZone: tz }) + 'Z')
      return new Date(probe.getTime() + (probe.getTime() - zoned.getTime()))
    } catch { return null }
  }
  const startAt = ev.date && ev.time ? toInstant(String(ev.time)) : null
  const endAt = ev.date && ev.end_time ? toInstant(String(ev.end_time)) : startAt

  const count = (col: string) => owed.filter(a => (a as Record<string, unknown>)[col] === true).length

  const stages = [
    { key: 'confirmation', label: 'Confirmation', when: 'At registration', dueAt: null as string | null, sent: total, total },
    ...[
      { col: 'reminder_sent_24', hours: 24, label: 'Reminder · 24h before' },
      { col: 'reminder_sent_10', hours: 10, label: 'Reminder · 10h before' },
      { col: 'reminder_sent_5', hours: 5, label: 'Reminder · 5h before' },
      { col: 'reminder_sent_3', hours: 3, label: 'Reminder · 3h before' },
      { col: 'reminder_sent', hours: 1, label: 'Reminder · 1h before' },
    ].map(s => ({
      key: s.col,
      label: s.label,
      when: `${s.hours}h before start`,
      dueAt: startAt ? new Date(startAt.getTime() - s.hours * 3600_000).toISOString() : null,
      sent: count(s.col),
      total,
    })),
    {
      key: 'followup_sent',
      label: 'Follow-up',
      when: '30 min after the end',
      dueAt: endAt ? new Date(endAt.getTime() + 30 * 60_000).toISOString() : null,
      sent: count('followup_sent'),
      total,
    },
  ]

  return NextResponse.json({
    eventId,
    title: ev.title,
    startAt: startAt?.toISOString() ?? null,
    endAt: endAt?.toISOString() ?? null,
    total,
    stages,
  })
}
