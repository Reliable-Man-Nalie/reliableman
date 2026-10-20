'use client'

import { useState, useEffect } from 'react'
import {
  getInvoices,
  getProposals,
  getExpenses,
  saveExpense,
  deleteExpense,
  updateExpense,
  invoiceTotal,
  setExpensesFromRows,
} from '@/lib/crm-store'
import type {
  Invoice,
  Proposal,
  BusinessExpense,
  ExpenseCategory,
  ExpenseFrequency,
  Currency,
} from '@/lib/crm-types'
import { sumIn, convert, loadRate, type Money3 } from '@/lib/fx'
import IncomeCard, { type IncomeState } from './IncomeCard'
import AdSpendImport from './AdSpendImport'
import MonthlyChart from './MonthlyChart'
import CostTable from './CostTable'
import { EXPENSE_CATEGORIES, CATEGORY_LABEL } from '@/lib/expense-categories'

type FinanceSettings = {
  hourlyRate: number
  currency: Currency
}

type TimeEntry = {
  id: string
  date: string // YYYY-MM-DD
  hours: number
  rate: number
  project: string
  notes: string
  created_at: string
}

const TIME_KEY = 'bos_finance_time'
const SETTINGS_KEY = 'bos_finance_settings'

const DEFAULT_SETTINGS: FinanceSettings = { hourlyRate: 150, currency: 'USD' }

const EXPENSE_FREQUENCIES: ExpenseFrequency[] = ['monthly', 'yearly', 'one-time']

const CURRENCIES: Currency[] = ['USD', 'EUR', 'AWG']

const PURPLE = 'var(--os-accent)'
const INK = 'var(--os-text)'
const BODY = '#5a5274'
const FAINT = '#9b93ab'
const GREEN = 'var(--os-good)'
const CORAL = 'var(--os-bad)'
const GOLD = '#eaa92e'
const BLUE = 'var(--os-accent)'

function money(n: number, cur: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 0,
  }).format(n)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

type Period = 'month' | '3m' | '6m' | 'ytd' | 'all'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: '3m', label: 'Last 3 months' },
  { id: '6m', label: 'Last 6 months' },
  { id: 'ytd', label: 'This year' },
  { id: 'all', label: 'All time' },
]

function monthStart(back: number, now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - back, 1)
}

function periodStart(period: Period, now = new Date()): Date {
  if (period === 'month') return monthStart(0, now)
  if (period === '3m') return monthStart(2, now)
  if (period === '6m') return monthStart(5, now)
  if (period === 'ytd') return new Date(now.getFullYear(), 0, 1)
  return new Date(0)
}

function parseDay(iso?: string | null): Date | null {
  if (!iso) return null

  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function inPeriod(iso: string | undefined | null, start: Date, end: Date): boolean {
  const d = parseDay(iso)
  return !!d && d >= start && d < end
}

function activeMonths(costStart: Date | null, start: Date, end: Date): number {
  const from = costStart && costStart > start ? costStart : start
  if (from >= end) return 0

  const months = (end.getFullYear() - from.getFullYear()) * 12 + (end.getMonth() - from.getMonth())
  return Math.max(0, months)
}

function costInPeriod(e: BusinessExpense, start: Date, end: Date): number {
  const began = parseDay(e.date) ?? parseDay(e.createdAt)
  if (e.frequency === 'one-time') return inPeriod(e.date ?? e.createdAt, start, end) ? e.amount : 0
  const months = activeMonths(began, start, end)
  if (e.frequency === 'monthly') return e.amount * months
  return (e.amount / 12) * months
}

const pct = (inc: number, cost: number) => (inc > 0 ? Math.round(((inc - cost) / inc) * 100) + '%' : '')

function csvCell(v: unknown): string {
  const t = String(v ?? '')
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}

function randId() {
  return Math.random().toString(16).slice(2, 14)
}

function monthlyCost(e: BusinessExpense): number {
  if (e.frequency === 'monthly') return e.amount
  if (e.frequency === 'yearly') return e.amount / 12
  return 0 // one-time does not contribute to recurring monthly cost
}

function loadTimeEntries(): TimeEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(TIME_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as TimeEntry[]) : []
  } catch {
    return []
  }
}

