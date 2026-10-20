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
  if (!(await isBoardRequest(req))) return NextResponse.json({ columns: [] }, { status: 401 })
  const db = sb()
  if (!db) return NextResponse.json({ columns: [], error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })
  const { data, error } = await db.from('task_columns').select('*').order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ columns: [] })
  return NextResponse.json({ columns: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isBoardRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { columns, deletedIds } = await req.json()
  if (!Array.isArray(columns)) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })

  const db = sb()
  if (!db) return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })

  if (columns.length) {
    const { error } = await db.from('task_columns').upsert(columns, { onConflict: 'id' })
    if (error) return NextResponse.json({ ok: false, error: error.message, detail: error.message }, { status: 500 })
  }

  if (Array.isArray(deletedIds) && deletedIds.length > 0) {
    const ids = deletedIds.filter((x): x is string => typeof x === 'string').slice(0, 200)
    if (ids.length > 0) {
      const { error } = await db.from('task_columns').delete().in('id', ids)
      if (error) return NextResponse.json({ ok: false, error: error.message, detail: error.message }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
