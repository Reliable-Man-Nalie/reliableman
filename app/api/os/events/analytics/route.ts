import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'
import { serviceDb, NO_DB } from '@/lib/os-supabase'
import { gatherEventAnalytics } from '@/lib/event-analytics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const db = await serviceDb()
  if (!db) return NextResponse.json(NO_DB, { status: 503 })
  const analytics = await gatherEventAnalytics(db, id)
  if (!analytics) return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 })
  return NextResponse.json({ ok: true, analytics })
}
