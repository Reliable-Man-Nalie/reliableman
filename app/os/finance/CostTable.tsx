'use client'

import { useMemo, useState } from 'react'
import type { BusinessExpense, ExpenseCategory } from '@/lib/crm-types'
import { EXPENSE_CATEGORIES, CATEGORY_LABEL } from '@/lib/expense-categories'
import { convert, type Money3 } from '@/lib/fx'

const GOLD = '#eaa92e'
const FAINT = 'var(--os-text-faint)'
const MUTED = 'var(--os-text-muted)'
const LINE = 'var(--os-line)'

function money(n: number, cur: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n)
}

export default function CostTable({ expenses, cur, usdPerEur, periodLabel, inPeriod, onDelete, onRecategorise }: {
  expenses: BusinessExpense[]
  cur: Money3
  usdPerEur: number
  periodLabel: string

  inPeriod: (e: BusinessExpense) => number
  onDelete: (id: string) => void
  onRecategorise: (id: string, category: ExpenseCategory) => void
}) {
  const [cat, setCat] = useState<ExpenseCategory | 'all'>('all')
  const [q, setQ] = useState('')
  const [onlyPeriod, setOnlyPeriod] = useState(true)

  const conv = (e: BusinessExpense, n: number) => convert(n, (e.currency as Money3) ?? 'USD', cur, usdPerEur)

  const balance = useMemo(() => {
    const rows = EXPENSE_CATEGORIES.map(c => {
      const list = expenses.filter(e => e.category === c)
      return { c, total: list.reduce((s, e) => s + conv(e, inPeriod(e)), 0), count: list.length }
    }).filter(b => b.count > 0)

    const known = new Set<string>(EXPENSE_CATEGORIES)
    const stray = expenses.filter(e => !known.has(e.category))
    if (stray.length) rows.push({ c: 'other', total: stray.reduce((s, e) => s + conv(e, inPeriod(e)), 0), count: stray.length })
    return rows.sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, cur, usdPerEur, inPeriod])
  const grand = balance.reduce((s, b) => s + b.total, 0)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return expenses
      .filter(e => cat === 'all' || e.category === cat)
      .filter(e => !needle || (e.name + ' ' + (e.notes ?? '')).toLowerCase().includes(needle))
      .filter(e => !onlyPeriod || inPeriod(e) > 0)
      .sort((a, b) => (b.date ?? b.createdAt ?? '').localeCompare(a.date ?? a.createdAt ?? ''))
  }, [expenses, cat, q, onlyPeriod, inPeriod])
  const shownTotal = rows.reduce((s, e) => s + conv(e, inPeriod(e)), 0)

  return (
    <div>
      <div style={{ fontFamily: "'Space Mono', monospace", textTransform: 'uppercase', letterSpacing: '.2em', fontSize: 11, color: FAINT, margin: '6px 0 10px' }}>
        Where the money went · {periodLabel}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Tile active={cat === 'all'} onClick={() => setCat('all')} label="All costs" value={money(grand, cur)} share={grand > 0 ? 100 : 0} sub={`${expenses.length} lines`} />
        {balance.map(b => (
          <Tile key={b.c} active={cat === b.c} onClick={() => setCat(cat === b.c ? 'all' : b.c)}
            label={CATEGORY_LABEL[b.c] ?? b.c} value={money(b.total, cur)}
            share={grand > 0 ? (b.total / grand) * 100 : 0}
            sub={`${grand > 0 ? Math.round((b.total / grand) * 100) : 0}% · ${b.count} ${b.count === 1 ? 'line' : 'lines'}`} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input className="os-input" type="search" placeholder="Search costs (GitHub, coworking, Partner…)" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 240px', maxWidth: 380 }} />
        <select className="os-select" value={cat} onChange={e => setCat(e.target.value as ExpenseCategory | 'all')} style={{ flex: '0 1 240px' }}>
          <option value="all">Every type</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: MUTED, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyPeriod} onChange={e => setOnlyPeriod(e.target.checked)} />
          Only {periodLabel}
        </label>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 18, fontSize: 13.5, color: MUTED, border: `1px dashed ${LINE}`, borderRadius: 12 }}>
          No costs match. {onlyPeriod ? `Untick "Only ${periodLabel}" to see every line.` : ''}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="os-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Type</th>
                <th>Frequency</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>In period ({cur})</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => {
                const inP = inPeriod(e)
                return (
                  <tr key={e.id} style={{ opacity: inP > 0 ? 1 : 0.55 }}>
                    <td style={{ color: FAINT, whiteSpace: 'nowrap' }}>{(e.date ?? e.createdAt ?? '').slice(0, 10) || '-'}</td>
                    <td style={{ fontWeight: 600 }}>
                      {e.name}
                      {e.notes && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: FAINT }}>{e.notes}</span>}
                      {e.receiptPath && (
                        <a href={'/api/os/finance/receipt?path=' + encodeURIComponent(e.receiptPath)} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, fontWeight: 500, color: 'var(--os-accent)' }}>Receipt</a>
                      )}
                    </td>
                    <td>
                      <select className="os-select" value={e.category} onChange={ev => onRecategorise(e.id, ev.target.value as ExpenseCategory)}
                        style={{ minWidth: 170, padding: '6px 8px', fontSize: 13 }} aria-label={`Type of ${e.name}`}>
                        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                      </select>
                    </td>
                    <td style={{ color: MUTED }}>{e.frequency}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(e.amount, e.currency)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: GOLD, whiteSpace: 'nowrap' }}>{inP > 0 ? money(conv(e, inP), cur) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => onDelete(e.id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td colSpan={5} style={{ fontWeight: 700 }}>
                  {cat === 'all' ? 'Total' : CATEGORY_LABEL[cat]}{q ? ` matching "${q}"` : ''} · {periodLabel}
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: FAINT }}>{rows.length} {rows.length === 1 ? 'line' : 'lines'}, converted to {cur}</span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: GOLD }}>{money(shownTotal, cur)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Tile({ active, onClick, label, value, share, sub }: { active: boolean; onClick: () => void; label: string; value: string; share: number; sub: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{
        textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', color: 'var(--os-text)',
        background: active ? 'var(--os-accent-soft)' : 'transparent',
        border: `1px solid ${active ? 'var(--os-accent)' : LINE}`,
      }}>
      <div style={{ fontSize: 12, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: GOLD, margin: '2px 0 6px' }}>{value}</div>
      <div style={{ height: 4, borderRadius: 2, background: LINE, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, share)}%`, height: '100%', background: GOLD }} />
      </div>
      <div style={{ fontSize: 11, color: FAINT, marginTop: 5 }}>{sub}</div>
    </button>
  )
}
