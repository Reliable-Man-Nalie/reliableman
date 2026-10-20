import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'

export const runtime = 'nodejs'

const ALLOWED = new Set(['leads', 'deals', 'proposals', 'invoices', 'clients', 'events', 'event_attendees', 'offers', 'business_expenses', 'finance_time_entries', 'offer_tiers'])

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { op, table, row, id } = body as { op?: string; table?: string; row?: Record<string, unknown>; id?: string }

  if (!table || !ALLOWED.has(table)) return NextResponse.json({ ok: false, error: 'bad table' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ ok: false, error: 'no supabase config' }, { status: 500 })

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)

    if (op === 'upsert') {
      if (!row || !row.id) return NextResponse.json({ ok: false, error: 'missing row' }, { status: 400 })
      const { error } = await sb.from(table).upsert(row, { onConflict: 'id' })
      if (error) return NextResponse.json({ ok: false, error: error.message })
      return NextResponse.json({ ok: true })
    }
    if (op === 'delete') {
      if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 })
      const { error } = await sb.from(table).delete().eq('id', id)
      if (error) return NextResponse.json({ ok: false, error: error.message })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: 'bad op' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
