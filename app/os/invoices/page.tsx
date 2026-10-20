'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getInvoices, getDeletedInvoices, restoreInvoice, destroyInvoice, trashDaysLeft, TRASH_DAYS, updateInvoice, deleteInvoice, duplicateInvoice, computeInvoiceStatus, rowToInvoice } from '@/lib/crm-store'
import type { Invoice } from '@/lib/crm-types'
import { confirmAction } from '@/app/os/ConfirmHost'
import { RECEIPT_METHODS, RECEIPT_METHOD_MAX } from '@/lib/payment-details'
import { INVOICE_CURRENCIES, DEFAULT_USD_PER_EUR, loadRate, toUsd, type Money3 } from '@/lib/fx'
import { DateField } from '@/components/os/DateField'
import { liveOverrides, monthLabel } from '@/lib/recurring-override'
import { shareOrCopy } from '@/lib/clipboard'
import PrivacyToggle from '@/components/os/PrivacyToggle'

function fmt(n: number, cur: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

function invoiceBalance(inv: Invoice): number {
  const sub = (inv.lineItems ?? []).reduce((s, li) => s + li.quantity * li.price, 0)
  return sub + (inv.taxes ?? 0) - (inv.amountPaid ?? 0)
}

function invoiceSubtotal(inv: Invoice): number {
  return (inv.lineItems ?? []).reduce((s, li) => s + li.quantity * li.price, 0)
}

const STATUS_COLOR: Record<string, string> = {
  draft: '#9ca3af',
  sent: 'var(--os-accent)',
  paid: 'var(--os-good)',
  overdue: 'var(--os-bad)',
}

const LEAD_DAYS = 5
const NET_DAYS = 7

function nextBillDate(day: 1 | 15): { bill: Date; send: Date; due: Date } {
  const now = new Date()
  let bill = new Date(now.getFullYear(), now.getMonth(), day)
  if (bill.getTime() <= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    bill = day === 1
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), 15) <= now
        ? new Date(now.getFullYear(), now.getMonth() + 1, 15)
        : new Date(now.getFullYear(), now.getMonth(), 15)
  }
  const send = new Date(bill); send.setDate(send.getDate() - LEAD_DAYS)
  const due = new Date(bill); due.setDate(due.getDate() + NET_DAYS)
  return { bill, send, due }
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function invoiceBalanceTotal(inv: Invoice): number {
  const sub = (inv.lineItems ?? []).reduce((n, li) => n + (li.quantity ?? 1) * (li.price ?? 0), 0)
  return sub + (inv.taxes ?? 0)
}

