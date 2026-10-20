import type { PaymentMilestone, Proposal, Invoice, InvoiceLineItem } from './crm-types'

const RESULTS_LABEL = /^\s*(por\s+resultados?|on\s+results?|by\s+results?|per\s+results?)\b/i
const RANGE = /(\d+)\s*(?:a|to|-|–|hasta)\s*(\d+)/i

export function isEventLabel(label: string | undefined | null): boolean {
  return /^\s*(on|upon|al|a\s+la|por|tras)\s/i.test(String(label ?? ''))
}

export interface ResultsTier {

  phaseIndex: number
  from: number
  to: number

  price: number
  label: string
}

export function resultsTiers(schedule: PaymentMilestone[] | undefined | null): ResultsTier[] {
  const out: ResultsTier[] = []
  ;(schedule ?? []).forEach((m, i) => {
    if (!RESULTS_LABEL.test(m.label ?? '')) return
    const r = RANGE.exec(m.label ?? '')
    const from = r ? Number(r[1]) : 1
    const to = r ? Number(r[2]) : Infinity
    if (!(from >= 1 && to >= from) || !(m.amount >= 0)) return
    out.push({ phaseIndex: i, from, to, price: m.amount, label: m.label })
  })
  return out.sort((a, b) => a.from - b.from)
}

export function isResultsBased(p: Pick<Proposal, 'paymentSchedule'> | { paymentSchedule?: PaymentMilestone[] }): boolean {
  return resultsTiers(p.paymentSchedule).length > 0
}

export function resultsCap(schedule: PaymentMilestone[] | undefined | null): number {
  return resultsTiers(schedule).reduce((s, t) => s + (t.price > 0 ? (t.to - t.from + 1) * t.price : 0), 0)
}

export function hasCap(schedule: PaymentMilestone[] | undefined | null): boolean {
  return Number.isFinite(resultsCap(schedule))
}

export function resultsMaxClients(schedule: PaymentMilestone[] | undefined | null): number {
  return resultsTiers(schedule).reduce((m, t) => Math.max(m, t.to), 0)
}

export const COMMISSION_PHASE_BASE = 100

export function isCommissionInvoice(inv: Pick<Invoice, 'phaseIndex'>): boolean {
  return (inv.phaseIndex ?? 0) >= COMMISSION_PHASE_BASE
}

export function clientsInvoiced(proposalId: string, invoices: Invoice[]): number {
  return invoices
    .filter(i => i.proposalId === proposalId && isCommissionInvoice(i) && i.status !== 'void' && !i.deletedAt)
    .reduce((s, i) => s + i.lineItems.reduce((q, l) => q + (Number(l.quantity) || 0), 0), 0)
}

export type ProposalLang = 'en' | 'es'
export function proposalLang(p: { paymentSchedule?: PaymentMilestone[] }): ProposalLang {
  return (p.paymentSchedule ?? []).some(m => /^\s*(al|por)\s/i.test(m.label ?? '')) ? 'es' : 'en'
}

export function commissionLines(
  schedule: PaymentMilestone[],
  already: number,
  newClients: number,
  lang: ProposalLang,
  makeId: () => string,
): { lines: InvoiceLineItem[]; billed: number; beyondCap: number } {
  const tiers = resultsTiers(schedule)
  const lines: InvoiceLineItem[] = []
  let n = already
  let left = Math.max(0, Math.floor(newClients))
  for (const t of tiers) {
    if (left <= 0) break
    const start = Math.max(n + 1, t.from)
    if (start > t.to) continue
    const take = Math.min(left, t.to - start + 1)
    if (take <= 0) continue
    const end = start + take - 1
    lines.push({
      id: makeId(),
      name: !Number.isFinite(t.to)
        ? (lang === 'es' ? 'Comisión por cliente nuevo' : 'Commission per new client')
        : lang === 'es'
        ? `Comisión por cliente nuevo (tramo ${t.from} a ${t.to})`
        : `Commission per new client (clients ${t.from} to ${t.to})`,
      description: lang === 'es'
        ? (take === 1 ? `Cliente número ${start}` : `Clientes número ${start} a ${end}`)
        : (take === 1 ? `Client number ${start}` : `Clients number ${start} to ${end}`),
      quantity: take,
      price: t.price,
    })
    n = end
    left -= take
  }
  const billed = lines.reduce((s, l) => s + l.quantity, 0)
  return { lines, billed, beyondCap: Math.max(0, Math.floor(newClients) - billed) }
}
