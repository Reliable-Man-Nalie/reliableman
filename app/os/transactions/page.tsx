'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sumIn, loadRate, SYMBOL, type Money3 } from '@/lib/fx'
import type { PaymentRow, PaymentsFeed, PaymentSource } from '@/lib/payments-feed'
import { copyText } from '@/lib/clipboard'

type Period = 'month' | '30d' | 'year' | 'all'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: '30d', label: '30 days' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All' },
]
const SOURCES: { id: PaymentSource | 'all'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'event', label: 'Events' },
  { id: 'program', label: 'Programs' },
  { id: 'subscription', label: 'Subscriptions' },
  { id: 'link', label: 'Payment links' },
  { id: 'other', label: 'Other' },
]
const SOURCE_LABEL: Record<PaymentSource, string> = {
  invoice: 'Invoice', event: 'Event', program: 'Program', subscription: 'Subscription', link: 'Payment link', other: 'Card payment',
}

function since(p: Period): number {
  const now = new Date()
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  if (p === '30d') return now.getTime() - 30 * 86400000
  if (p === 'year') return new Date(now.getFullYear(), 0, 1).getTime()
  return 0
}

function money(n: number, cur: string) {
  const sym = SYMBOL[cur as Money3]
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return sym ? `${sym}${s}` : `${s} ${cur}`
}

function asMoney3(c: string): Money3 { return c === 'EUR' || c === 'AWG' ? c : 'USD' }

