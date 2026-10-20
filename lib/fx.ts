export type Money3 = 'USD' | 'EUR' | 'AWG'

export const INVOICE_CURRENCIES = ['USD', 'EUR'] as const
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number]

export function currencyOptions(current?: string): Money3[] {
  const list: Money3[] = [...INVOICE_CURRENCIES]
  if (current && !list.includes(current as Money3) && (['USD', 'EUR', 'AWG'] as const).includes(current as Money3)) {
    list.push(current as Money3)
  }
  return list
}

export const AWG_PER_USD = 1.8
export const FX_KEY = 'bos_usd_per_eur'
export const DEFAULT_USD_PER_EUR = 1.1

export function loadRate(): number {
  if (typeof window === 'undefined') return DEFAULT_USD_PER_EUR
  const raw = window.localStorage.getItem(FX_KEY)
  const n = raw ? parseFloat(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_PER_EUR
}

export function saveRate(n: number) {
  if (typeof window !== 'undefined') window.localStorage.setItem(FX_KEY, String(n))
}

export function toUsd(amount: number, currency: Money3, usdPerEur: number): number {
  if (currency === 'USD') return amount
  if (currency === 'AWG') return amount / AWG_PER_USD
  return amount * usdPerEur
}

export function toEur(amount: number, currency: Money3, usdPerEur: number): number {
  if (currency === 'EUR') return amount
  return toUsd(amount, currency, usdPerEur) / usdPerEur
}

export function convert(amount: number, from: Money3, to: Money3, usdPerEur: number): number {
  if (from === to) return amount
  const usd = toUsd(amount, from, usdPerEur)
  if (to === 'USD') return usd
  if (to === 'AWG') return usd * AWG_PER_USD
  return usd / usdPerEur
}

export function sumIn<T>(
  rows: T[],
  to: Money3,
  usdPerEur: number,
  amountOf: (row: T) => number,
  currencyOf: (row: T) => Money3,
): { total: number; currencies: Money3[]; converted: boolean } {
  const seen = new Set<Money3>()
  let total = 0
  for (const r of rows) {
    const c = currencyOf(r)
    seen.add(c)
    total += convert(amountOf(r), c, to, usdPerEur)
  }
  const currencies = [...seen]
  return { total, currencies, converted: currencies.some(c => c !== to) }
}

export const SYMBOL: Record<Money3, string> = { USD: '$', EUR: '€', AWG: 'ƒ' }
