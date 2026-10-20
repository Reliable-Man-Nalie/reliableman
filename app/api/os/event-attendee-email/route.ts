import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'
import { serviceDb, NO_DB } from '@/lib/os-supabase'
import { sendEmail } from '@/lib/email'
import { buildRegistrantConfirmation, isPaidEvent } from '@/lib/event-confirmation'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const db = await serviceDb()
  if (!db) return NextResponse.json(NO_DB, { status: 503 })

  const body = await req.json().catch(() => ({})) as { attendeeId?: string; email?: string }
  const id = String(body.attendeeId || '')
  const email = String(body.email || '').trim().toLowerCase()
  if (!id) return NextResponse.json({ ok: false, error: 'attendeeId required' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: 'That email address does not look right.' }, { status: 400 })

  const { data: seat, error } = await db.from('event_attendees')
    .select('id, name, email, notes, paid, ticket_code, event_id, referral_code').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!seat) return NextResponse.json({ ok: false, error: 'Seat not found.' }, { status: 404 })

  if (String(seat.email || '').toLowerCase() !== email) {
    const w = await db.from('event_attendees').update({ email }).eq('id', id)
    if (w.error) return NextResponse.json({ ok: false, error: w.error.message }, { status: 500 })
  }

  const { data: ev } = await db.from('events').select('*').eq('id', seat.event_id).maybeSingle()
  if (!ev) return NextResponse.json({ ok: true, sent: false, reason: 'no-event' })

  const today = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10)
  if (ev.date && String(ev.date) < today) return NextResponse.json({ ok: true, sent: false, reason: 'event-over' })
  if (isPaidEvent(ev) && !seat.paid) return NextResponse.json({ ok: true, sent: false, reason: 'unpaid' })
  if (!seat.ticket_code) return NextResponse.json({ ok: true, sent: false, reason: 'no-ticket' })

  const mail = buildRegistrantConfirmation(ev, {
    name: String(seat.name || ''),
    ticketCode: String(seat.ticket_code),
    notes: String(seat.notes || ''),
  })
  const sent = await sendEmail(email, mail.subject, mail.html)
  if (!sent) console.error(`[event-attendee-email] ${seat.ticket_code}: confirmation to the new address NOT sent`)
  return NextResponse.json({ ok: true, sent, reason: sent ? 'sent' : 'send-failed' })
}
