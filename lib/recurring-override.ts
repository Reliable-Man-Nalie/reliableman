import type { InvoiceLineItem, RecurringOverride } from './crm-types'

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return key
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function upcomingMonthKeys(billingDay: number, count = 6, now = new Date()): string[] {
  const day = billingDay === 15 ? 15 : 1
  const first = new Date(now.getFullYear(), now.getMonth(), day)
  const startOffset = first.getTime() <= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() ? 1 : 0
  return Array.from({ length: count }, (_, i) =>
    monthKey(new Date(now.getFullYear(), now.getMonth() + startOffset + i, 1)),
  )
}

export function billingMonthOf(created: string | Date, leadDays: number): string {
  const t = typeof created === 'string' ? Date.parse(created) : created.getTime()
  if (!Number.isFinite(t)) return ''
  return new Date(t + leadDays * 86_400_000).toISOString().slice(0, 7)
}

export function liveOverrides(
  overrides: Record<string, RecurringOverride> | undefined,
  now = new Date(),
): [string, RecurringOverride][] {
  const cutoff = monthKey(now)
  return Object.entries(overrides ?? {})
    .filter(([k, v]) => k >= cutoff && v && Number.isFinite(v.amount))
    .sort(([a], [b]) => (a < b ? -1 : 1))
}

export function applyOverride(
  items: InvoiceLineItem[],
  taxRate: number | null | undefined,
  override: RecurringOverride | undefined,
  fallbackName: string,
): { items: InvoiceLineItem[]; taxes: number } {
  const rate = Number(taxRate) || 0
  if (!override || !Number.isFinite(override.amount) || override.amount < 0) {
    const sub = items.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.price) || 0), 0)
    return { items, taxes: Math.round(sub * rate) / 100 }
  }
  const name = items[0]?.name?.trim() || fallbackName
  const line: InvoiceLineItem = {
    id: items[0]?.id ?? 'override',
    name,
    description: override.note?.trim() || undefined,
    quantity: 1,
    price: override.amount,
  }
  return { items: [line], taxes: Math.round(override.amount * rate) / 100 }
}
