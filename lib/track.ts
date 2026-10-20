export type FunnelStep = 'view' | 'click' | 'lead' | 'purchase'

const VID_KEY = 'bos_vid'

function visitorId(): string {
  if (typeof window === 'undefined') return 'server'
  try {
    let v = localStorage.getItem(VID_KEY)
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(VID_KEY, v) }
    return v
  } catch {
    return 'anon'
  }
}

export function track(step: FunnelStep, funnelId: string): void {
  if (typeof window === 'undefined' || !funnelId) return
  const payload = JSON.stringify({
    step, funnelId, visitorId: visitorId(),
    path: window.location.pathname,
    referrer: document.referrer || null,
  })
  try {

    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
  } catch { /* tracking must never throw */ }

  try {
    const ph = (window as unknown as { posthog?: { capture: (e: string, p?: Record<string, unknown>) => void } }).posthog
    if (ph) ph.capture(`funnel_${step}`, { funnel_id: funnelId })
  } catch { /* never throw */ }
}

export function getVisitorId(): string {
  return visitorId()
}

export function leadFields(): { visitorId: string; pageUrl: string; referrer: string | null } {
  if (typeof window === 'undefined') return { visitorId: 'server', pageUrl: '', referrer: null }
  return {
    visitorId: visitorId(),
    pageUrl: window.location.pathname,
    referrer: document.referrer || null,
  }
}

export const trackView = (funnelId: string) => track('view', funnelId)
export const trackClick = (funnelId: string) => track('click', funnelId)

export const trackLead = (funnelId: string) => track('lead', funnelId)

export function trackClickHere(): void {
  if (typeof window === 'undefined') return
  const id = window.location.pathname.replace(/^\//, '').split('/')[0] || 'home'
  track('click', id)
}

export function trackLeadHere(): void {
  if (typeof window === 'undefined') return
  const id = window.location.pathname.replace(/^\//, '').split('/')[0] || 'home'
  track('lead', id)
}
