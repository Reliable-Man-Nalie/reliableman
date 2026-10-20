import { TEMPLATES } from '@/lib/proposal-templates'
import type { Currency, Offer } from '@/lib/crm-types'

export type CatalogItem = {
  key: string
  group: 'Sessions' | 'Proposals' | 'Offers'
  name: string
  description: string
  price: number
  currency: Currency

  suffix?: string
}

export const STRATEGY_SESSION = {
  title: 'Strategy Session',
  price: 250,
  introDiscount: 100,
  line: {
    name: 'Strategy Session, 90 minutes',
    description: 'A 90 minute deep dive into your business and questions. We set up the systems you need together and you leave with a written blueprint and plan.',
  },
  note: 'This covers one 90 minute session and the written blueprint. Anything beyond the session is billed separately. Once paid, your session date is confirmed.',
}

export const CATALOG_GROUPS = ['Sessions', 'Proposals', 'Offers'] as const

export function buildCatalog(offers: Offer[]): CatalogItem[] {
  const items: CatalogItem[] = [
    { key: 'strategy', group: 'Sessions', ...STRATEGY_SESSION.line, price: STRATEGY_SESSION.price, currency: 'USD' },
    { key: 'strategy-intro', group: 'Sessions', name: 'Introductory price', description: 'First session rate', price: -STRATEGY_SESSION.introDiscount, currency: 'USD' },
  ]
  for (const t of TEMPLATES) {
    const first = t.schedule[0]
    if (!first || !(first.amount > 0)) continue
    const instalments = t.schedule.length > 1
    items.push({
      key: `tpl:${t.id}`,
      group: 'Proposals',
      name: instalments && first.label ? `${t.offerName || t.name}, ${first.label}` : (t.offerName || t.name),
      description: t.tagline,
      price: first.amount,
      currency: t.currency,
    })
  }
  for (const o of offers) {
    if (!o.active || !(o.price > 0)) continue
    items.push({
      key: `offer:${o.id}`,
      group: 'Offers',
      name: o.name,
      description: o.tagline?.trim() || o.services.filter(Boolean).slice(0, 3).join(', '),
      price: o.price,
      currency: o.currency,
      suffix: o.billingType === 'monthly' ? '/mo' : undefined,
    })
  }

  const seen = new Set<string>()
  return items.filter(i => {
    const k = i.name.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
