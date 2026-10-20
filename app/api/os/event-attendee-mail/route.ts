import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'
import { serviceDb, NO_DB } from '@/lib/os-supabase'
import { sendEmail } from '@/lib/email'
import { isPaidEvent } from '@/lib/event-confirmation'
import {
  REMINDER_STAGES, FOLLOWUP_COL, buildMail, columnFor, dueAt, seatBlock, sequenceKinds, type MailKind,
} from '@/lib/event-attendee-mail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SEAT_COLS = 'id, name, email, notes, paid, status, ticket_code, referral_code, event_id, registered_at, reminder_sent_24, reminder_sent_10, reminder_sent_5, reminder_sent_3, reminder_sent, followup_sent'
const KINDS: MailKind[] = ['confirmation', ...REMINDER_STAGES.map(s => s.kind), 'followup']

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const db = await serviceDb()
  if (!db) return NextResponse.json(NO_DB, { status: 503 })
  const eventId = req.nextUrl.searchParams.get('eventId') || ''
  if (!eventId) return NextResponse.json({ ok: false, error: 'eventId required' }, { status: 400 })

  const { data: ev, error: evErr } = await db.from('events').select('*').eq('id', eventId).maybeSingle()
  if (evErr) return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 })
  if (!ev) return NextResponse.json({ ok: false, error: 'Event not found.' }, { status: 404 })

  const { data: rows, error } = await db.from('event_attendees').select(SEAT_COLS).eq('event_id', eventId).order('registered_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const paidEvent = isPaidEvent(ev)
  const stages = [
    { kind: 'confirmation', label: 'Confirmation', dueAt: null as string | null },
    ...REMINDER_STAGES.map(s => ({ kind: s.kind, label: s.label, dueAt: toIso(dueAt(ev, s.kind)) })),
    { kind: 'followup', label: 'Follow-up', dueAt: toIso(dueAt(ev, 'followup')) },
  ]

  const people = (rows ?? []).map(r => {
    const row = r as Record<string, unknown>
    const sent: Record<string, boolean> = {

      confirmation: paidEvent ? row.paid === true : true,
    }
    for (const s of REMINDER_STAGES) sent[s.kind] = row[s.col] === true
    sent.followup = row[FOLLOWUP_COL] === true
    return {
      id: String(row.id), name: String(row.name || ''), email: String(row.email || ''),
      paid: row.paid === true, status: String(row.status || 'registered'),
      block: seatBlock(ev, row), sent,
    }
  })

  return NextResponse.json({ ok: true, paidEvent, stages, people })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const db = await serviceDb()
  if (!db) return NextResponse.json(NO_DB, { status: 503 })

  const body = await req.json().catch(() => ({})) as { attendeeId?: string; kind?: string }
  const id = String(body.attendeeId || '')
  const kind = String(body.kind || '')
  if (!id) return NextResponse.json({ ok: false, error: 'attendeeId required' }, { status: 400 })
  if (kind !== 'sequence' && !KINDS.includes(kind as MailKind)) return NextResponse.json({ ok: false, error: 'Unknown email.' }, { status: 400 })

  const { data: seat, error } = await db.from('event_attendees').select(SEAT_COLS).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!seat) return NextResponse.json({ ok: false, error: 'Seat not found.' }, { status: 404 })
  if (!seat.email) return NextResponse.json({ ok: false, error: 'This seat has no email address.' }, { status: 400 })

  const { data: ev } = await db.from('events').select('*').eq('id', seat.event_id).maybeSingle()
  if (!ev) return NextResponse.json({ ok: false, error: 'Event not found.' }, { status: 404 })

  const block = seatBlock(ev, seat)
  if (block === 'unpaid') return NextResponse.json({ ok: false, error: 'Not paid yet. The emails carry the joining link, so they go out once the seat is paid.' }, { status: 409 })
  if (block === 'cancelled') return NextResponse.json({ ok: false, error: 'This seat is cancelled.' }, { status: 409 })

  const kinds: MailKind[] = kind === 'sequence' ? sequenceKinds(ev) : [kind as MailKind]
  const results: Array<{ kind: MailKind; sent: boolean }> = []
  for (const k of kinds) {
    const mail = buildMail(ev, seat, k)
    if (!mail) { results.push({ kind: k, sent: false }); continue }
    const ok = await sendEmail(String(seat.email), mail.subject, mail.html)
    results.push({ kind: k, sent: ok })

    const col = columnFor(k)
    if (ok && col) {
      const patch: Record<string, unknown> = { [col]: true }
      if (col.startsWith('reminder_sent')) patch.reminder_sent_at = new Date().toISOString()
      await db.from('event_attendees').update(patch).eq('id', id)
    }
    if (!ok) console.error(`[event-attendee-mail] ${seat.ticket_code || id}: ${k} NOT sent`)
  }

  const sent = results.filter(r => r.sent).length
  return NextResponse.json({ ok: sent > 0, sent, failed: results.length - sent, results, error: sent ? undefined : 'The email did not send.' })
}

function toIso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString()
}
