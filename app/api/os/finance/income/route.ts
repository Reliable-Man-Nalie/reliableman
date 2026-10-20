import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'
import { serviceDb, NO_DB } from '@/lib/os-supabase'
import { buildPaymentsFeed } from '@/lib/payments-feed'
import { buildIncome } from '@/lib/finance-income'
import { readOverrides, SETTINGS_TABLE, OVERRIDES_ID } from '@/lib/finance-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CURRENCIES = new Set(['USD', 'EUR', 'AWG'])

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const db = await serviceDb()
  const [feed, ov] = await Promise.all([buildPaymentsFeed(db), readOverrides(db)])
  return NextResponse.json({
    ok: true,
    rows: buildIncome(feed.rows, ov.o),
    stripe: feed.stripe,
    stripeError: feed.stripeError,
    database: feed.database,
    overridesReady: ov.ready,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const db = await serviceDb()
  if (!db) return NextResponse.json(NO_DB, { status: 503 })
  const b = await req.json().catch(() => ({})) as {
    action?: string; id?: string; on?: boolean
    name?: string; email?: string; what?: string; amount?: number | string; currency?: string; date?: string
  }

  if (b.action === 'exclude' || b.action === 'include' || b.action === 'count-both') {
    const id = String(b.id || '').slice(0, 200)
    if (!id) return NextResponse.json({ ok: false, error: 'Which payment?' }, { status: 400 })
    const cur = await readOverrides(db)
    if (!cur.ready) {
      return NextResponse.json({ ok: false, error: 'Run supabase/RUN-THIS-2026-10-14-finance.sql first, so this choice can be saved.' }, { status: 409 })
    }
    const excluded = new Set(cur.o.excluded)
    const countBoth = new Set(cur.o.countBoth)
    if (b.action === 'exclude') excluded.add(id)
    if (b.action === 'include') excluded.delete(id)
    if (b.action === 'count-both') { if (b.on) countBoth.add(id); else countBoth.delete(id) }
    const { error } = await db.from(SETTINGS_TABLE).upsert({
      id: OVERRIDES_ID,
      data: { excluded: [...excluded], countBoth: [...countBoth] },
      updated_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'add') {
    const name = String(b.name || '').trim().slice(0, 120)
    const what = String(b.what || '').trim().slice(0, 200)
    const amount = Math.round(Number(b.amount) * 100) / 100
    const currency = String(b.currency || 'USD').toUpperCase()
    const date = String(b.date || '')
    if (!name) return NextResponse.json({ ok: false, error: 'Who paid?' }, { status: 400 })
    if (!what) return NextResponse.json({ ok: false, error: 'What was it for?' }, { status: 400 })
    if (!(amount > 0)) return NextResponse.json({ ok: false, error: 'Type the amount.' }, { status: 400 })
    if (!CURRENCIES.has(currency)) return NextResponse.json({ ok: false, error: 'Pick USD, EUR or AWG.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, error: 'Pick the date the money came in.' }, { status: 400 })

    const paidAt = new Date(`${date}T12:00:00`)
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 86_400_000) {
      return NextResponse.json({ ok: false, error: 'That date is in the future.' }, { status: 400 })
    }
    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    const number = `INC-${date.replace(/-/g, '')}-${id.slice(0, 4).toUpperCase()}`
    const { error } = await db.from('invoices').insert({
      id, number,
      client_name: name,
      client_email: String(b.email || '').trim().slice(0, 200),
      project_title: what,
      line_items: [{ description: what, quantity: 1, price: amount }],
      currency,
      status: 'paid',
      amount_paid: amount,
      issue_date: date,
      due_date: date,
      paid_at: paidAt.toISOString(),
      sent_at: paidAt.toISOString(),
      created_at: now,
      notes: 'Recorded from Finance: money that came in without an invoice.',
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id, number })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
