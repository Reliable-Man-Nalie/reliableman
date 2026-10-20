import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Row = {
  visitor_id: string | null
  funnel_id: string | null
  step: string | null
  path: string | null
  referrer: string | null
  created_at: string | null
}

function sourceOf(referrer: string | null): string {
  const r = (referrer ?? '').trim()
  if (!r) return 'Direct'
  try {
    const host = new URL(r).hostname.replace(/^www\./, '')
    if (host.includes('facebook') || host.includes('fb.')) return 'Facebook'
    if (host.includes('instagram')) return 'Instagram'
    if (host.includes('google')) return 'Google'
    if (host.includes('linkedin')) return 'LinkedIn'
    if (host.includes('youtube') || host.includes('youtu.be')) return 'YouTube'
    if (host.includes('whatsapp')) return 'WhatsApp'
    if (host.includes('tiktok')) return 'TikTok'
    if (host.includes('example')) return 'On site'
    return host
  } catch {
    return 'Other'
  }
}

const dayKey = (iso: string) => iso.slice(0, 10)

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: 'Analytics store not configured' }, { status: 200 })
  }

  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 30))
  const sinceMs = Date.now() - days * 86_400_000
  const since = new Date(sinceMs).toISOString()

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)

    const { data, error } = await sb
      .from('funnel_events')
      .select('visitor_id, funnel_id, step, path, referrer, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20000)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    }

    const rows = (data ?? []) as Row[]

    const visitors = new Set<string>()
    const byDayVisitors = new Map<string, Set<string>>()
    const byDayViews = new Map<string, number>()
    const byPath = new Map<string, { views: number; visitors: Set<string> }>()
    const bySource = new Map<string, Set<string>>()
    const byFunnel = new Map<string, { views: Set<string>; clicks: number; leads: number; purchases: number }>()

    let pageViews = 0, leads = 0, purchases = 0

    for (const r of rows) {
      const vid = r.visitor_id || ''
      const day = dayKey(r.created_at ?? '')
      if (vid) visitors.add(vid)

      if (day) {
        if (!byDayVisitors.has(day)) byDayVisitors.set(day, new Set())
        if (vid) byDayVisitors.get(day)!.add(vid)
      }

      if (r.step === 'view') {
        pageViews++
        if (day) byDayViews.set(day, (byDayViews.get(day) ?? 0) + 1)

        const p = (r.path || '/').split('?')[0]
        if (!byPath.has(p)) byPath.set(p, { views: 0, visitors: new Set() })
        const entry = byPath.get(p)!
        entry.views++
        if (vid) entry.visitors.add(vid)

        const src = sourceOf(r.referrer)
        if (!bySource.has(src)) bySource.set(src, new Set())
        if (vid) bySource.get(src)!.add(vid)
      }

      if (r.step === 'lead') leads++
      if (r.step === 'purchase') purchases++

      const fid = r.funnel_id || 'unknown'
      if (!byFunnel.has(fid)) byFunnel.set(fid, { views: new Set(), clicks: 0, leads: 0, purchases: 0 })
      const f = byFunnel.get(fid)!
      if (r.step === 'view' && vid) f.views.add(vid)
      if (r.step === 'click') f.clicks++
      if (r.step === 'lead') f.leads++
      if (r.step === 'purchase') f.purchases++
    }

    const series: Array<{ day: string; visitors: number; views: number }> = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(sinceMs + (days - 1 - i) * 86_400_000)
      const k = d.toISOString().slice(0, 10)
      series.push({ day: k, visitors: byDayVisitors.get(k)?.size ?? 0, views: byDayViews.get(k) ?? 0 })
    }

    const topPages = [...byPath.entries()]
      .map(([path, v]) => ({ path, views: v.views, visitors: v.visitors.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8)

    const sources = [...bySource.entries()]
      .map(([source, set]) => ({ source, visitors: set.size }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 6)

    const funnels = [...byFunnel.entries()]
      .map(([funnelId, f]) => {
        const v = f.views.size
        return {
          funnelId,
          visitors: v,
          clicks: f.clicks,
          leads: f.leads,
          purchases: f.purchases,

          conversion: v > 0 ? Math.round((f.leads / v) * 1000) / 10 : 0,
        }
      })
      .filter(f => f.visitors > 0 || f.leads > 0)
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 8)

    return NextResponse.json({
      ok: true,
      days,
      totals: {
        visitors: visitors.size,
        pageViews,
        leads,
        purchases,
        conversion: visitors.size > 0 ? Math.round((leads / visitors.size) * 1000) / 10 : 0,
      },
      series,
      topPages,
      sources,
      funnels,

      capped: rows.length >= 20000,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Could not read traffic' },
      { status: 200 },
    )
  }
}
