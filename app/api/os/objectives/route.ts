import { NextRequest, NextResponse } from 'next/server'
import { isBoardRequest } from '@/lib/auth'
import { serviceDb } from '@/lib/os-supabase'

export const runtime = 'nodejs'

const COLS = ['id', 'title', 'key_result', 'area', 'due_date', 'completed_at', 'sort_order', 'created_at'] as const
const AREAS = new Set(['niche', 'offer', 'system', 'reach'])

export async function GET(req: NextRequest) {
  if (!(await isBoardRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const db = await serviceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })
  const { data, error } = await db.from('company_objectives').select('*').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const g = await db.from('company_goal').select('*').order('created_at', { ascending: false }).limit(1)
  return NextResponse.json({ ok: true, objectives: data ?? [], goal: g.error ? undefined : (g.data?.[0] ?? null) })
}

export async function POST(req: NextRequest) {
  if (!(await isBoardRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null) as { objectives?: unknown; deletedIds?: unknown; goal?: unknown } | null
  if (!body) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })

  if (body.goal && typeof body.goal === 'object') {
    const g = body.goal as Record<string, unknown>
    if (typeof g.id !== 'string' || typeof g.title !== 'string' || !g.title.trim()) {
      return NextResponse.json({ ok: false, error: 'bad goal' }, { status: 400 })
    }
    const db = await serviceDb()
    if (!db) return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })
    const row = {
      id: g.id.slice(0, 80),
      title: g.title.trim().slice(0, 300),
      due_date: typeof g.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.due_date) ? g.due_date : null,
      created_at: typeof g.created_at === 'string' ? g.created_at : new Date().toISOString(),
    }

    const { error: delErr } = await db.from('company_goal').delete().neq('id', row.id)
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })
    const { error } = await db.from('company_goal').upsert(row, { onConflict: 'id' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!Array.isArray(body.objectives)) return NextResponse.json({ ok: true })
  }
  if (!Array.isArray(body.objectives)) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })

  const rows = (body.objectives as Record<string, unknown>[]).slice(0, 500).flatMap(r => {
    if (!r || typeof r.id !== 'string' || typeof r.title !== 'string' || !r.title.trim()) return []
    const out: Record<string, unknown> = {}
    for (const k of COLS) out[k] = r[k] ?? null
    out.title = (r.title as string).trim().slice(0, 300)
    if (typeof out.key_result === 'string') out.key_result = (out.key_result as string).slice(0, 500)
    if (out.area !== null && !AREAS.has(String(out.area))) out.area = null
    if (out.due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.due_date))) out.due_date = null
    if (!out.created_at) out.created_at = new Date().toISOString()
    out.updated_at = new Date().toISOString()
    return [out]
  })

  const db = await serviceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })
  if (rows.length) {
    const { error } = await db.from('company_objectives').upsert(rows, { onConflict: 'id' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (Array.isArray(body.deletedIds)) {
    const ids = body.deletedIds.filter((x): x is string => typeof x === 'string').slice(0, 200)
    if (ids.length) {
      const { error } = await db.from('company_objectives').delete().in('id', ids)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
