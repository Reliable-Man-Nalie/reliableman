import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isBoardRequest } from '@/lib/auth'

export const runtime = 'nodejs'

function sb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key)
}

export async function GET(req: NextRequest) {
  if (!(await isBoardRequest(req))) return NextResponse.json({ tasks: [] }, { status: 401 })
  const db = sb()
  if (!db) return NextResponse.json({ tasks: [], error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })
  const { data, error } = await db.from('tasks').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ tasks: [] })
  return NextResponse.json({ tasks: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isBoardRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { tasks, deletedIds } = await req.json()
  if (!Array.isArray(tasks)) return NextResponse.json({ ok: false }, { status: 400 })

  const db = sb()
  if (!db) return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })

  let rows = tasks as Record<string, unknown>[]
  const dropped: string[] = []
  let { error } = await db.from('tasks').upsert(rows, { onConflict: 'id' })
  for (let attempt = 0; attempt < 4 && error; attempt++) {
    const missing = /'([^']+)' column/.exec(error.message)?.[1]
    if (!missing || !rows.some(r => missing in r)) break
    console.error(`tasks-sync: tasks.${missing} does not exist. Saving without it; a Supabase migration is pending.`)
    dropped.push(missing)
    rows = rows.map(r => {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(r)) if (k !== missing) out[k] = r[k]
      return out
    })
    ;({ error } = await db.from('tasks').upsert(rows, { onConflict: 'id' }))
  }

  if (error) return NextResponse.json({ ok: false, error: error.message, detail: error.message }, { status: 500 })

  if (Array.isArray(deletedIds) && deletedIds.length > 0) {
    const ids = deletedIds.filter((x): x is string => typeof x === 'string').slice(0, 200)
    if (ids.length > 0) {
      const { error: delErr } = await db.from('tasks').delete().in('id', ids)
      if (delErr) return NextResponse.json({ ok: false, detail: delErr.message }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true, ...(dropped.length ? { dropped } : {}) })
}
