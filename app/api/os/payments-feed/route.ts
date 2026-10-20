import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'
import { serviceDb } from '@/lib/os-supabase'
import { buildPaymentsFeed } from '@/lib/payments-feed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const feed = await buildPaymentsFeed(await serviceDb())
  return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store' } })
}
