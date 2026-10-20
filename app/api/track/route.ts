import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const STEPS = new Set(['view', 'click', 'lead', 'purchase'])
const cap = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : null)

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const step = typeof body.step === 'string' ? body.step : ''
    const funnelId = cap(body.funnelId, 60)
    if (!STEPS.has(step) || !funnelId) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ ok: true }) // no store, no-op

    const sb = createClient(url, key)
    await sb.from('funnel_events').insert({
      id: crypto.randomUUID(),
      visitor_id: cap(body.visitorId, 60),
      funnel_id: funnelId,
      step,
      path: cap(body.path, 300),
      referrer: cap(body.referrer, 300),
      created_at: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // never surface tracking errors
  }
}
