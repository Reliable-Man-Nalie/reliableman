'use client'

import { useState } from 'react'
import { convert, type Money3 } from '@/lib/fx'
import { INCOME_KIND_LABEL, type IncomeKind, type IncomeRow } from '@/lib/finance-income'

const KINDS: IncomeKind[] = ['invoice', 'event', 'program', 'stripe']

function money(n: number, cur: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n)
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface IncomeState {
  rows: IncomeRow[]
  stripe: 'ok' | 'not-connected' | 'error'
  stripeError?: string
  overridesReady: boolean
}

export default function IncomeCard({
  state, loadError, inPeriod, cur, usdPerEur, periodLabel, onChanged,
}: {
  state: IncomeState | null
  loadError: string
  inPeriod: (iso: string) => boolean
  cur: Money3
  usdPerEur: number
  periodLabel: string
  onChanged: () => void
}) {
  const [open, setOpen] = useState<IncomeKind | 'held' | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', what: '', amount: '', currency: 'USD', date: todayISO() })

  const rows = (state?.rows ?? []).filter(r => inPeriod(r.at))
  const conv = (r: IncomeRow) => convert(r.amount, (r.currency as Money3) || 'USD', cur, usdPerEur)
  const held = rows.filter(r => !r.counted)

  async function act(action: string, id: string, extra: Record<string, unknown> = {}) {
    setBusy(id); setMsg('')
    try {
      const res = await fetch('/api/os/finance/income', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id, ...extra }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) setMsg(j.error || 'That did not save. Try again.')
      else onChanged()
    } catch { setMsg('That did not save. Check your connection.') }
    setBusy('')
  }

  async function addIncome() {
    setBusy('add'); setMsg('')
    try {
      const res = await fetch('/api/os/finance/income', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'add', ...form }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) setMsg(j.error || 'That did not save. Try again.')
      else {
        setForm({ name: '', email: '', what: '', amount: '', currency: form.currency, date: todayISO() })
        setAdding(false)
        setMsg(`Saved as paid invoice ${j.number}.`)
        onChanged()
      }
    } catch { setMsg('That did not save. Check your connection.') }
    setBusy('')
  }

  function rowLine(r: IncomeRow) {
    return (
      <tr key={r.id} style={{ opacity: r.counted ? 1 : 0.6 }}>
        <td style={{ whiteSpace: 'nowrap', color: 'var(--os-text-faint)' }}>{r.at.slice(0, 10)}</td>
        <td>
          <div style={{ fontWeight: 600, color: 'var(--os-text)' }}>{r.what || r.code || 'Payment'}</div>
          <div style={{ fontSize: 12, color: 'var(--os-text-muted)' }}>
            {[r.name || r.email, r.method].filter(Boolean).join(' · ')}
            {r.stripeUrl && <> · <a href={r.stripeUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--os-accent)' }}>Stripe</a></>}
          </div>
          {r.note && <div style={{ fontSize: 12, color: 'var(--os-warn)', marginTop: 2 }}>{r.note}</div>}
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, textDecoration: r.counted ? 'none' : 'line-through' }}>
          {money(r.amount, r.currency)}
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {r.counted ? (
            <button className="os-btn os-btn-ghost os-btn-sm" disabled={busy === r.id}
              title="A test, a personal payment, anything that is not business income"
              onClick={() => r.dupOf ? act('count-both', r.id, { on: false }) : act('exclude', r.id)}>
              Leave out
            </button>
          ) : r.dupOf && !r.note?.startsWith('Left out') ? (
            <button className="os-btn os-btn-ghost os-btn-sm" disabled={busy === r.id} onClick={() => act('count-both', r.id, { on: true })}>
              Count it too
            </button>
          ) : (
            <button className="os-btn os-btn-ghost os-btn-sm" disabled={busy === r.id} onClick={() => act('include', r.id)}>
              Count it
            </button>
          )}
        </td>
      </tr>
    )
  }

  const groups = KINDS.map(k => {
    const list = rows.filter(r => r.kind === k)
    const counted = list.filter(r => r.counted)
    return { k, list, counted, total: counted.reduce((s, r) => s + conv(r), 0) }
  }).filter(g => g.list.length > 0)
  const grand = groups.reduce((s, g) => s + g.total, 0)

  return (
    <div className="os-card" style={{ marginTop: 22, padding: 22 }}>
      <div className="os-card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="os-card-title">Where the money came from · {periodLabel}</div>
          <div className="os-card-sub">Stripe, paid invoices and paid event seats, each payment counted once.</div>
        </div>
        <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => setAdding(a => !a)}>
          {adding ? 'Close' : '+ Money that came in without an invoice'}
        </button>
      </div>

      {!state && !loadError && <div style={{ color: 'var(--os-text-muted)', fontSize: 14 }}>Loading every payment…</div>}
      {loadError && (
        <div style={{ color: 'var(--os-bad)', fontSize: 14 }}>
          {loadError} The figures above fall back to the invoices in this browser until it loads.
        </div>
      )}
      {state && state.stripe !== 'ok' && (
        <div style={{ fontSize: 13, color: 'var(--os-warn)', marginBottom: 10 }}>
          Stripe could not be read{state.stripeError ? ` (${state.stripeError})` : ''}, so card payments that never became an invoice are missing here.
        </div>
      )}
      {state && !state.overridesReady && (
        <div style={{ fontSize: 13, color: 'var(--os-text-muted)', marginBottom: 10 }}>
          Leave out and Count it need one database paste first: supabase/RUN-THIS-2026-10-14-finance.sql.
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: 'var(--os-text)', marginBottom: 10 }}>{msg}</div>}

      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16 }}>
          <div className="os-form-group"><label className="os-label">Date it came in</label>
            <input className="os-input" type="date" max={todayISO()} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div className="os-form-group"><label className="os-label">Who paid</label>
            <input className="os-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="os-form-group"><label className="os-label">Email (optional)</label>
            <input className="os-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="os-form-group"><label className="os-label">What for</label>
            <input className="os-input" placeholder="Event tickets cash, consulting" value={form.what} onChange={e => setForm({ ...form, what: e.target.value })} /></div>
          <div className="os-form-group"><label className="os-label">Amount</label>
            <input className="os-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="os-form-group"><label className="os-label">Currency</label>
            <select className="os-select" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
              <option>USD</option><option>EUR</option><option>AWG</option>
            </select></div>
          <div className="os-form-group">
            <button className="os-btn os-btn-primary" disabled={busy === 'add'} onClick={addIncome}>{busy === 'add' ? 'Saving…' : 'Save as paid'}</button>
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--os-text-muted)' }}>
            Saved as a paid invoice numbered INC-…, so it also shows under Invoices and Payments. Your next invoice number does not change.
          </div>
        </div>
      )}

      {state && rows.length === 0 && <div style={{ color: 'var(--os-text-muted)', fontSize: 14 }}>No money came in during this period.</div>}

      {groups.map(g => (
        <div key={g.k} style={{ borderTop: '1px solid var(--os-line)' }}>
          <button onClick={() => setOpen(open === g.k ? null : g.k)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text)', textAlign: 'left' }}>
            <span style={{ fontWeight: 700 }}>
              {open === g.k ? '▾' : '▸'} {INCOME_KIND_LABEL[g.k]}
              <span style={{ fontWeight: 500, color: 'var(--os-text-muted)', marginLeft: 8, fontSize: 13 }}>
                {g.counted.length} {g.counted.length === 1 ? 'payment' : 'payments'}
              </span>
            </span>
            <span style={{ fontWeight: 800, color: 'var(--os-accent)' }}>{money(g.total, cur)}</span>
          </button>
          {open === g.k && (
            <div style={{ overflowX: 'auto' }}>
              <table className="os-table"><tbody>{g.list.map(rowLine)}</tbody></table>
            </div>
          )}
        </div>
      ))}

      {held.length > 0 && (
        <div style={{ borderTop: '1px solid var(--os-line)' }}>
          <button onClick={() => setOpen(open === 'held' ? null : 'held')}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-warn)', textAlign: 'left', fontWeight: 700 }}>
            <span>{open === 'held' ? '▾' : '▸'} Not counted: {held.length} to check</span>
            <span style={{ fontWeight: 500, fontSize: 13 }}>probable doubles and ones you left out</span>
          </button>
          {open === 'held' && (
            <div style={{ overflowX: 'auto' }}>
              <table className="os-table"><tbody>{held.map(rowLine)}</tbody></table>
            </div>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <div style={{ borderTop: '1px solid var(--os-line)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
          <span>Total · {periodLabel}</span>
          <span style={{ color: 'var(--os-accent)' }}>{money(grand, cur)}</span>
        </div>
      )}
    </div>
  )
}