export default function InvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])

  const [currency, setCurrency] = useState<'ALL' | 'USD' | 'EUR' | 'AWG'>('ALL')
  const allCurrencies = currency === 'ALL'
  const [filter, setFilter] = useState<'all' | Invoice['status']>('all')

  const [client, setClient] = useState('all')

  const [kind, setKind] = useState<'recurring' | 'oneoff' | 'all'>('all')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const [armedSend, setArmedSend] = useState<string | null>(null)
  const [armedRemind, setArmedRemind] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [trash, setTrash] = useState<Invoice[]>([])
  const [remindersFor, setRemindersFor] = useState<Invoice | null>(null)
  const [payFor, setPayFor] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')

  const [payMethodOther, setPayMethodOther] = useState('')

  const [payDate, setPayDate] = useState('')

  const [menuPos, setMenuPos] = useState<{ top: number; right: number; flip: boolean }>({ top: 0, right: 0, flip: false })
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3800) }

  const reload = () => {
    const all = getInvoices().map(inv => ({ ...inv, status: computeInvoiceStatus(inv) }))
    setInvoices(all)

    const binned = getDeletedInvoices()
    for (const inv of binned) {
      if (trashDaysLeft(inv.deletedAt) <= 0) destroyInvoice(inv.id)
    }
    setTrash(getDeletedInvoices())
  }

  useEffect(() => {

    reload()

    fetch('/api/os-data?parts=invoices')
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return
        const rows: Record<string, unknown>[] = data.invoices ?? []
        if (!rows.length) return
        localStorage.setItem('bos_invoices', JSON.stringify(rows.map(rowToInvoice)))
      })
      .catch(() => {})

      .finally(() => {
        reload()
      })
  }, [])

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const i of invoices) {
      const key = i.clientEmail || i.clientName
      if (key && !seen.has(key)) seen.set(key, i.clientName || i.clientEmail)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [invoices])

  const isRecurring = (inv: Invoice) => !!inv.recurring || !!inv.recurringParentId
  const filtered = invoices.filter(inv => {
    if (filter !== 'all' && inv.status !== filter) return false
    if (!allCurrencies && inv.currency !== currency) return false
    if (client !== 'all' && (inv.clientEmail || inv.clientName) !== client) return false
    if (kind === 'recurring' && !isRecurring(inv)) return false
    if (kind === 'oneoff' && isRecurring(inv)) return false
    return true
  })

  const sameCurrency = (i: Invoice) => allCurrencies || i.currency === currency
  const anchors = invoices.filter(i => i.recurring && sameCurrency(i))
  const recurringCount = invoices.filter(i => sameCurrency(i) && isRecurring(i)).length
  const oneoffCount = invoices.filter(i => sameCurrency(i) && !isRecurring(i)).length

  const inCurrency = invoices.filter(sameCurrency)
  const outstanding = inCurrency.filter(i => i.status === 'sent').reduce((s, i) => s + invoiceBalance(i), 0)
  const overdue = inCurrency.filter(i => i.status === 'overdue').reduce((s, i) => s + invoiceBalance(i), 0)
  const paid = inCurrency.filter(i => i.status === 'paid').reduce((s, i) => s + i.amountPaid, 0)

  const [usdPerEur, setUsdPerEur] = useState(DEFAULT_USD_PER_EUR)
  useEffect(() => { setUsdPerEur(loadRate()) }, [])

  const usd = (list: Invoice[], amount: (i: Invoice) => number) =>
    list.reduce((s, i) => s + toUsd(amount(i), (i.currency ?? 'USD') as Money3, usdPerEur), 0)

  const allOutstandingUsd = usd(invoices.filter(i => i.status === 'sent'), invoiceBalance)
  const allOverdueUsd = usd(invoices.filter(i => i.status === 'overdue'), invoiceBalance)
  const allPaidUsd = usd(invoices.filter(i => i.status === 'paid'), i => i.amountPaid)

  const hasMixedCurrency = new Set(invoices.map(i => i.currency ?? 'USD')).size > 1

  async function sendReceipt(id: string, method = 'Manual payment', paidAt?: string): Promise<void> {
    try {
      const res = await fetch('/api/send-receipt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ invoiceId: id, method, ...(paidAt ? { paidAt } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { flash('Marked paid, but the receipt email failed. Try Resend receipt.'); return }
      if (data.emailed === false) flash('Marked paid. No client email on file, so no receipt was sent.')
      else flash('Paid. Receipt emailed to the client and saved.')
    } catch {
      flash('Marked paid, but the receipt email failed. Try Resend receipt.')
    }
  }

  async function resendReceipt(id: string) {
    setMenuOpen(null)
    flash('Sending receipt…')
    await sendReceipt(id)
  }

  function downloadInvoice(id: string) {
    setMenuOpen(null)
    window.open(`/api/invoice-pdf?id=${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer')
  }

  async function resendInvoice(inv: Invoice) {
    setMenuOpen(null)
    if (!inv.clientEmail) { flash('No email on this invoice, so there is nowhere to send it.'); return }
    if (armedSend !== inv.id) { setArmedSend(inv.id); return }
    setArmedSend(null)
    flash(`Sending to ${inv.clientEmail}…`)
    try {
      const res = await fetch('/api/send-invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: inv.id, invoiceNumber: inv.number,
          clientName: inv.clientName, clientEmail: inv.clientEmail, clientCompany: inv.clientCompany,
          projectTitle: inv.projectTitle, lineItems: inv.lineItems, taxes: inv.taxes,
          amountPaid: inv.amountPaid, currency: inv.currency,
          dueDate: inv.dueDate, issueDate: inv.issueDate, notes: inv.notes,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d?.error) { flash(`Not sent: ${d?.error ?? `HTTP ${res.status}`}`); return }
      if (inv.status !== 'paid') updateInvoice(inv.id, { status: 'sent', sentAt: new Date().toISOString() })
      flash(`Sent to ${inv.clientEmail}`)
      reload()
    } catch {
      flash('Could not reach the server. Nothing was sent.')
    }
  }

  async function sendReminder(inv: Invoice) {
    setMenuOpen(null)
    if (!inv.clientEmail) { flash('No email on this invoice, so there is nowhere to send it.'); return }
    if (armedRemind !== inv.id) { setArmedRemind(inv.id); return }
    setArmedRemind(null)

    const total = invoiceSubtotal(inv) + inv.taxes
    const due = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00').getTime() : 0
    const daysPastDue = due ? Math.floor((Date.now() - due) / 86_400_000) : 0

    flash(`Sending a reminder to ${inv.clientEmail}…`)
    try {
      const res = await fetch('/api/send-invoice-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: inv.id, number: inv.number,
          clientName: inv.clientName, clientEmail: inv.clientEmail,
          amount: `${inv.currency} ${total.toFixed(2)}`,
          dueLabel: fmtDate(inv.dueDate), daysPastDue,
          token: inv.id,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d?.ok) { flash(`Not sent: ${d?.error ?? `HTTP ${res.status}`}`); return }
      flash(`Reminder sent to ${inv.clientEmail}`)
    } catch {
      flash('Could not reach the server. Nothing was sent.')
    }
  }

  function printInvoice(id: string) {
    setMenuOpen(null)
    window.open(`/invoice/${encodeURIComponent(id)}?preview=1&print=1`, '_blank', 'noopener,noreferrer')
  }

  const currencyTabs = useMemo<Array<'ALL' | 'USD' | 'EUR' | 'AWG'>>(() => {
    const present = new Set(invoices.map(i => (i.currency ?? 'USD') as 'USD' | 'EUR' | 'AWG'))
    const one = (['USD', 'EUR', 'AWG'] as const).filter(c => INVOICE_CURRENCIES.includes(c as 'USD' | 'EUR') || present.has(c))

    return one.length > 1 ? ['ALL', ...one] : one
  }, [invoices])

  function todayLocal(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function openRecordPayment(inv: Invoice) {
    setMenuOpen(null)
    const total = invoiceSubtotal(inv) + inv.taxes
    const outstanding = Math.max(0, total - (inv.amountPaid ?? 0))
    setPayFor(inv)
    setPayAmount(outstanding.toFixed(2))
    setPayMethod(RECEIPT_METHODS[0]?.id ?? 'bank')
    setPayMethodOther('')
    setPayDate(todayLocal())
  }

  async function submitPayment() {
    const inv = payFor
    if (!inv) return
    const total = invoiceSubtotal(inv) + inv.taxes
    const already = inv.amountPaid ?? 0
    const amount = parseFloat(payAmount.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) { flash('That is not an amount.'); return }

    const stamp = new Date(`${payDate}T12:00:00`)
    if (!payDate || Number.isNaN(stamp.getTime())) { flash('Pick the date the payment arrived.'); return }
    if (stamp.getTime() > Date.now() + 86_400_000) { flash('That date is in the future.'); return }
    const paidAtIso = stamp.toISOString()

    const paidNow = already + amount

    const settled = paidNow >= total - 0.005

    const typed = payMethodOther.trim()
    if (payMethod === 'other' && !typed) { flash('Say how the money arrived.'); return }
    const methodLabel = payMethod === 'other'
      ? typed.slice(0, RECEIPT_METHOD_MAX)
      : RECEIPT_METHODS.find(m => m.id === payMethod)?.label ?? 'Manual payment'

    updateInvoice(inv.id, {
      amountPaid: paidNow,
      ...(settled ? { status: 'paid' as const, paidAt: paidAtIso } : {}),
    })
    setPayFor(null)
    reload()

    if (settled) {

      flash('Recorded. Sending the receipt…')
      await sendReceipt(inv.id, methodLabel, paidAtIso)
    } else {
      flash(`Recorded ${inv.currency} ${amount.toFixed(2)} by ${methodLabel}. ${inv.currency} ${(total - paidNow).toFixed(2)} still outstanding, so no receipt yet.`)
    }
  }

  async function voidInvoice(inv: Invoice) {
    setMenuOpen(null)
    if (!(await confirmAction({
      message: `Void invoice ${inv.number}?`,
      detail: 'It stays on the list and keeps its number, stops counting as outstanding, and is never chased. Use this instead of Delete for anything that was actually sent.',
      confirmLabel: 'Void it',
    }))) return
    updateInvoice(inv.id, { status: 'void' })
    reload()
    flash(`${inv.number} voided.`)
  }

  function downloadReceipt(id: string) {
    setMenuOpen(null)
    window.open(`/api/receipt-pdf?id=${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer')
  }

  function markSent(id: string) {
    updateInvoice(id, { status: 'sent', sentAt: new Date().toISOString() })
    setMenuOpen(null)
    reload()
  }

  function copyLink(id: string) {
    const url = `${window.location.origin}/invoice/${id}`
    setMenuOpen(null)
    void shareOrCopy(url, 'Invoice').then(r => {
      if (r === 'copied') flash('Link copied. Paste it into WhatsApp or an email.')
      else if (r === 'failed') { flash('This phone blocked copying. Long-press the link to copy it.'); window.prompt('Invoice link:', url) }
    })
  }

  async function remove(id: string) {
    if (await confirmAction({
      message: 'Move this invoice to the trash?',
      detail: `It leaves the list and keeps its number, and you can restore it from Deleted for ${TRASH_DAYS} days. After that it is gone for good.`,
      confirmLabel: 'Move to trash',
    })) { deleteInvoice(id); reload() }
    setMenuOpen(null)
  }

  function handleDuplicate(id: string) {
    const copy = duplicateInvoice(id)
    setMenuOpen(null)
    if (copy) router.push(`/os/invoices/${copy.id}`)
  }

  return (
    <>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Invoices</div>
          <div className="os-page-sub">{invoices.length} invoices total</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/os/invoices/new" className="os-btn os-btn-primary">
            <i className="ti ti-plus" /> Create New
          </Link>
        </div>
      </div>

      <div className="os-card" style={{ marginBottom: 24 }}>
        <div className="os-inv-overview-head">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--os-text)' }}>Overview</div>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--os-line)', borderRadius: 8, overflow: 'hidden' }}>
            {currencyTabs.map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                style={{ padding: '6px 16px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12.5, background: currency === c ? 'var(--os-accent)' : 'transparent', color: currency === c ? '#fff' : 'var(--os-text-muted)' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="os-inv-stats">
          {[

            { label: 'Outstanding', value: allCurrencies ? fmt(allOutstandingUsd, 'USD') : fmt(outstanding, currency), sub: allCurrencies ? 'Sent, awaiting payment · converted' : 'Sent, awaiting payment' },
            { label: 'Overdue', value: allCurrencies ? fmt(allOverdueUsd, 'USD') : fmt(overdue, currency), sub: allCurrencies ? 'Past due date · converted' : 'Past due date', red: (allCurrencies ? allOverdueUsd : overdue) > 0 },
            { label: 'Total Paid', value: allCurrencies ? fmt(allPaidUsd, 'USD') : fmt(paid, currency), sub: allCurrencies ? 'Collected · converted' : 'Collected', green: true },
          ].map(item => (
            <div key={item.label} className="os-inv-stat">
              <div className="os-inv-stat-value" style={{ color: item.red ? 'var(--os-bad)' : item.green && paid > 0 ? 'var(--os-good)' : 'var(--os-text)' }}>{item.value}</div>
              <div className="os-inv-stat-label">{item.label}</div>
              <div className="os-inv-stat-sub">{item.sub}</div>
            </div>
          ))}
        </div>

        {hasMixedCurrency && (
          <div className="os-inv-total">
            <div className="os-inv-total-head">
              <span>All currencies, in USD</span>
              <span className="os-inv-total-rate">1 EUR = {usdPerEur.toFixed(2)} USD</span>
            </div>
            <div className="os-inv-total-figures">
              <span><strong>{fmt(allOutstandingUsd, 'USD')}</strong> outstanding</span>
              <span><strong style={{ color: allOverdueUsd > 0 ? 'var(--os-bad)' : undefined }}>{fmt(allOverdueUsd, 'USD')}</strong> overdue</span>
              <span><strong style={{ color: allPaidUsd > 0 ? 'var(--os-good)' : undefined }}>{fmt(allPaidUsd, 'USD')}</strong> collected</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'inline-flex', background: 'var(--os-line)', borderRadius: 10, padding: 3, gap: 2, marginBottom: 14 }}>
        {([
          { k: 'all' as const, label: `All (${recurringCount + oneoffCount})` },
          { k: 'recurring' as const, label: `Recurring (${recurringCount})` },
          { k: 'oneoff' as const, label: `One-off (${oneoffCount})` },
        ]).map(t => (
          <button key={t.k} onClick={() => setKind(t.k)}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
              background: kind === t.k ? 'var(--os-card)' : 'transparent',
              color: kind === t.k ? 'var(--os-text)' : 'var(--os-text-faint)',
              boxShadow: kind === t.k ? '0 1px 4px rgba(0,0,0,.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'sent', 'paid', 'overdue', 'draft'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filter === s ? 'var(--os-accent)' : 'transparent', color: filter === s ? '#fff' : 'var(--os-text-muted)', border: `1px solid ${filter === s ? 'var(--os-accent)' : 'var(--os-line)'}` }}>
              {s === 'all' ? 'All invoices' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {trash.length > 0 && (
          <button onClick={() => setShowTrash(v => !v)}
            style={{ padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontSize: 12, background: showTrash ? 'var(--os-bad)' : 'transparent', color: showTrash ? '#fff' : 'var(--os-text-muted)', border: `1px solid ${showTrash ? 'var(--os-bad)' : 'var(--os-line)'}` }}>
            <i className="ti ti-trash" /> Deleted ({trash.length})
          </button>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
        <PrivacyToggle />
        {clientOptions.length > 1 && (
          <select
            className={client === 'all' ? 'os-input' : 'os-input os-private'}
            value={client}
            onChange={e => setClient(e.target.value)}
            style={{ width: 'auto', minWidth: 190, fontSize: 12.5, padding: '5px 10px' }}
          >
            <option value="all">Every client ({clientOptions.length})</option>
            {clientOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        )}
        </div>
      </div>

      {kind === 'recurring' && (
        <div className="os-card" style={{ padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--os-text)', marginBottom: 2 }}>Standing agreements</div>
          <div style={{ fontSize: 12, color: 'var(--os-text-faint)', marginBottom: anchors.length ? 12 : 0 }}>
            Reissued automatically, {LEAD_DAYS} days before the billing day so it lands before the period starts. Net 7.
          </div>
          {anchors.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>
              None yet. Create an invoice, tick <strong>Recurring</strong> and pick its billing day, and it becomes the anchor for that client.
            </div>
          ) : anchors.map(a => {
            const next = nextBillDate(a.recurringDay === 15 ? 15 : 1)
            const adjusted = liveOverrides(a.recurringOverrides)
            return (
              <div key={a.id} onClick={() => router.push(`/os/invoices/${a.id}`)}
                className="os-action-row"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', margin: '0 -10px', borderRadius: 10, cursor: 'pointer', borderTop: '1px solid var(--os-line)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--os-good)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="os-private" style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)' }}>
                    {a.clientName}{a.clientCompany ? <span style={{ color: 'var(--os-text-faint)', fontWeight: 500 }}> · {a.clientCompany}</span> : null}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--os-text-faint)' }}>
                    {fmt(invoiceBalanceTotal(a), a.currency)} on the {a.recurringDay === 15 ? '15th' : '1st'} · sent {fmtDay(next.send)} · due {fmtDay(next.due)}
                  </span>
                  {adjusted.length > 0 && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--os-accent)', fontWeight: 700, marginTop: 2 }}>
                      {adjusted.map(([k, ov]) => `${monthLabel(k)}: ${fmt(ov.amount, a.currency)} once`).join(' · ')}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--os-good)', background: 'var(--os-good-soft)', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  next {fmtDay(next.bill)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {showTrash && (
        <div className="os-card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--os-text)', marginBottom: 4 }}>Deleted invoices</div>
          <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', marginBottom: 14 }}>
            Kept for {TRASH_DAYS} days, then gone for good. Their numbers stay spent either way, so
            restoring one never collides with an invoice issued since.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {trash.map(inv => {
              const left = trashDaysLeft(inv.deletedAt)
              return (
                <div key={inv.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--os-line)', borderRadius: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)' }}>
                      #{inv.number} · <span className="os-private">{inv.clientName}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>
                      {fmt(invoiceSubtotal(inv) + inv.taxes, inv.currency)}
                      {' · deleted '}{fmtDate((inv.deletedAt ?? '').slice(0, 10))}
                      {' · '}
                      <strong style={{ color: left <= 3 ? 'var(--os-bad)' : 'inherit' }}>
                        {left} day{left === 1 ? '' : 's'} left
                      </strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="os-btn" onClick={() => { restoreInvoice(inv.id); reload() }}>Restore</button>
                    <button
                      className="os-btn"
                      style={{ color: 'var(--os-bad)' }}
                      onClick={async () => {
                        if (await confirmAction({
                          message: `Delete invoice #${inv.number} for good?`,
                          detail: 'This cannot be undone. The number stays spent, so the sequence will still show the gap.',
                          confirmLabel: 'Delete for good',
                        })) { destroyInvoice(inv.id); reload() }
                      }}>
                      Delete for good
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!showTrash && (
      <div className="os-card">
        {filtered.length === 0 ? (
          <div className="os-empty">
            <i className="ti ti-receipt" />
            <div className="os-empty-title">No invoices {filter !== 'all' ? `with status "${filter}"` : 'yet'}</div>
            <div className="os-empty-sub">Create your first invoice above</div>
          </div>
        ) : (
          <table className="os-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const total = invoiceSubtotal(inv) + inv.taxes
                return (
                  <tr key={inv.id} style={{ position: 'relative', cursor: 'pointer' }} onClick={() => router.push(`/os/invoices/${inv.id}`)}>
                    <td style={{ fontWeight: 600, color: 'var(--accent)' }}>#{inv.number}</td>
                    <td>
                      <div className="os-private" style={{ fontWeight: 600 }}>{inv.clientName}</div>
                      {inv.clientCompany && <div className="os-private" style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>{inv.clientCompany}</div>}
                      {(inv.reminders?.length ?? 0) > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); setRemindersFor(inv) }}
                          title="See when each reminder went"
                          style={{
                            marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                            background: 'var(--os-warn)18', border: '1px solid var(--os-warn)44', color: 'var(--os-warn)',
                            borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700,
                          }}>
                          <i className="ti ti-bell" />
                          {inv.reminders!.length} reminder{inv.reminders!.length === 1 ? '' : 's'}
                          {' · '}
                          {fmtDate(inv.reminders![inv.reminders!.length - 1].at.slice(0, 10))}
                        </button>
                      )}
                    </td>
                    <td style={{ color: 'var(--os-text-faint)' }}>{fmtDate(inv.issueDate)}</td>
                    <td style={{ color: inv.status === 'overdue' ? 'var(--os-bad)' : 'var(--os-text-faint)' }}>{fmtDate(inv.dueDate)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(total, inv.currency)}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700,
                        background: STATUS_COLOR[inv.status] + '18', color: STATUS_COLOR[inv.status], border: `1px solid ${STATUS_COLOR[inv.status]}44`
                      }}>
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                          const MENU_H = 260
                          const flip = rect.bottom + MENU_H > window.innerHeight
                          setMenuPos({
                            top: flip ? window.innerHeight - rect.top + 6 : rect.bottom + 6,
                            right: window.innerWidth - rect.right,
                            flip,
                          })
                          setMenuOpen(menuOpen === inv.id ? null : inv.id)
                        }}
                        style={{ background: 'none', border: '1px solid var(--os-line)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 16 }}>
                        •••
                      </button>
                      {menuOpen === inv.id && (
                        <div style={{
                          position: 'fixed',
                          ...(menuPos.flip ? { bottom: menuPos.top } : { top: menuPos.top }),
                          right: menuPos.right,

                          background: 'var(--os-base-2, var(--os-card))',
                          backgroundImage: 'var(--os-card-image, none)',
                          border: '1px solid var(--os-line)',
                          borderRadius: 10, boxShadow: '0 18px 48px rgba(0,0,0,0.24)',
                          zIndex: 1000, minWidth: 170, padding: 6,
                          maxHeight: 'calc(100vh - 24px)', overflowY: 'auto',
                        }}>
                          <Link href={`/os/invoices/${inv.id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', color: 'var(--os-text)', textDecoration: 'none', fontSize: 13, borderRadius: 6 }}>
                            <i className="ti ti-edit" /> Edit invoice
                          </Link>
                          <a href={`/invoice/${inv.id}?preview=1`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', color: 'var(--os-text)', textDecoration: 'none', fontSize: 13, borderRadius: 6 }}>
                            <i className="ti ti-eye" /> Preview
                          </a>
                          <button onClick={() => resendInvoice(inv)} onBlur={() => setArmedSend(a => (a === inv.id ? null : a))} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--os-accent)', fontWeight: armedSend === inv.id ? 700 : 600 }}>
                            <i className="ti ti-mail-forward" /> {armedSend === inv.id ? `Press again: email ${inv.clientEmail}` : 'Resend invoice'}
                          </button>
                          <button onClick={() => downloadInvoice(inv.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, fontWeight: 600 }}>
                            <i className="ti ti-file-type-pdf" /> Download PDF
                          </button>
                          <button onClick={() => copyLink(inv.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>
                            <i className="ti ti-link" /> Copy link
                          </button>
                          <button onClick={() => printInvoice(inv.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>
                            <i className="ti ti-printer" /> Print
                          </button>
                          <button onClick={() => handleDuplicate(inv.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>
                            <i className="ti ti-copy" /> Duplicate
                          </button>
                          {inv.status !== 'paid' && inv.status !== 'void' && (
                            <button onClick={() => openRecordPayment(inv)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--os-good)' }}>
                              <i className="ti ti-cash" /> Record a payment
                            </button>
                          )}
                          {inv.status !== 'paid' && inv.status !== 'void' && (
                            <button onClick={() => sendReminder(inv)} onBlur={() => setArmedRemind(a => (a === inv.id ? null : a))} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--os-warn)', fontWeight: armedRemind === inv.id ? 700 : 600 }}>
                              <i className="ti ti-bell" /> {armedRemind === inv.id ? `Press again: remind ${inv.clientEmail}` : 'Send payment reminder'}
                            </button>
                          )}
                          {inv.status === 'paid' && (
                            <>
                              <div style={{ height: 1, background: 'var(--os-chip)', margin: '4px 8px' }} />
                              <a href={`/receipt/${inv.id}?preview=1`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', color: 'var(--os-good)', textDecoration: 'none', fontSize: 13, borderRadius: 6 }}>
                                <i className="ti ti-receipt-2" /> View receipt
                              </a>
                              <button onClick={() => downloadReceipt(inv.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--os-good)' }}>
                                <i className="ti ti-download" /> Download receipt
                              </button>
                              <button onClick={() => resendReceipt(inv.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--os-good)' }}>
                                <i className="ti ti-send" /> Resend receipt
                              </button>
                              <div style={{ height: 1, background: 'var(--os-chip)', margin: '4px 8px' }} />
                            </>
                          )}
                          {inv.status !== 'paid' && inv.status !== 'void' && (
                            <button onClick={() => voidInvoice(inv)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--os-text-faint)' }}>
                              <i className="ti ti-ban" /> Void
                            </button>
                          )}
                          <button onClick={() => remove(inv.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--os-bad)' }}>
                            <i className="ti ti-trash" /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {menuOpen && <div onClick={() => setMenuOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />}

      {remindersFor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setRemindersFor(null)} style={{ position: 'absolute', inset: 0, background: 'var(--os-overlay, rgba(18,0,42,.42))' }} />
          <div role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', border: '1px solid var(--os-line)', borderRadius: 16, padding: '24px 24px 20px', boxShadow: '0 24px 60px rgba(0,0,0,.22)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--os-text)', marginBottom: 4 }}>Reminders sent</div>
            <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', marginBottom: 18 }}>
              {remindersFor.number} · <span className="os-private">{remindersFor.clientName}</span>
              {remindersFor.status === 'paid' ? ' · paid' : ` · ${fmt(invoiceBalance(remindersFor), remindersFor.currency)} still due`}
            </div>

            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
              {(remindersFor.reminders ?? []).map((r, i) => (
                <li key={`${r.at}-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--os-line)' }}>
                  <span style={{ flex: 'none', width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--os-warn)22', color: 'var(--os-warn)', fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-text)' }}>{fmtDate(r.at.slice(0, 10))}</div>
                    <div style={{ fontSize: 12, color: 'var(--os-text-faint)', overflowWrap: 'anywhere' }}>
                      to <span className="os-private">{r.to}</span>
                      {typeof r.daysPastDue === 'number' && r.daysPastDue > 0 && ` · ${r.daysPastDue} day${r.daysPastDue === 1 ? '' : 's'} past due`}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <p style={{ margin: '14px 0 16px', fontSize: 12, lineHeight: 1.6, color: 'var(--os-text-faint)' }}>
              Only reminders the client actually received are listed, recorded once the mail was
              accepted. Anything sent before this log existed is not here.
            </p>

            <button className="os-btn" onClick={() => setRemindersFor(null)} style={{ width: '100%' }}>Close</button>
          </div>
        </div>
      )}

      {payFor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setPayFor(null)} style={{ position: 'absolute', inset: 0, background: 'var(--os-overlay, rgba(18,0,42,.42))' }} />
          <div role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 420, background: 'var(--os-base-2, var(--os-card))', border: '1px solid var(--os-line)', borderRadius: 16, padding: '24px 24px 20px', boxShadow: '0 24px 60px rgba(0,0,0,.22)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--os-text)', marginBottom: 4 }}>Record a payment</div>
            <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', marginBottom: 18 }}>
              {payFor.number} · <span className="os-private">{payFor.clientName}</span> · total {payFor.currency} {(invoiceSubtotal(payFor) + payFor.taxes).toFixed(2)}
              {(payFor.amountPaid ?? 0) > 0 && ` · already recorded ${payFor.currency} ${(payFor.amountPaid ?? 0).toFixed(2)}`}
            </div>

            <DateField
              label="Date it arrived"
              value={payDate}
              max={todayLocal()}
              onChange={setPayDate}
              hint="The day the money actually landed. A future date is refused."
            />

            <label className="os-label">Amount received</label>
            <input
              className="os-input"
              autoFocus
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submitPayment() }}
              inputMode="decimal"
              style={{ marginBottom: 14 }}
            />

            <label className="os-label">How it arrived</label>
            <select
              className="os-input"
              value={payMethod}
              onChange={e => setPayMethod(e.target.value)}
              style={{ marginBottom: payMethod === 'other' ? 10 : 18 }}
            >
              {RECEIPT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>

            {payMethod === 'other' && (
              <input
                className="os-input"
                value={payMethodOther}
                onChange={e => setPayMethodOther(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submitPayment() }}
                placeholder="Cash, Bitcoin, cheque..."

                maxLength={RECEIPT_METHOD_MAX}
                autoFocus
                style={{ marginBottom: 18 }}
              />
            )}

            <p style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--os-text-faint)' }}>
              Once the full amount is recorded the invoice is marked paid and the receipt is
              emailed automatically. A part payment records the balance and sends nothing.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="os-btn os-btn-primary" onClick={submitPayment} style={{ flex: 1 }}>Record payment</button>
              <button className="os-btn" onClick={() => setPayFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--os-deep)', color: 'var(--os-on-deep)', borderRadius: 100, padding: '12px 24px',
          fontSize: 13.5, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
          zIndex: 2000, maxWidth: '90vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
