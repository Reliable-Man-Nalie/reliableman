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
  if (!(await isBoardRequest(req))) return NextResponse.json({ accounts: [] }, { status: 401 })
  const db = sb()
  if (!db) return NextResponse.json({ accounts: [], error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })
  const { data, error } = await db.from('business_accounts').select('*').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ accounts: [] })
  return NextResponse.json({ accounts: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isBoardRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { accounts, deletedIds } = await req.json()
  if (!Array.isArray(accounts)) return NextResponse.json({ ok: false }, { status: 400 })

  const db = sb()
  if (!db) return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })
  const { error } = await db.from('business_accounts').upsert(accounts, { onConflict: 'id' })
  if (error) return NextResponse.json({ ok: false, detail: error.message }, { status: 500 })

  if (Array.isArray(deletedIds) && deletedIds.length > 0) {
    const ids = deletedIds.filter((x): x is string => typeof x === 'string').slice(0, 200)
    if (ids.length > 0) {
      const { error: delErr } = await db.from('business_accounts').delete().in('id', ids)
      if (delErr) return NextResponse.json({ ok: false, detail: delErr.message }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