function kept(r: PaymentRow) {
  if (r.status === 'failed' || r.method === 'free') return 0
  return Math.max(0, r.amount - r.refunded)
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function time(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function TransactionsPage() {
  const [feed, setFeed] = useState<PaymentsFeed | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('month')
  const [source, setSource] = useState<PaymentSource | 'all'>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [rate, setRate] = useState(1.1)
  const [copied, setCopied] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/os/payments-feed', { cache: 'no-store' })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.ok) setError(d?.error ? String(d.error) : `Could not load payments (HTTP ${res.status}).`)
      else setFeed(d as PaymentsFeed)
    } catch {
      setError('Could not reach the server.')
    }
    setLoading(false)
  }

  useEffect(() => {
    const raf = requestAnimationFrame(() => { setRate(loadRate()); load() })
    return () => cancelAnimationFrame(raf)
  }, [])

  const inPeriod = useMemo(() => {
    const from = since(period)
    return (feed?.rows || []).filter(r => new Date(r.at).getTime() >= from)
  }, [feed, period])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return inPeriod.filter(r =>
      (source === 'all' || r.source === source) &&
      (!needle || [r.name, r.email, r.what, r.code, r.methodDetail].join(' ').toLowerCase().includes(needle)))
  }, [inPeriod, source, q])

  const received = shown.filter(r => kept(r) > 0)
  const total = sumIn(received, 'USD', rate, kept, r => asMoney3(r.currency))
  const card = sumIn(received.filter(r => r.method === 'card'), 'USD', rate, kept, r => asMoney3(r.currency))
  const bank = sumIn(received.filter(r => r.method === 'bank'), 'USD', rate, kept, r => asMoney3(r.currency))
  const failed = shown.filter(r => r.status === 'failed').length
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of inPeriod) m[r.source] = (m[r.source] || 0) + 1
    return m
  }, [inPeriod])

  function copy(key: string, text: string) {
    setCopied(key)
    void copyText(text)
    window.setTimeout(() => setCopied(c => (c === key ? '' : c)), 2000)
  }

  function exportCsv() {
    const head = ['Date', 'Customer', 'Email', 'What', 'Type', 'Method', 'Amount', 'Refunded', 'Currency', 'Status', 'Confirmation code']
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines = shown.map(r => [r.at.slice(0, 10), r.name, r.email, r.what, SOURCE_LABEL[r.source], r.methodDetail, r.amount.toFixed(2), r.refunded.toFixed(2), r.currency, r.status, r.code].map(esc).join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `payments-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const convertedNote = total.converted ? ` · EUR at ${rate.toFixed(2)}` : ''

  return (
    <div className="pay-page">
      <style>{CSS}</style>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Payments</div>
          <div className="os-page-sub">Every payment that came in: cards through Stripe and bank transfers you marked paid</div>
        </div>
        <div className="os-page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div role="tablist" aria-label="Period" className="pay-seg">
            {PERIODS.map(p => (
              <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)} data-on={period === p.id}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="os-btn os-btn-ghost os-btn-sm" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
        </div>
      </div>

      {feed && feed.stripe !== 'ok' && (
        <div className="pay-note" data-kind="warn">
          {feed.stripe === 'not-connected'
            ? 'Stripe is not connected on this deployment, so card payments are shown from your own records only.'
            : `Stripe could not be read right now (${feed.stripeError || 'unknown error'}). Card payments are shown from your own records only.`}
        </div>
      )}
      {feed && feed.database !== 'ok' && (
        <div className="pay-note" data-kind="warn">Your database could not be read, so bank transfers are missing from this list.</div>
      )}
      {error && <div className="pay-note" data-kind="bad">{error} <button className="pay-link" onClick={load}>Try again</button></div>}

      <div className="os-stats">
        <div className="os-stat-card">
          <div className="os-stat-label">Received</div>
          <div className="os-stat-value">{money(total.total, 'USD')}</div>
          <div className="os-stat-sub">{received.length} payment{received.length === 1 ? '' : 's'}{convertedNote}</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-label">By card</div>
          <div className="os-stat-value">{money(card.total, 'USD')}</div>
          <div className="os-stat-sub">{received.filter(r => r.method === 'card').length} through Stripe</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-label">By bank transfer</div>
          <div className="os-stat-value">{money(bank.total, 'USD')}</div>
          <div className="os-stat-sub">{received.filter(r => r.method === 'bank').length} marked paid</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-label">Failed card attempts</div>
          <div className="os-stat-value" style={{ color: failed ? 'var(--os-bad)' : undefined }}>{failed}</div>
          <div className="os-stat-sub">not counted in the totals</div>
        </div>
      </div>

      <div className="pay-tools">
        <div className="pay-chips">
          {SOURCES.filter(s => s.id === 'all' || counts[s.id]).map(s => (
            <button key={s.id} className="pay-chip" data-on={source === s.id} onClick={() => setSource(s.id)}>
              {s.label}{s.id !== 'all' && <span>{counts[s.id]}</span>}
            </button>
          ))}
        </div>
        <input className="pay-search" type="search" placeholder="Search name, email, code…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search payments" />
      </div>

      <div className="os-card pay-list">
        {loading && !feed && <div className="pay-empty">Loading payments…</div>}
        {!loading && feed && !shown.length && <div className="pay-empty">No payments in this period.</div>}
        {shown.map(r => {
          const isOpen = open === r.id
          return (
            <div key={r.id} className="pay-row" data-open={isOpen}>
              <button className="pay-main" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                <div className="pay-when">
                  <div>{day(r.at)}</div>
                  <small>{time(r.at)}</small>
                </div>
                <div className="pay-who">
                  <div className="pay-name">{r.name || r.email || 'Unknown payer'}</div>
                  <div className="pay-what">{r.what}</div>
                </div>
                <div className="pay-tags">
                  <span className="pay-tag" data-src={r.source}>{SOURCE_LABEL[r.source]}</span>
                  <span className="pay-tag" data-method={r.method}>{r.method === 'card' ? 'Card' : r.method === 'bank' ? 'Bank' : 'Free'}</span>
                </div>
                <div className="pay-amt">
                  <div data-status={r.status}>{money(r.amount, r.currency)}</div>
                  {r.status !== 'paid' && (
                    <small data-status={r.status}>
                      {r.status === 'failed' ? 'Failed' : r.status === 'refunded' ? 'Refunded' : `${money(r.refunded, r.currency)} refunded`}
                    </small>
                  )}
                </div>
              </button>
              {isOpen && (
                <div className="pay-detail">
                  <dl>
                    <div><dt>Confirmation code</dt><dd>
                      <code>{r.code || 'None recorded'}</code>
                      {r.code && <button className="pay-link" onClick={() => copy(r.id, r.code)}>{copied === r.id ? 'Copied' : 'Copy'}</button>}
                    </dd></div>
                    <div><dt>Paid with</dt><dd>{r.methodDetail}</dd></div>
                    {r.email && <div><dt>Email</dt><dd>{r.email}</dd></div>}
                    <div><dt>Date</dt><dd>{day(r.at)}, {time(r.at)}</dd></div>
                  </dl>
                  <div className="pay-actions">
                    {r.stripeUrl && <a className="os-btn os-btn-ghost os-btn-sm" href={r.stripeUrl} target="_blank" rel="noreferrer">Open in Stripe</a>}
                    {r.receiptUrl && <a className="os-btn os-btn-ghost os-btn-sm" href={r.receiptUrl} target="_blank" rel="noreferrer">Stripe receipt</a>}
                    {r.linkUrl && <Link className="os-btn os-btn-ghost os-btn-sm" href={r.linkUrl}>{r.source === 'event' ? 'Open the event' : 'Open the invoice'}</Link>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const CSS = `
.pay-seg { display: flex; border: 1px solid var(--os-line); border-radius: 12px; overflow: hidden; flex-wrap: wrap; }
.pay-seg button { padding: 6px 14px; border: none; cursor: pointer; font-weight: 700; font-size: 12.5px; background: transparent; color: var(--os-text-muted); min-height: 34px; }
.pay-seg button[data-on="true"] { background: var(--os-accent); color: #fff; }
.pay-note { padding: 10px 14px; border-radius: 12px; margin-bottom: 14px; font-size: 13.5px; }
.pay-note[data-kind="warn"] { background: var(--os-warn-soft); color: var(--os-warn); }
.pay-note[data-kind="bad"] { background: var(--os-bad-soft); color: var(--os-bad); }
.pay-link { background: none; border: none; color: var(--os-accent); font-weight: 700; cursor: pointer; padding: 0 4px; font-size: 13px; min-height: 0; }
.pay-tools { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin: 18px 0 12px; }
.pay-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.pay-chip { border: 1px solid var(--os-line); background: transparent; color: var(--os-text-muted); border-radius: 999px; padding: 6px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; min-height: 34px; }
.pay-chip span { font-weight: 600; opacity: .7; }
.pay-chip[data-on="true"] { background: var(--os-accent); border-color: var(--os-accent); color: #fff; }
.pay-search { flex: 0 1 280px; min-width: 200px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--os-line); background: var(--os-base-2, transparent); color: var(--os-text-primary); caret-color: var(--os-accent); font-size: 14px; }
.pay-list { padding: 0 !important; overflow: hidden; }
.pay-empty { padding: 32px; text-align: center; color: var(--os-text-muted); font-size: 14px; }
.pay-row { border-bottom: 1px solid var(--os-line); }
.pay-row:last-child { border-bottom: none; }
.pay-row[data-open="true"] { background: var(--os-card-alt); }
.pay-main { width: 100%; display: grid; grid-template-columns: 104px minmax(0, 1fr) auto 130px; gap: 16px; align-items: center; padding: 12px 18px; background: none; border: none; text-align: left; cursor: pointer; color: inherit; font: inherit; }
.pay-main:hover { background: var(--os-card-alt); }
.pay-when { font-size: 13px; font-weight: 600; color: var(--os-text-primary); }
.pay-when small, .pay-amt small { display: block; font-size: 11.5px; color: var(--os-text-muted); font-weight: 500; }
.pay-name { font-weight: 700; font-size: 14px; color: var(--os-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pay-what { font-size: 12.5px; color: var(--os-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pay-tags { display: flex; gap: 6px; }
.pay-tag { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--os-chip); color: var(--os-text-muted); white-space: nowrap; }
.pay-tag[data-method="card"] { background: var(--os-accent-soft); color: var(--os-accent); }
.pay-tag[data-method="bank"] { background: var(--os-good-soft); color: var(--os-good); }
.pay-amt { text-align: right; font-weight: 800; font-size: 15px; color: var(--os-text-primary); font-variant-numeric: tabular-nums; }
.pay-amt [data-status="failed"], .pay-amt [data-status="refunded"] { color: var(--os-bad); }
.pay-amt div[data-status="failed"], .pay-amt div[data-status="refunded"] { text-decoration: line-through; }
.pay-amt small[data-status="partly-refunded"] { color: var(--os-warn); }
.pay-detail { padding: 4px 18px 16px 138px; }
.pay-detail dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 20px; margin: 0 0 12px; }
.pay-detail dt { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--os-text-muted); margin-bottom: 2px; }
.pay-detail dd { margin: 0; font-size: 13.5px; color: var(--os-text-primary); word-break: break-all; }
.pay-detail code { font-size: 12.5px; background: var(--os-chip); padding: 2px 6px; border-radius: 6px; }
.pay-actions { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 768px) {
  .pay-main { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "who amt" "when tags"; gap: 4px 12px; padding: 12px 14px; }
  .pay-who { grid-area: who; } .pay-amt { grid-area: amt; } .pay-when { grid-area: when; display: flex; gap: 6px; align-items: baseline; font-weight: 500; color: var(--os-text-muted); }
  .pay-when small { display: inline; }
  .pay-tags { grid-area: tags; justify-content: flex-end; }
  .pay-detail { padding: 4px 14px 14px; }
  .pay-search { flex: 1 1 100%; font-size: 16px; }
  .pay-tools { flex-direction: column; align-items: stretch; }
  .pay-chips { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; }
  .pay-chip { flex: 0 0 auto; }
}
`