function persistTimeEntries(entries: TimeEntry[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TIME_KEY, JSON.stringify(entries))
  } catch {

  }
}

function loadSettings(): FinanceSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<FinanceSettings>
    return {
      hourlyRate:
        typeof parsed.hourlyRate === 'number' ? parsed.hourlyRate : DEFAULT_SETTINGS.hourlyRate,
      currency: parsed.currency ?? DEFAULT_SETTINGS.currency,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function persistSettings(s: FinanceSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {

  }
}

function syncTime(op: 'upsert' | 'delete', row: Record<string, unknown>) {
  try {
    void fetch('/api/os-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, table: 'finance_time_entries', row }),
    }).catch(() => {})
  } catch {

  }
}

export default function FinancePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [expenses, setExpenses] = useState<BusinessExpense[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_SETTINGS)

  const [tDate, setTDate] = useState(todayISO())
  const [tHours, setTHours] = useState('')
  const [tRate, setTRate] = useState('')
  const [tProject, setTProject] = useState('')
  const [tNotes, setTNotes] = useState('')

  const [period, setPeriod] = useState<Period>('month')

  const [eDate, setEDate] = useState(todayISO())
  const [eName, setEName] = useState('')
  const [eCategory, setECategory] = useState<ExpenseCategory>('software')
  const [eAmount, setEAmount] = useState('')
  const [eFrequency, setEFrequency] = useState<ExpenseFrequency>('monthly')
  const [eCurrency, setECurrency] = useState<Currency>('USD')

  const [sRate, setSRate] = useState('')
  const [sCurrency, setSCurrency] = useState<Currency>('USD')

  const [includeLabor, setIncludeLabor] = useState(false)

  const [income, setIncome] = useState<IncomeState | null>(null)
  const [incomeError, setIncomeError] = useState('')
  const [intelKey, setIntelKey] = useState(0)
  function loadIncome() {
    setIntelKey(k => k + 1)
    fetch('/api/os/finance/income', { cache: 'no-store' })
      .then(r => r.json().catch(() => null))
      .then(j => {
        if (j?.ok) { setIncome({ rows: j.rows, stripe: j.stripe, stripeError: j.stripeError, overridesReady: !!j.overridesReady }); setIncomeError('') }
        else setIncomeError('Payments could not be loaded.')
      })
      .catch(() => setIncomeError('Payments could not be loaded.'))
  }

  function reload() {
    setInvoices(getInvoices())
    setProposals(getProposals())
    setExpenses(getExpenses())
    setTimeEntries(loadTimeEntries())
  }

  useEffect(() => {
    const s = loadSettings()
    setSettings(s)
    setTRate(String(s.hourlyRate))
    setSRate(String(s.hourlyRate))
    setSCurrency(s.currency)
    setECurrency(s.currency)
    reload()
    loadIncome()

    fetch('/api/os-data?parts=finance')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!json?.ok) return
        if (Array.isArray(json.expenses)) setExpensesFromRows(json.expenses)
        if (Array.isArray(json.timeEntries)) persistTimeEntries(json.timeEntries as TimeEntry[])
        reload()
      })
      .catch(() => {})
  }, [])

  const cur = settings.currency as Money3

  const [usdPerEur, setUsdPerEur] = useState(1.1)
  useEffect(() => { setUsdPerEur(loadRate()) }, [])

  const now = new Date()
  const pStart = periodStart(period, now)
  const pEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const periodLabel = PERIODS.find(p => p.id === period)?.label.toLowerCase() ?? ''
  const periodMonths = period === 'all'
    ? Math.max(1, activeMonths(earliestDate(invoices, expenses, timeEntries), pStart, pEnd))
    : activeMonths(null, pStart, pEnd)

  const paidInvoices = invoices.filter((i) => i.status === 'paid')

  const paidThisMonth = paidInvoices.filter((i) => inPeriod(i.paidAt ?? i.issueDate, pStart, pEnd))
  const signedThisMonth = proposals.filter(
    (p) => p.status === 'signed' && inPeriod(p.signedAt ?? p.createdAt, pStart, pEnd),
  )
  const outstandingInvoices = invoices.filter(
    (i) => i.status !== 'paid' && i.status !== 'draft' && i.status !== 'void',
  )

  const paidRevenue = sumIn(
    paidThisMonth, cur, usdPerEur,
    i => i.amountPaid || invoiceTotal(i.lineItems, i.taxes),
    i => (i.currency as Money3) ?? 'USD',
  )
  const paidRevenueThisMonth = paidRevenue.total
  const signedRevenue = sumIn(
    signedThisMonth, cur, usdPerEur,
    p => p.total,
    p => (p.currency as Money3) ?? 'USD',
  )
  const signedRevenueThisMonth = signedRevenue.total

  const incomeIn = income ? income.rows.filter(r => r.counted && inPeriod(r.at, pStart, pEnd)) : null
  const incomeSum = incomeIn
    ? sumIn(incomeIn, cur, usdPerEur, r => r.amount, r => ((r.currency as Money3) || 'USD'))
    : null
  const revenueThisMonth = incomeSum
    ? incomeSum.total
    : paidThisMonth.length > 0 ? paidRevenueThisMonth : signedRevenueThisMonth
  const revenueSourceLabel = incomeIn
    ? incomeIn.length + (incomeIn.length === 1 ? ' payment' : ' payments') + ': invoices, Stripe and events'
    : paidThisMonth.length > 0 ? 'from paid invoices' : 'from signed proposals'

  const hasTimeLogged = timeEntries.length > 0

  const timeThisMonth = timeEntries.filter((t) => inPeriod(t.date, pStart, pEnd))
  const hoursThisMonth = timeThisMonth.reduce((sum, t) => sum + (t.hours || 0), 0)
  const laborValueThisMonth = timeThisMonth.reduce(
    (sum, t) => sum + (t.hours || 0) * (t.rate || 0),
    0,
  )

  const costs = sumIn(
    expenses, cur, usdPerEur,
    e => costInPeriod(e, pStart, pEnd),
    e => (e.currency as Money3) ?? 'USD',
  )
  const periodCosts = costs.total

  const runRate = sumIn(
    expenses, cur, usdPerEur,
    e => monthlyCost(e),
    e => (e.currency as Money3) ?? 'USD',
  ).total

  const costIn = (e: BusinessExpense) => costInPeriod(e, pStart, pEnd)

  const costsByCategory = EXPENSE_CATEGORIES.map((category) => {
    const rows = expenses.filter(e => e.category === category)
    const total = sumIn(
      rows, cur, usdPerEur,
      e => costInPeriod(e, pStart, pEnd),
      e => (e.currency as Money3) ?? 'USD',
    ).total
    return { category, label: CATEGORY_LABEL[category], total, count: rows.length }
  }).filter(c => c.total > 0)

  const outstanding = sumIn(
    outstandingInvoices, cur, usdPerEur,
    i => invoiceTotal(i.lineItems, i.taxes),
    i => (i.currency as Money3) ?? 'USD',
  )

  const anyConverted =
    (incomeSum ? incomeSum.converted : paidThisMonth.length > 0 ? paidRevenue.converted : signedRevenue.converted) || costs.converted

  const laborDeducted = includeLabor && hasTimeLogged ? laborValueThisMonth : 0
  const totalCosts = periodCosts + laborDeducted
  const netForBreakdown = revenueThisMonth - totalCosts
  const margin = revenueThisMonth > 0 ? (netForBreakdown / revenueThisMonth) * 100 : null
  const costShare = (v: number) => (revenueThisMonth > 0 ? (v / revenueThisMonth) * 100 : null)

  const yearMonths = Array.from({ length: now.getMonth() + 1 }, (_, m) => {
    const ms = new Date(now.getFullYear(), m, 1)
    const me = new Date(now.getFullYear(), m + 1, 1)
    const inc = income ? sumIn(income.rows.filter(r => r.counted && inPeriod(r.at, ms, me)), cur, usdPerEur, r => r.amount, r => ((r.currency as Money3) || 'USD')).total : 0
    const cst = sumIn(expenses, cur, usdPerEur, e => costInPeriod(e, ms, me), e => (e.currency as Money3) ?? 'USD').total
    const ads = sumIn(expenses.filter(e => e.category === 'marketing'), cur, usdPerEur, e => costInPeriod(e, ms, me), e => (e.currency as Money3) ?? 'USD').total
    return { label: ms.toLocaleString('en-US', { month: 'long' }), income: inc, costs: cst, ads }
  })
  const yearIncome = yearMonths.reduce((s, m) => s + m.income, 0)
  const yearCosts = yearMonths.reduce((s, m) => s + m.costs, 0)

  const yearCostByCategory = EXPENSE_CATEGORIES.map(category => ({
    label: CATEGORY_LABEL[category],
    total: sumIn(expenses.filter(e => e.category === category), cur, usdPerEur, e => costInPeriod(e, new Date(now.getFullYear(), 0, 1), pEnd), e => (e.currency as Money3) ?? 'USD').total,
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
  const avgCost3 = sumIn(expenses, cur, usdPerEur, e => costInPeriod(e, monthStart(3, now), monthStart(0, now)), e => (e.currency as Money3) ?? 'USD').total / 3

  function exportCsv() {
    const lines: string[][] = [[
      'type', 'date', 'description', 'category', 'amount', 'currency', 'amount_' + cur.toLowerCase(), 'reference',
    ]]
    if (incomeIn) {
      for (const r of incomeIn) {
        const c = ((r.currency as Money3) || 'USD')
        lines.push(['revenue', r.at.slice(0, 10), [r.name, r.what].filter(Boolean).join(' · '), r.kind, r.amount.toFixed(2), c, convert(r.amount, c, cur, usdPerEur).toFixed(2), r.code || r.id])
      }
    } else for (const i of paidThisMonth) {
      const amt = i.amountPaid || invoiceTotal(i.lineItems, i.taxes)
      const c = ((i.currency as Money3) ?? 'USD')
      lines.push(['revenue', (i.paidAt ?? i.issueDate ?? '').slice(0, 10), i.clientName + (i.projectTitle ? ' · ' + i.projectTitle : ''), 'invoice', amt.toFixed(2), c, convert(amt, c, cur, usdPerEur).toFixed(2), '#' + i.number])
    }
    for (const e of expenses) {
      const amt = costInPeriod(e, pStart, pEnd)
      if (amt <= 0) continue
      const c = ((e.currency as Money3) ?? 'USD')
      lines.push(['cost', (e.date ?? e.createdAt ?? '').slice(0, 10), e.name, CATEGORY_LABEL[e.category], amt.toFixed(2), c, convert(amt, c, cur, usdPerEur).toFixed(2), e.frequency])
    }
    for (const t of timeThisMonth) {
      const amt = (t.hours || 0) * (t.rate || 0)
      lines.push(['time', t.date, t.project || 'Logged hours', 'labor', amt.toFixed(2), settings.currency, convert(amt, settings.currency as Money3, cur, usdPerEur).toFixed(2), t.hours + 'h @ ' + t.rate])
    }
    lines.push(['summary', '', 'Revenue (' + periodLabel + ')', '', '', cur, revenueThisMonth.toFixed(2), ''])
    lines.push(['summary', '', 'Costs (' + periodLabel + ')', '', '', cur, periodCosts.toFixed(2), ''])
    lines.push(['summary', '', 'Net profit', '', '', cur, netForBreakdown.toFixed(2), ''])
    const csv = lines.map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bos-finance-' + period + '-' + todayISO() + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function addTimeEntry() {
    const hours = parseFloat(tHours)
    const rate = parseFloat(tRate)
    if (!tDate || Number.isNaN(hours) || hours <= 0) return
    const safeRate = Number.isNaN(rate) ? settings.hourlyRate : rate
    const entry: TimeEntry = {
      id: randId(),
      date: tDate,
      hours,
      rate: safeRate,
      project: tProject.trim(),
      notes: tNotes.trim(),
      created_at: new Date().toISOString(),
    }
    const next = [entry, ...timeEntries]
    setTimeEntries(next)
    persistTimeEntries(next)
    syncTime('upsert', entry as unknown as Record<string, unknown>)

    setTHours('')
    setTProject('')
    setTNotes('')
  }

  function removeTimeEntry(id: string) {
    const next = timeEntries.filter((t) => t.id !== id)
    setTimeEntries(next)
    persistTimeEntries(next)
    syncTime('delete', { id })
  }

  function addExpense() {
    const amount = parseFloat(eAmount)
    if (!eName.trim() || Number.isNaN(amount) || amount < 0) return
    saveExpense({
      name: eName.trim(),
      category: eCategory,
      amount,
      frequency: eFrequency,
      currency: eCurrency,
      date: eDate || undefined,
    })
    setEName('')
    setEAmount('')
    setEDate(todayISO())
    setExpenses(getExpenses())
  }

  function removeExpense(id: string) {
    deleteExpense(id)
    setExpenses(getExpenses())
  }

  function saveSettings() {
    const rate = parseFloat(sRate)
    const next: FinanceSettings = {
      hourlyRate: Number.isNaN(rate) ? DEFAULT_SETTINGS.hourlyRate : rate,
      currency: sCurrency,
    }
    setSettings(next)
    persistSettings(next)
    setTRate(String(next.hourlyRate))
    setECurrency(next.currency)
  }

  return (
    <div>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Finance</div>
          <div className="os-page-sub">Revenue, costs and net profit for the period you pick</div>
        </div>
        <div className="os-page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div role="tablist" aria-label="Period" style={{ display: 'flex', gap: 0, border: '1px solid var(--os-line)', borderRadius: 12, overflow: 'hidden', flexWrap: 'wrap' }}>
            {PERIODS.map(p => (
              <button
                key={p.id}
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                style={{ padding: '6px 14px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12.5, background: period === p.id ? 'var(--os-accent)' : 'transparent', color: period === p.id ? '#fff' : 'var(--os-text-muted)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="os-btn os-btn-ghost os-btn-sm" onClick={exportCsv} title="Every revenue, cost and time line in this period, as a spreadsheet">
            Export CSV
          </button>
        </div>
      </div>

      <div className="os-stats">
        <div className="os-stat-card">
          <div className="os-stat-label">Revenue · {periodLabel}</div>
          <div className="os-stat-value" style={{ color: PURPLE }}>
            {money(revenueThisMonth, cur)}
          </div>
          <div className="os-stat-sub">
            {revenueSourceLabel}
            {!incomeIn && paidThisMonth.length > 0 && ' · ' + paidThisMonth.length + (paidThisMonth.length === 1 ? ' invoice' : ' invoices')}
            {anyConverted && (
              <span style={{ display: 'block', fontSize: 11, color: 'var(--os-text-faint)', marginTop: 2 }}>
                converted to {cur} · AWG pegged 1.80 · EUR at {usdPerEur.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {hasTimeLogged && (
        <div className="os-stat-card">
          <div className="os-stat-label">Logged hours value</div>
          <div className="os-stat-value" style={{ color: BLUE }}>
            {money(laborValueThisMonth, cur)}
          </div>
          <div className="os-stat-sub">
            {hoursThisMonth.toFixed(1)} hours · {periodLabel}
          </div>
        </div>
        )}

        <div className="os-stat-card">
          <div className="os-stat-label">Costs · {periodLabel}</div>
          <div className="os-stat-value" style={{ color: GOLD }}>
            {money(periodCosts, cur)}
          </div>
          <div className="os-stat-sub">
            {period === 'month' ? expenses.length + ' items' : 'run-rate ' + money(runRate, cur) + ' a month'}
          </div>
        </div>

        <div className="os-stat-card">
          <div className="os-stat-label">Net profit</div>
          <div
            className="os-stat-value"
            style={{ color: netForBreakdown >= 0 ? GREEN : CORAL }}
          >
            {money(netForBreakdown, cur)}
          </div>
          <div className="os-stat-sub">
            {margin === null ? 'no revenue in this period' : margin.toFixed(0) + '% margin' + (laborDeducted > 0 ? ' after your hours' : '')}
          </div>
        </div>

        <div className="os-stat-card">
          <div className="os-stat-label">Profit margin · {periodLabel}</div>
          <div className="os-stat-value" style={{ color: margin === null ? FAINT : margin >= 0 ? GREEN : CORAL }}>
            {margin === null ? 'n/a' : margin.toFixed(0) + '%'}
          </div>
          <div className="os-stat-sub">
            {margin === null ? 'no revenue in this period' : 'of every 100 that came in, ' + Math.max(0, Math.round(margin)) + ' was kept'}
          </div>
        </div>

        {outstandingInvoices.length > 0 && (
        <div className="os-stat-card">
          <div className="os-stat-label">Still to collect</div>
          <div className="os-stat-value" style={{ color: CORAL }}>
            {money(outstanding.total, cur)}
          </div>
          <div className="os-stat-sub">
            {outstandingInvoices.length} open {outstandingInvoices.length === 1 ? 'invoice' : 'invoices'}, not counted as revenue
          </div>
        </div>
        )}
      </div>

      <IncomeCard
        state={income}
        loadError={incomeError}
        inPeriod={iso => inPeriod(iso, pStart, pEnd)}
        cur={cur}
        usdPerEur={usdPerEur}
        periodLabel={periodLabel}
        onChanged={loadIncome}
      />

      {income && (
        <MonthlyChart
          year={now.getFullYear()}
          months={yearMonths}
          cur={cur}
          runRate={runRate}
          costByCategory={yearCostByCategory}
        />
      )}

      {income && (
        <div className="os-card" style={{ marginTop: 22, padding: 22 }}>
          <div className="os-card-header">
            <div className="os-card-title">{now.getFullYear()}, month by month</div>
            <div className="os-card-sub">
              Average cost over the last three full months: <strong>{money(avgCost3, cur)}</strong> a month
              {' · '}recurring tools today: {money(runRate, cur)} a month
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="os-table">
              <thead>
                <tr><th>Month</th><th style={{ textAlign: 'right' }}>Money in</th><th style={{ textAlign: 'right' }}>Costs</th><th style={{ textAlign: 'right' }}>of which ads</th><th style={{ textAlign: 'right' }}>Profit</th><th style={{ textAlign: 'right' }}>Margin</th></tr>
              </thead>
              <tbody>
                {yearMonths.map(m => (
                  <tr key={m.label}>
                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                    <td style={{ textAlign: 'right', color: PURPLE }}>{money(m.income, cur)}</td>
                    <td style={{ textAlign: 'right', color: GOLD }}>{money(m.costs, cur)}</td>
                    <td style={{ textAlign: 'right', color: FAINT }}>{m.ads > 0 ? money(m.ads, cur) : '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: m.income - m.costs >= 0 ? GREEN : CORAL }}>{money(m.income - m.costs, cur)}</td>
                    <td style={{ textAlign: 'right', color: FAINT }}>{pct(m.income, m.costs)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 800 }}>Year so far</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: PURPLE }}>{money(yearIncome, cur)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: GOLD }}>{money(yearCosts, cur)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: FAINT }}>{money(yearMonths.reduce((s, m) => s + m.ads, 0), cur)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: yearIncome - yearCosts >= 0 ? GREEN : CORAL }}>{money(yearIncome - yearCosts, cur)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800 }}>{pct(yearIncome, yearCosts)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="os-card" style={{ marginTop: 22, padding: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '.2em',
              fontSize: 11,
              color: FAINT,
            }}
          >
            Profit breakdown
          </div>
          {hasTimeLogged && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: BODY,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={includeLabor}
              onChange={(e) => setIncludeLabor(e.target.checked)}
            />
            Subtract logged labor value
          </label>
          )}
        </div>

        <table className="os-table">
          <tbody>
            <BreakdownRow label={'Revenue · ' + periodLabel} value={money(revenueThisMonth, cur)} color={PURPLE} />
            {costsByCategory.map(c => (
              <BreakdownRow
                key={c.category}
                label={'Less ' + c.label.toLowerCase() + ' (' + c.count + ')'}
                value={'- ' + money(c.total, cur)}
                color={GOLD}
                share={costShare(c.total)}
              />
            ))}
            {costsByCategory.length === 0 && (
              <BreakdownRow label="Less costs" value={'- ' + money(0, cur)} color={GOLD} />
            )}
            {includeLabor && hasTimeLogged && (
              <BreakdownRow
                label={'Less your hours (' + hoursThisMonth.toFixed(1) + 'h)'}
                value={'- ' + money(laborValueThisMonth, cur)}
                color={BLUE}
                share={costShare(laborValueThisMonth)}
              />
            )}
            <BreakdownRow label="Total costs" value={'- ' + money(totalCosts, cur)} color={INK} share={costShare(totalCosts)} />
            <tr>
              <td style={{ fontWeight: 800, color: INK, fontFamily: "'Sora', sans-serif" }}>
                Net profit
              </td>
              <td
                style={{
                  textAlign: 'right',
                  fontWeight: 800,
                  fontFamily: "'Sora', sans-serif",
                  color: netForBreakdown >= 0 ? GREEN : CORAL,
                }}
              >
                {money(netForBreakdown, cur)}
                {margin !== null && (
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: FAINT }}>
                    {margin.toFixed(1)}% margin
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        {period !== 'month' && (
          <div style={{ marginTop: 12, fontSize: 12, color: FAINT }}>
            Monthly tools are counted once per month inside the period, yearly tools at a twelfth a month, one-time costs on their date.
            {periodMonths > 1 && ' That is ' + periodMonths + ' months, so about ' + money(netForBreakdown / periodMonths, cur) + ' net a month.'}
          </div>
        )}
      </div>

      <div className="os-card" style={{ marginTop: 22, padding: 22 }}>
        <div className="os-card-header">
          <div className="os-card-title">Time log</div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
            alignItems: 'end',
            marginBottom: 18,
          }}
        >
          <div className="os-form-group">
            <label className="os-label">Date</label>
            <input
              className="os-input"
              type="date"
              value={tDate}
              onChange={(e) => setTDate(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label className="os-label">Hours</label>
            <input
              className="os-input"
              type="number"
              min="0"
              step="0.25"
              placeholder="0"
              value={tHours}
              onChange={(e) => setTHours(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label className="os-label">Rate ({cur})</label>
            <input
              className="os-input"
              type="number"
              min="0"
              step="1"
              placeholder={String(settings.hourlyRate)}
              value={tRate}
              onChange={(e) => setTRate(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label className="os-label">Project</label>
            <input
              className="os-input"
              type="text"
              placeholder="Client or project"
              value={tProject}
              onChange={(e) => setTProject(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label className="os-label">Notes</label>
            <input
              className="os-input"
              type="text"
              placeholder="Optional"
              value={tNotes}
              onChange={(e) => setTNotes(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label className="os-label" style={{ visibility: 'hidden' }}>
              Add
            </label>
            <button className="os-btn os-btn-primary" onClick={addTimeEntry}>
              Log time
            </button>
          </div>
        </div>

        {timeEntries.length === 0 ? (
          <EmptyState text="No time logged yet. Add your first entry above to start tracking labor value." />
        ) : (
          <table className="os-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th style={{ textAlign: 'right' }}>Hours</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {timeEntries.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: INK }}>
                      {t.project || 'Untitled'}
                    </div>
                    {t.notes && (
                      <div style={{ fontSize: 12, color: FAINT }}>{t.notes}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{t.hours}</td>
                  <td style={{ textAlign: 'right' }}>{money(t.rate, cur)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: BLUE }}>
                    {money(t.hours * t.rate, cur)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="os-btn os-btn-ghost os-btn-sm"
                      onClick={() => removeTimeEntry(t.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={{ fontWeight: 700, color: INK }}>
                  This month total
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {hoursThisMonth.toFixed(1)}
                </td>
                <td></td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: BLUE }}>
                  {money(laborValueThisMonth, cur)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="os-card" style={{ marginTop: 22, padding: 22 }}>
        <div className="os-card-header">
          <div className="os-card-title">Costs</div>
          <div className="os-card-sub">Tools, ads, freelancers, team. A date on a one-time cost is what puts it in the right month.</div>
        </div>

        <AdSpendImport expenses={expenses} onSaved={() => { setExpenses(getExpenses()); setTimeout(() => setIntelKey(k => k + 1), 1500) }} />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
            alignItems: 'end',
            marginBottom: 18,
          }}
        >
          <div className="os-form-group">
            <label className="os-label">Date</label>
            <input
              className="os-input"
              type="date"
              value={eDate}
              max={todayISO()}
              onChange={(e) => setEDate(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label className="os-label">Name</label>
            <input
              className="os-input"
              type="text"
              placeholder="Tool, freelancer, ad spend"
              value={eName}
              onChange={(e) => setEName(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label className="os-label">Category</label>
            <select
              className="os-select"
              value={eCategory}
              onChange={(e) => setECategory(e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="os-form-group">
            <label className="os-label">Amount</label>
            <input
              className="os-input"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={eAmount}
              onChange={(e) => setEAmount(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label className="os-label">Frequency</label>
            <select
              className="os-select"
              value={eFrequency}
              onChange={(e) => setEFrequency(e.target.value as ExpenseFrequency)}
            >
              {EXPENSE_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="os-form-group">
            <label className="os-label">Currency</label>
            <select
              className="os-select"
              value={eCurrency}
              onChange={(e) => setECurrency(e.target.value as Currency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="os-form-group">
            <label className="os-label" style={{ visibility: 'hidden' }}>
              Add
            </label>
            <button className="os-btn os-btn-primary" onClick={addExpense}>
              Add cost
            </button>
          </div>
        </div>

        {expenses.length === 0 ? (
          <EmptyState text="No costs tracked yet. Add your tools, ad spend and freelancers to see your true net profit." />
        ) : (
          <CostTable
            expenses={expenses}
            cur={cur}
            usdPerEur={usdPerEur}
            periodLabel={periodLabel}
            inPeriod={costIn}
            onDelete={removeExpense}
            onRecategorise={(id, category) => { updateExpense(id, { category }); setExpenses(getExpenses()) }}
          />
        )}
        <div style={{ fontSize: 11.5, color: FAINT, marginTop: 8 }}>Recurring tools today: {money(runRate, cur)} a month.</div>
      </div>

      <div
        className="os-card"
        style={{ marginTop: 22, marginBottom: 40, padding: 22, maxWidth: 520 }}
      >
        <div className="os-card-header">
          <div className="os-card-title">Settings</div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="os-form-group" style={{ flex: '1 1 140px' }}>
            <label className="os-label">Default hourly rate</label>
            <input
              className="os-input"
              type="number"
              min="0"
              step="1"
              value={sRate}
              onChange={(e) => setSRate(e.target.value)}
            />
          </div>
          <div className="os-form-group" style={{ flex: '1 1 120px' }}>
            <label className="os-label">Currency</label>
            <select
              className="os-select"
              value={sCurrency}
              onChange={(e) => setSCurrency(e.target.value as Currency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="os-form-group">
            <label className="os-label" style={{ visibility: 'hidden' }}>
              Save
            </label>
            <button className="os-btn os-btn-primary" onClick={saveSettings}>
              Save
            </button>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5, color: FAINT }}>
          Applies to new time entries and currency formatting across this page.
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({
  label,
  value,
  color,
  share,
}: {
  label: string
  value: string
  color: string

  share?: number | null
}) {
  return (
    <tr>
      <td style={{ color: BODY }}>{label}</td>
      <td style={{ textAlign: 'right', fontWeight: 600, color }}>
        {value}
        {typeof share === 'number' && Number.isFinite(share) && (
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: FAINT }}>
            {share.toFixed(0)}%
          </span>
        )}
      </td>
    </tr>
  )
}

function earliestDate(invoices: Invoice[], expenses: BusinessExpense[], time: TimeEntry[]): Date | null {
  let min: Date | null = null
  const consider = (iso?: string | null) => {
    const d = parseDay(iso)
    if (d && (!min || d < min)) min = d
  }
  invoices.forEach(i => consider(i.paidAt ?? i.issueDate))
  expenses.forEach(e => consider(e.date ?? e.createdAt))
  time.forEach(t => consider(t.date))
  return min
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '28px 18px',
        textAlign: 'center',
        color: FAINT,
        fontSize: 14,
        background: 'linear-gradient(120deg,#f7f3fd,var(--os-card))',
        borderRadius: 14,
      }}
    >
      {text}
    </div>
  )
}
