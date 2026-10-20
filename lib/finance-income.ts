import type { PaymentRow } from '@/lib/payments-feed'

export type IncomeKind = 'invoice' | 'event' | 'program' | 'stripe'

export interface IncomeRow {
  id: string
  at: string
  amount: number          // net of refunds, in its own currency
  currency: string
  kind: IncomeKind
  what: string
  name: string
  email: string
  method: string          // "Visa •••• 4242", "Bank transfer", "Recorded paid in invoices"
  code: string
  linkUrl?: string
  stripeUrl?: string
  counted: boolean

  note?: string

  dupOf?: string
}

export interface IncomeOverrides {

  excluded: string[]

  countBoth: string[]
}

export const NO_OVERRIDES: IncomeOverrides = { excluded: [], countBoth: [] }

function kindOf(r: PaymentRow): IncomeKind {
  if (r.source === 'invoice') return 'invoice'
  if (r.source === 'event') return 'event'
  if (r.source === 'program') return 'program'
  return 'stripe'
}

const DAY = 86_400_000
const MATCH_DAYS = 21

function sameMoney(a: IncomeRow, b: IncomeRow): boolean {
  if (a.currency !== b.currency) return false
  const tolerance = Math.max(1, Math.min(a.amount, b.amount) * 0.01)
  if (Math.abs(a.amount - b.amount) > tolerance) return false
  const days = Math.abs(new Date(a.at).getTime() - new Date(b.at).getTime()) / DAY
  if (!(days <= MATCH_DAYS)) return false
  const ea = a.email.trim().toLowerCase()
  const eb = b.email.trim().toLowerCase()
  if (ea && eb && ea !== eb) return false
  return true
}

export function buildIncome(rows: PaymentRow[], overrides: IncomeOverrides = NO_OVERRIDES): IncomeRow[] {
  const excluded = new Set(overrides.excluded)
  const countBoth = new Set(overrides.countBoth)

  const out: IncomeRow[] = []
  for (const r of rows) {
    if (r.status === 'failed' || r.status === 'refunded') continue

    if (r.stripeUrl?.includes('/test/')) continue
    const amount = Math.round((r.amount - (r.refunded || 0)) * 100) / 100
    if (!(amount > 0)) continue // free seats, Circle seats, full refunds
    out.push({
      id: r.id, at: r.at, amount, currency: (r.currency || 'USD').toUpperCase(),
      kind: kindOf(r), what: r.what, name: r.name, email: r.email,
      method: r.methodDetail, code: r.code, linkUrl: r.linkUrl, stripeUrl: r.stripeUrl,
      counted: true,
    })
  }

  const invoices = out.filter(r => r.kind === 'invoice' && r.id.startsWith('inv-'))
  const used = new Set<string>()
  for (const s of out) {
    if (s.kind !== 'stripe') continue
    const twin = invoices.find(i => !used.has(i.id) && sameMoney(s, i))
    if (!twin) continue
    used.add(twin.id)
    s.dupOf = twin.id
    if (!countBoth.has(s.id)) {
      s.counted = false
      s.note = `Probably the same money as ${twin.what}, so it is counted once.`
    }
  }

  for (const r of out) {
    if (excluded.has(r.id)) {
      r.counted = false
      r.note = 'Left out by you: not business income.'
    }
  }

  out.sort((a, b) => b.at.localeCompare(a.at))
  return out
}

export const INCOME_KIND_LABEL: Record<IncomeKind, string> = {
  invoice: 'Invoices',
  event: 'Event tickets',
  program: 'Courses and programs',
  stripe: 'Other Stripe payments',
}
