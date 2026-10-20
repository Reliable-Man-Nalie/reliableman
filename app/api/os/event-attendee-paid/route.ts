import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest, verifySessionToken, SESSION_COOKIE } from '@/lib/auth'
import { serviceDb, NO_DB } from '@/lib/os-supabase'
import { markSeatPaid } from '@/lib/event-mark-paid'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const db = await serviceDb()
  if (!db) return NextResponse.json(NO_DB, { status: 503 })

  const body = await req.json().catch(() => ({})) as { attendeeId?: string; action?: string }
  const id = String(body.attendeeId || '')
  if (!id) return NextResponse.json({ ok: false, error: 'attendeeId required' }, { status: 400 })

  const { data: seat, error } = await db.from('event_attendees')
    .select('id, ticket_code, paid, event_id, proof_path').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!seat) return NextResponse.json({ ok: false, error: 'Seat not found.' }, { status: 404 })

  if (body.action === 'proof') {
    if (!seat.proof_path) return NextResponse.json({ ok: false, error: 'No proof uploaded.' }, { status: 404 })
    const signed = await db.storage.from('event-proofs').createSignedUrl(String(seat.proof_path), 600)
    if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ ok: false, error: 'Could not open the proof.' }, { status: 500 })
    return NextResponse.json({ ok: true, url: signed.data.signedUrl })
  }

  if (seat.paid) return NextResponse.json({ ok: true, already: true })
  const { data: ev } = await db.from('events').select('price').eq('id', seat.event_id).maybeSingle()
  const amount = Number(ev?.price) || 0

  if (!seat.ticket_code) {

    const r = await db.from('event_attendees').update({ paid: true, paid_at: new Date().toISOString(), paid_amount: amount }).eq('id', id)
    if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, emailSent: false })
  }

  const who = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null)
  const r = await markSeatPaid(db, { ticketCode: String(seat.ticket_code), amount, via: 'bank-manual', ref: { markedBy: who?.email || null } })
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 })
  return NextResponse.json({ ok: true, emailSent: r.turned ? r.emailSent : false })
}
