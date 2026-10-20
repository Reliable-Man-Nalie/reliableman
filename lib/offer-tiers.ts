export interface OfferFunnel {
  label: string
  url: string
  note?: string        // team comment on this creative (shown/edited in the funnel list tab)
  ownerScore?: number
  partnerScore?: number
}

export interface OfferTier {
  id: string          // stable key (also the Supabase primary key)
  level: number       // 0 = bottom of the ladder (free) … higher = more premium
  name: string
  price: string       // display string: 'Free', '$9', '$150', '$5K+'
  priceNote?: string  // e.g. 'later $297'
  headline: string    // the promise, used as the landing-page headline
  subheadline: string
  cta: string
  owner?: string      // who delivers it
  color: string
  href?: string       // where this tier's landing page lives (if any)
  active: boolean
  description?: string      // longer offer description (for the card + proposals)
  included?: string[]       // what's included, one line per item
  funnels?: OfferFunnel[]   // every live funnel/landing page driving this offer
  stripePriceId?: string    // Stripe Price id (price_...) this offer checks out with
  stripeMode?: 'payment' | 'subscription'  // one-time vs recurring
  programId?: string        // Member area program this purchase enrolls the buyer into (prog-...)

  programIds?: string[]

  bumpPriceId?: string      // Stripe Price id of the add-on
  bumpProgramId?: string    // Member area program the add-on enrolls (prog-...)
}

export const DEFAULT_TIERS: OfferTier[] = [
  {
    id: 'event-free', level: 0, name: 'Free Live Event', price: 'Free',
    headline: 'A free live session',
    subheadline: 'Meet the group, learn one thing, and hear how the program works.',
    cta: 'Save my seat', color: '#94a3b8', href: '/events', active: true,
  },
  {
    id: 'group', level: 1, name: 'Group Coaching', price: '',
    headline: 'Group Coaching',
    subheadline: 'Edit this offer in Offers: price, what is included and the Stripe price id.',
    cta: 'Apply', color: '#7c3aed', active: true, stripeMode: 'payment',
  },
  {
    id: 'group-premium', level: 2, name: 'Group Coaching Premium', price: '',
    headline: 'Group Coaching Premium',
    subheadline: 'Everything in Group Coaching plus the premium extras. Edit this in Offers.',
    cta: 'Apply', color: '#bd7f06', active: true, stripeMode: 'payment',
  },
]

const KEY = 'bos_offer_tiers'

function backfillFunnels(tiers: OfferTier[]): OfferTier[] {
  const byId = new Map(DEFAULT_TIERS.map(d => [d.id, d]))
  return tiers.map(t => {
    const d = byId.get(t.id)
    if (!d) return t
    let funnels = t.funnels
    if (d.funnels?.length) {
      const have = new Set((t.funnels ?? []).map(f => f.url))
      const missing = d.funnels.filter(f => f.url && !have.has(f.url))
      if (missing.length) funnels = [...(t.funnels ?? []), ...missing]
    }
    const programId = !t.programId && d.programId ? d.programId : t.programId
    const bumpPriceId = !t.bumpPriceId && d.bumpPriceId ? d.bumpPriceId : t.bumpPriceId
    const bumpProgramId = !t.bumpProgramId && d.bumpProgramId ? d.bumpProgramId : t.bumpProgramId

    const programIds = (!t.programIds || t.programIds.length === 0) && d.programIds?.length ? d.programIds : t.programIds
    return funnels === t.funnels && programId === t.programId && bumpPriceId === t.bumpPriceId && bumpProgramId === t.bumpProgramId && programIds === t.programIds
      ? t : { ...t, funnels, programId, bumpPriceId, bumpProgramId, programIds }
  })
}

export function getTiers(): OfferTier[] {
  if (typeof window === 'undefined') return DEFAULT_TIERS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_TIERS
    const stored = JSON.parse(raw) as OfferTier[]

    const byId = new Map(stored.map(t => [t.id, t]))
    for (const d of DEFAULT_TIERS) if (!byId.has(d.id)) byId.set(d.id, d)
    return backfillFunnels(Array.from(byId.values())).sort((a, b) => a.level - b.level)
  } catch {
    return DEFAULT_TIERS
  }
}

function syncTier(t: OfferTier): void {
  try {
    fetch('/api/os-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'upsert', table: 'offer_tiers', row: {
          id: t.id, level: t.level, name: t.name, price: t.price, price_note: t.priceNote ?? '',
          headline: t.headline, subheadline: t.subheadline, cta: t.cta, owner: t.owner ?? '',
          color: t.color, href: t.href ?? '', active: t.active,
          description: t.description ?? '', included: t.included ?? [],
          funnels: t.funnels ?? [],
          stripe_price_id: t.stripePriceId ?? '', stripe_mode: t.stripeMode ?? '',
          program_id: t.programId ?? '',
          program_ids: t.programIds ?? [],
          updated_at: new Date().toISOString(),
        },
      }),
    }).catch(() => {})
  } catch { /* best effort */ }
}

export function saveTiers(tiers: OfferTier[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(tiers))
  window.dispatchEvent(new Event('bos:tiers'))
  for (const t of tiers) syncTier(t)
}

export async function getTiersServer(): Promise<OfferTier[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return DEFAULT_TIERS
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const { data } = await sb.from('offer_tiers').select('*')
    if (!data || !data.length) return DEFAULT_TIERS
    const rows: OfferTier[] = data.map(r => ({
      id: r.id, level: r.level ?? 0, name: r.name ?? '', price: r.price ?? '', priceNote: r.price_note || undefined,
      headline: r.headline ?? '', subheadline: r.subheadline ?? '', cta: r.cta ?? '', owner: r.owner || undefined,
      color: r.color ?? '#bd7f06', href: r.href || undefined, active: r.active ?? true,
      description: r.description || undefined, included: Array.isArray(r.included) ? r.included : undefined,
      funnels: Array.isArray(r.funnels) ? r.funnels : undefined,
      stripePriceId: r.stripe_price_id || undefined, stripeMode: (r.stripe_mode as OfferTier['stripeMode']) || undefined,
      programId: r.program_id || undefined,
      programIds: Array.isArray(r.program_ids) && r.program_ids.length ? r.program_ids as string[] : undefined,
    }))

    const byId = new Map(rows.map(t => [t.id, t]))
    for (const d of DEFAULT_TIERS) if (!byId.has(d.id)) byId.set(d.id, d)
    return backfillFunnels(Array.from(byId.values())).sort((a, b) => a.level - b.level)
  } catch {
    return DEFAULT_TIERS
  }
}

export async function getTierServer(id: string): Promise<OfferTier> {
  const tiers = await getTiersServer()
  return tiers.find(t => t.id === id) ?? DEFAULT_TIERS.find(t => t.id === id) ?? DEFAULT_TIERS[0]
}
