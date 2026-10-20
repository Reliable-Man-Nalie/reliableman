const DEDUPE_MINUTES = 60

export function funnelIdFromPath(pageUrl: string | null | undefined, fallback?: string): string {
  const raw = String(pageUrl ?? '').trim()
  if (raw) {
    try {

      const path = raw.startsWith('http') ? new URL(raw).pathname : raw
      const seg = path.replace(/^\//, '').split('/')[0]
      if (seg) return seg.slice(0, 60)
      return 'home'
    } catch { /* fall through to the fallback */ }
  }
  return (fallback || 'unknown').slice(0, 60)
}

export async function recordFunnelLead(opts: {
  funnelId: string
  visitorId?: string | null
  path?: string | null
  referrer?: string | null
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key || !opts.funnelId) return

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const visitorId = opts.visitorId ? String(opts.visitorId).slice(0, 60) : null

    if (visitorId) {
      const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString()
      const { data: existing } = await sb
        .from('funnel_events')
        .select('id')
        .eq('visitor_id', visitorId)
        .eq('funnel_id', opts.funnelId)
        .eq('step', 'lead')
        .gte('created_at', since)
        .limit(1)
      if (existing && existing.length) return
    }

    await sb.from('funnel_events').insert({
      id: crypto.randomUUID(),
      visitor_id: visitorId,
      funnel_id: opts.funnelId,
      step: 'lead',
      path: opts.path ? String(opts.path).slice(0, 300) : null,
      referrer: opts.referrer ? String(opts.referrer).slice(0, 300) : null,
      created_at: new Date().toISOString(),
    })
  } catch {

  }
}
