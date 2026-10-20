'use client'

import Link from 'next/link'
import type { Deal, Invoice, Proposal } from '@/lib/crm-types'
import { hoursSinceContact, isOpenStage, STALE_HOURS } from './deals/crm-shared'

type Props = { deals: Deal[]; invoices: Invoice[]; proposals: Proposal[] }

type Action = {
  id: string
  kind: 'money' | 'cold' | 'promise' | 'silent'
  who: string
  what: string
  when: string
  urgent: boolean
  href: string
}

const DAY = 86_400_000

function daysAgo(iso?: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / DAY)
}

function invoiceTotal(inv: Invoice): number {
  const sub = (inv.lineItems ?? []).reduce((n, li) => n + (li.quantity ?? 1) * (li.price ?? 0), 0)
  return sub + (inv.taxes ?? 0)
}

const money = (n: number, c = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n) }
  catch { return `${c} ${Math.round(n)}` }
}

const STYLE: Record<Action['kind'], { label: string; color: string; soft: string }> = {
  money:   { label: 'Owed',      color: 'var(--os-bad)',    soft: 'var(--os-bad-soft)' },
  cold:    { label: 'Going cold', color: 'var(--os-warn)',   soft: 'var(--os-warn-soft)' },
  promise: { label: 'You said',  color: 'var(--os-accent)',  soft: 'var(--os-accent-soft)' },
  silent:  { label: 'No reply',  color: 'var(--os-text-faint)', soft: 'var(--os-card-alt)' },
}

export function buildActions(deals: Deal[], invoices: Invoice[], proposals: Proposal[]): Action[] {
  const out: Action[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const inv of invoices) {
    if (inv.status === 'paid' || inv.paidAt || inv.status === 'draft') continue
    const due = String(inv.dueDate ?? '').slice(0, 10)
    if (!due || due >= today) continue
    const late = daysAgo(due) ?? 0
    out.push({
      id: `inv-${inv.id}`,
      kind: 'money',
      who: inv.clientName || inv.clientEmail || 'Client',
      what: `${money(invoiceTotal(inv), inv.currency)} unpaid, invoice ${inv.number ?? ''}`.trim(),
      when: late === 1 ? '1 day late' : `${late} days late`,
      urgent: late >= 7,
      href: '/os/invoices',
    })
  }

  for (const d of deals) {
    if (!isOpenStage(d.stage)) continue
    const h = hoursSinceContact(d)
    if (h < STALE_HOURS) continue
    out.push({
      id: `cold-${d.id}`,
      kind: 'cold',
      who: d.clientName || d.clientEmail || 'Lead',
      what: d.service || d.stage || 'In the pipeline',
      when: h >= 48 ? `${Math.floor(h / 24)} days since contact` : `${Math.floor(h)}h since contact`,
      urgent: h >= 96,
      href: `/os/contacts/${encodeURIComponent(d.clientEmail || '')}`,
    })
  }

  for (const d of deals) {
    if (!isOpenStage(d.stage)) continue
    const due = String(d.nextStepDate ?? '').slice(0, 10)
    if (!due || due > today || !d.nextStep) continue
    const late = daysAgo(due) ?? 0
    out.push({
      id: `step-${d.id}`,
      kind: 'promise',
      who: d.clientName || d.clientEmail || 'Lead',
      what: d.nextStep,
      when: late <= 0 ? 'Due today' : late === 1 ? '1 day overdue' : `${late} days overdue`,
      urgent: late >= 3,
      href: `/os/contacts/${encodeURIComponent(d.clientEmail || '')}`,
    })
  }

  for (const p of proposals) {
    if (p.status === 'signed' || p.signedAt || !p.sentAt) continue
    const age = daysAgo(p.sentAt) ?? 0
    if (age < 4) continue
    out.push({
      id: `prop-${p.id}`,
      kind: 'silent',
      who: p.clientName || p.clientEmail || 'Client',
      what: `${p.title || 'Proposal'} sent, not signed`,
      when: `${age} days ago`,
      urgent: age >= 10,
      href: '/os/proposals',
    })
  }

  const rank: Record<Action['kind'], number> = { money: 0, cold: 1, promise: 2, silent: 3 }
  return out.sort((a, b) =>
    Number(b.urgent) - Number(a.urgent) || rank[a.kind] - rank[b.kind],
  )
}

export default function ActionCenter({ deals, invoices, proposals }: Props) {
  const actions = buildActions(deals, invoices, proposals)

  const shown = actions.slice(0, 5)
  const urgent = actions.filter(a => a.urgent).length

  return (
    <section className="os-card" style={{ padding: '22px 24px', alignSelf: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: actions.length ? 14 : 0, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="os-card-title">What needs you today</span>
            {urgent > 0 && (
              <span style={{ background: 'var(--os-bad-soft)', color: 'var(--os-bad)', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 800 }}>
                {urgent} urgent
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--os-text-faint)', marginTop: 4 }}>
            {actions.length === 0
              ? 'Nothing overdue. Every lead has been touched and no invoice is late.'
              : `${actions.length} thing${actions.length === 1 ? '' : 's'} waiting, most costly first.`}
          </div>
        </div>
        <Link href="/os/deals" className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '7px 15px', fontSize: 12.5, textDecoration: 'none' }}>
          Open pipeline
        </Link>
      </div>

      <div>
        {shown.map(a => {
          const s = STYLE[a.kind]
          return (
            <Link
              key={a.id}
              href={a.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 12px', margin: '0 -12px',
                borderRadius: 12, textDecoration: 'none',
                borderTop: '1px solid var(--os-line)',
              }}
              className="os-action-row"
            >
              <span style={{ width: 3, alignSelf: 'stretch', minHeight: 30, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{
                background: s.soft, color: s.color, borderRadius: 999,
                padding: '3px 10px', fontSize: 10.5, fontWeight: 800,
                letterSpacing: '.06em', textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.who}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--os-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.what}
                </span>
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                color: a.urgent ? 'var(--os-bad)' : 'var(--os-text-faint)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {a.when}
              </span>
            </Link>
          )
        })}
        {actions.length > shown.length && (
          <div style={{ paddingTop: 12, fontSize: 12.5, color: 'var(--os-text-faint)' }}>
            and {actions.length - shown.length} more in the pipeline.
          </div>
        )}
      </div>
    </section>
  )
}
