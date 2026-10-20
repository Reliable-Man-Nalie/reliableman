'use client'

import { BANK, BRAND, bankInfoText, documentName } from '@/lib/brand'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  saveInvoice, updateInvoice, deleteInvoice, duplicateInvoice, lineItemId,
  getOffers, seedDefaultOffers,
} from '@/lib/crm-store'
import type { Invoice, InvoiceLineItem, RecurringOverride } from '@/lib/crm-types'
import { liveOverrides, monthLabel, upcomingMonthKeys } from '@/lib/recurring-override'
import { confirmAction } from '@/app/os/ConfirmHost'
import PrivacyToggle from '@/components/os/PrivacyToggle'
import { currencyOptions } from '@/lib/fx'
import { usePeople } from '@/components/os/usePeople'
import { buildCatalog, CATALOG_GROUPS, STRATEGY_SESSION, type CatalogItem } from '@/lib/invoice-catalog'

function addDays(d: string, n: number): string {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + n)
  return dt.toISOString().slice(0, 10)
}

const today = () => new Date().toISOString().slice(0, 10)

function nextNumber(): string {
  if (typeof window === 'undefined') return String(new Date().getFullYear()) + '126'
  try {
    const stored = JSON.parse(localStorage.getItem('bos_invoices') ?? '[]') as { number: string }[]
    if (!stored.length) return String(new Date().getFullYear()) + '126'
    const nums = stored.map(i => parseInt(i.number, 10)).filter(n => !isNaN(n))
    return String(Math.max(...nums) + 1)
  } catch { return String(new Date().getFullYear()) + '126' }
}

const EMPTY_ITEM = (): InvoiceLineItem => ({ id: lineItemId(), name: '', description: '', quantity: 1, price: 0 })

function strategyLines(intro: boolean): InvoiceLineItem[] {
  const lines: InvoiceLineItem[] = [{ id: lineItemId(), ...STRATEGY_SESSION.line, quantity: 1, price: STRATEGY_SESSION.price }]
  if (intro) lines.push({ id: lineItemId(), name: 'Introductory price', description: 'First session rate', quantity: 1, price: -STRATEGY_SESSION.introDiscount })
  return lines
}

const isBlankLine = (li: InvoiceLineItem) => !li.name.trim() && !(li.description ?? '').trim() && !li.price

export type InvoicePreset = 'strategy' | 'strategy-intro'

const TERMS_DEFAULT = ['Payment is due within 7 days of the invoice date.', bankInfoText()].filter(Boolean).join('\n\n')

type Contact = { name: string; email: string; company: string; phone: string; address: string }

export type InvoicePrefill = {
  clientName?: string
  clientEmail?: string
  clientCompany?: string
  clientPhone?: string
  clientAddress?: string
  clientVat?: string
}

export function InvoiceEditor({ invoice, prefill, preset }: { invoice?: Invoice; prefill?: InvoicePrefill; preset?: InvoicePreset }) {
  const router = useRouter()
  const isEdit = !!invoice

  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'AWG'>((invoice?.currency as 'USD' | 'EUR' | 'AWG') || 'USD')
  const [clientName, setClientName] = useState(invoice?.clientName ?? prefill?.clientName ?? '')
  const [clientEmail, setClientEmail] = useState(invoice?.clientEmail ?? prefill?.clientEmail ?? '')
  const [clientCompany, setClientCompany] = useState(invoice?.clientCompany ?? prefill?.clientCompany ?? '')
  const [clientAddress, setClientAddress] = useState(invoice?.clientAddress ?? prefill?.clientAddress ?? '')
  const [clientPhone, setClientPhone] = useState(invoice?.clientPhone ?? prefill?.clientPhone ?? '')

  const [clientVat, setClientVat] = useState(invoice?.clientVat ?? prefill?.clientVat ?? '')
  const presetOn = !invoice && !!preset
  const [projectTitle, setProjectTitle] = useState(invoice?.projectTitle ?? (presetOn ? STRATEGY_SESSION.title : ''))
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? today())
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? addDays(today(), 7))
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(invoice?.lineItems?.length ? invoice.lineItems
    : presetOn ? strategyLines(preset === 'strategy-intro') : [EMPTY_ITEM()])
  const [notes, setNotes] = useState(invoice?.notes ?? (presetOn ? STRATEGY_SESSION.note : ''))

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  useEffect(() => {
    seedDefaultOffers()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setCatalog(buildCatalog(getOffers()))
  }, [])
  const [terms] = useState(TERMS_DEFAULT)
  const [saving, setSaving] = useState(false)

  const [taxAdded, setTaxAdded] = useState(!!(invoice?.taxRate || invoice?.taxLabel || invoice?.taxes))
  const [taxLabel, setTaxLabel] = useState(invoice?.taxLabel ?? 'VAT')
  const [taxRate, setTaxRate] = useState<number>(invoice?.taxRate ?? 0)

  const [recurring, setRecurring] = useState(!!invoice?.recurring)

  const [cardPayment, setCardPayment] = useState(invoice?.cardPayment !== false)
  const [paymentUrl, setPaymentUrl] = useState(invoice?.paymentUrl ?? '')
  const [paymentUrlLabel, setPaymentUrlLabel] = useState(invoice?.paymentUrlLabel ?? '')
  const [recurringDay, setRecurringDay] = useState<number>(invoice?.recurringDay === 15 ? 15 : 1)

  const [overrides, setOverrides] = useState<Record<string, RecurringOverride>>(invoice?.recurringOverrides ?? {})
  const [ovMonth, setOvMonth] = useState('')
  const [ovAmount, setOvAmount] = useState('')
  const [ovNote, setOvNote] = useState('')

  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.price, 0)
  const taxAmount = taxAdded ? Math.round(subtotal * (taxRate || 0)) / 100 : 0
  const total = subtotal + taxAmount
  const amountPaid = invoice?.amountPaid ?? 0
  const balance = total - amountPaid
  const displayNumber = invoice?.number ?? nextNumber()

  const people = usePeople()
  const contacts: Contact[] = people.map(p => ({ name: p.name, email: p.email, company: p.company, phone: p.phone, address: p.address }))
  const filtered = contacts.filter(c => !search || `${c.name} ${c.email} ${c.company}`.toLowerCase().includes(search.toLowerCase()))

  function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
  }

  function applyStrategy(intro: boolean) {
    setProjectTitle(STRATEGY_SESSION.title)
    setLineItems(strategyLines(intro))
    setNotes(STRATEGY_SESSION.note)
    setCurrency('USD')
  }
  function addLine() { setLineItems(prev => [...prev, EMPTY_ITEM()]) }

  function addFromCatalog(key: string) {
    const item = catalog.find(c => c.key === key)
    if (!item) return
    const line: InvoiceLineItem = { id: lineItemId(), name: item.name, description: item.description, quantity: 1, price: item.price }
    const blank = lineItems.every(isBlankLine)
    setLineItems(prev => [...prev.filter(li => !isBlankLine(li)), line])
    if (blank && item.price > 0) {
      if (!projectTitle.trim()) setProjectTitle(item.key.startsWith('strategy') ? STRATEGY_SESSION.title : item.name)
      if (item.currency === 'USD' || item.currency === 'EUR') setCurrency(item.currency)
    }
  }
  function updateLine(id: string, patch: Partial<InvoiceLineItem>) {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, ...patch } : li))
  }
  function removeLine(id: string) { setLineItems(prev => prev.filter(li => li.id !== id)) }

  const ovMonths = upcomingMonthKeys(recurringDay, 6).filter(k => !overrides[k])
  const ovLive = liveOverrides(overrides)
  function addOverride() {
    const amount = parseFloat(ovAmount)
    const key = ovMonth || ovMonths[0]
    if (!key || !Number.isFinite(amount) || amount < 0) return
    setOverrides(prev => ({ ...prev, [key]: { amount, note: ovNote.trim() || undefined } }))
    setOvMonth(''); setOvAmount(''); setOvNote('')
  }
  function removeOverride(key: string) {
    setOverrides(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  function pickContact(c: Contact) {
    setClientName(c.name); setClientEmail(c.email); setClientCompany(c.company)
    setClientPhone(c.phone); setClientAddress(c.address); setPickerOpen(false); setSearch('')
  }

  function fields(status: Invoice['status']) {
    return {
      clientName, clientEmail, clientCompany, clientAddress, clientPhone, clientVat,
      projectTitle, lineItems, taxes: taxAmount,
      taxLabel: taxAdded ? taxLabel : undefined, taxRate: taxAdded ? taxRate : undefined,
      amountPaid, currency, status, notes, issueDate, dueDate,
      recurring, recurringDay: recurring ? recurringDay : undefined,
      recurringOverrides: recurring && Object.keys(overrides).length ? overrides : undefined,
      cardPayment,
      paymentUrl: paymentUrl.trim() || undefined,
      paymentUrlLabel: paymentUrlLabel.trim() || undefined,
    }
  }

  function persist(status: Invoice['status']): Invoice {
    if (isEdit) {
      updateInvoice(invoice!.id, { ...fields(status) })
      return { ...invoice!, ...fields(status) }
    }
    return saveInvoice(fields(status))
  }

  async function saveClose() {

    if (!clientName.trim()) { await confirmAction({ message: 'Add a client name first.', detail: 'An invoice needs somebody to address it to.', confirmLabel: 'OK', cancelLabel: 'Close', destructive: false }); return }
    setSaving(true)
    persist(isEdit ? (invoice!.status) : 'draft')
    router.push('/os/invoices')
  }

  async function send() {
    if (!clientName.trim()) { await confirmAction({ message: 'Add a client name first.', detail: 'An invoice needs somebody to address it to.', confirmLabel: 'OK', cancelLabel: 'Close', destructive: false }); return }
    setSaving(true)

    const alreadyPaid = invoice?.status === 'paid'
    const inv = persist(alreadyPaid ? 'paid' : 'sent')
    try {
      await fetch('/api/send-invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: inv.id, invoiceNumber: inv.number, clientName, clientEmail, clientCompany,
          projectTitle, lineItems, taxes: taxAmount, amountPaid, currency, dueDate, issueDate, notes,
        }),
      })
    } catch (e) {

      console.error('[invoice] send failed', inv.number, e)
      setSaving(false)
      await confirmAction({ message: 'The invoice was saved, but the email did not send.', detail: 'Try again, or send the link by hand.', confirmLabel: 'OK', cancelLabel: 'Close', destructive: false })
      return
    }
    updateInvoice(inv.id, {
      status: alreadyPaid ? 'paid' : 'sent',
      sentAt: new Date().toISOString(),
    })
    router.push('/os/invoices')
  }

  function markPaid() {
    if (!invoice) return
    updateInvoice(invoice.id, { status: 'paid', amountPaid: total, paidAt: new Date().toISOString() })
    router.push('/os/invoices')
  }
  function duplicate() {
    if (!invoice) return
    const dup = duplicateInvoice(invoice.id)
    if (dup) router.push(`/os/invoices/${dup.id}`)
  }
  async function remove() {
    if (!invoice) return
    if (!(await confirmAction({ message: `Delete invoice #${invoice.number}?`, detail: 'This cannot be undone.' }))) return
    deleteInvoice(invoice.id)
    router.push('/os/invoices')
  }

  const inp: React.CSSProperties = { border: '1px solid var(--os-line)', borderRadius: 4, padding: '8px 10px', fontSize: 13, color: 'var(--os-text)', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif' }
  const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--os-text-faint)', marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.4 }
  const statusColor = invoice?.status === 'paid' ? '#16a34a' : invoice?.status === 'overdue' ? '#dc2626' : invoice?.status === 'sent' ? '#2563eb' : '#7c3aed'

  return (
    <div className="os-inv-editor" style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="os-inv-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href="/os/invoices" style={{ color: 'var(--os-text-faint)', textDecoration: 'none', fontSize: 20, lineHeight: 1 }}>←</Link>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--os-text)' }}>{isEdit ? `Invoice #${invoice!.number}` : 'New Invoice'}</div>
        <span style={{ padding: '3px 10px', background: statusColor + '18', color: statusColor, borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{invoice?.status ?? 'Draft'}</span>
        {invoice?.proposalId && (
          <Link href={`/os/proposals/${invoice.proposalId}/edit`} style={{ fontSize: 11.5, color: 'var(--os-accent)', fontWeight: 600, textDecoration: 'none' }}>↳ from proposal</Link>
        )}
        <div className="os-inv-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PrivacyToggle />
          <div className="os-inv-currency" style={{ display: 'flex', border: '1px solid var(--os-line)', borderRadius: 8, overflow: 'hidden' }}>
            {currencyOptions(invoice?.currency).map(c => (
              <button key={c} type="button" onClick={() => setCurrency(c)} style={{ padding: '7px 16px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: currency === c ? 'var(--os-accent)' : 'var(--os-card)', color: currency === c ? '#fff' : 'var(--os-text-faint)' }}>{c}</button>
            ))}
          </div>
          {isEdit && invoice!.status !== 'paid' && (
            <button type="button" onClick={markPaid} className="os-inv-act" style={{ padding: '8px 14px', background: 'var(--os-card)', border: '1px solid var(--os-good)', color: 'var(--os-good)', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>Mark Paid</button>
          )}
          {isEdit && <button type="button" onClick={duplicate} className="os-inv-act" style={{ padding: '8px 12px', background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, color: 'var(--os-text-muted)' }}>Duplicate</button>}
          <button type="button" onClick={saveClose} disabled={saving} className="os-inv-act" style={{ padding: '8px 16px', background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, color: 'var(--os-text-muted)' }}>Save &amp; Close</button>
          <button type="button" onClick={send} disabled={saving} className="os-inv-act os-inv-send" style={{ padding: '8px 20px', background: 'var(--os-accent)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, color: '#fff' }}>{invoice?.sentAt ? 'Resend Invoice' : 'Send Invoice'}</button>
        </div>
      </div>

      <div className="os-inv-doc" style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, boxShadow: '0 1px 8px rgba(0,0,0,0.06)', padding: '40px 48px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13 }}>
        <div className="os-inv-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div className="os-inv-logo" style={{ width: 80, height: 80, background: '#12002a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            <Image src="/icon.png" alt="Logo" width={64} height={64} style={{ objectFit: 'contain' }} />
          </div>
          <div className="os-inv-meta" style={{ textAlign: 'right' }}>
            <div className="os-inv-number" style={{ fontSize: 20, fontWeight: 900, color: '#0f0020', marginBottom: 10 }}>Invoice #{displayNumber}</div>
            <div className="os-inv-dates" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', alignItems: 'center', fontSize: 12.5 }}>
              <span style={{ color: '#888' }}>Issue Date:</span>
              <input type="date" value={issueDate} onChange={e => { setIssueDate(e.target.value); setDueDate(addDays(e.target.value, 7)) }} style={{ ...inp, width: 130, padding: '4px 8px', fontSize: 12.5 }} />
              <span style={{ color: '#888' }}>Due Date:</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...inp, width: 130, padding: '4px 8px', fontSize: 12.5 }} />
              <span style={{ color: '#888' }}>Sales rep:</span>
              <span style={{ fontWeight: 600 }}>{BRAND.owner}</span>
            </div>
          </div>
        </div>

        <div className="os-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid #eee', fontSize: 12.5, color: '#555', lineHeight: 1.8 }}>
          <div>
            <div style={{ fontWeight: 700, color: '#0f0020', fontSize: 13, marginBottom: 2 }}>{BRAND.name}</div>
            {BRAND.legalName && <div style={{ color: '#0f0020', fontWeight: 500 }}>{documentName()}</div>}
            {BRAND.address && <div>{BRAND.address}</div>}
            {BRAND.email && <div>{BRAND.email}</div>}
            {BRAND.phone && <div>{BRAND.phone}</div>}
          </div>
          <div>
            <div>Website: {BRAND.website.replace(/^https?:\/\//, '')}</div>
            {BANK.iban && <div>IBAN: {BANK.iban}</div>}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <label style={{ ...lbl, marginBottom: 0 }}>Customer *</label>
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => { setPickerOpen(o => !o); setSearch('') }} style={{ background: '#f3edff', color: '#7c3aed', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                {clientName ? 'Change contact' : 'Pick from contacts'}
              </button>
              {pickerOpen && (
                <div className="os-inv-picker" style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, width: 320, background: '#fff', border: '1px solid #e5e0f0', borderRadius: 10, boxShadow: '0 12px 30px rgba(15,0,32,0.15)', padding: 8 }}>
                  <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…" style={{ ...inp, marginBottom: 6 }} />
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {filtered.map((c, i) => (
                      <button key={i} type="button" onClick={() => pickContact(c)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', fontSize: 13 }}>
                        <div className="os-private" style={{ fontWeight: 700, color: '#0f0020' }}>{c.name || c.email}</div>
                        <div className="os-private" style={{ fontSize: 11.5, color: '#999' }}>{[c.company, c.email].filter(Boolean).join(' · ')}</div>
                      </button>
                    ))}
                    {filtered.length === 0 && <div style={{ padding: '12px 10px', color: '#bbb', fontSize: 12.5 }}>No matching contacts. Type the details below.</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
          {pickerOpen && <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />}
          <div className="os-inv-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <input className="os-private" style={inp} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name *" />
            <input className="os-private" style={inp} value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="Company" />
          </div>
          <div className="os-inv-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <input className="os-private" style={inp} type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="Email address" />
            <input className="os-private" style={inp} value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Phone number" />
          </div>
          <textarea style={{ ...inp, resize: 'none', display: 'block', marginBottom: 8 } as React.CSSProperties} rows={2} value={clientAddress} className="os-inv-address os-private" onChange={e => setClientAddress(e.target.value)} placeholder="Billing address (optional)" />
          <input className="os-private" style={inp} value={clientVat} onChange={e => setClientVat(e.target.value)} placeholder="VAT / tax ID (e.g. ESY4830857C)" />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={lbl}>Invoice title</label>
          <input style={{ ...inp, fontSize: 14 }} value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="e.g. Online Growth Partnership, June 2026" />
        </div>

        {!invoice && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#777' }}>Quick fill:</span>
          <button type="button" className="os-btn os-btn-ghost os-btn-sm" onClick={() => applyStrategy(false)}>Strategy Session (${STRATEGY_SESSION.price})</button>
          <button type="button" className="os-btn os-btn-ghost os-btn-sm" onClick={() => applyStrategy(true)}>Strategy Session, intro price (${STRATEGY_SESSION.price - STRATEGY_SESSION.introDiscount})</button>
        </div>}

        <table className="os-inv-lines" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr style={{ background: '#e8e0f4' }}>
              <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#555' }}>Product or Service</th>
              <th style={{ padding: '9px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#555', width: 80 }}>Quantity</th>
              <th style={{ padding: '9px 8px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#555', width: 110 }}>Price</th>
              <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#555', width: 110 }}>Line Total</th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => (
              <tr key={li.id} style={{ borderBottom: '1px solid #f0eafc', background: i % 2 === 0 ? '#fff' : '#fdfcff' }}>
                <td className="os-inv-line-item" style={{ padding: '10px 12px 10px 12px' }}>
                  <input value={li.name} onChange={e => updateLine(li.id, { name: e.target.value })} placeholder="Item name" style={{ ...inp, fontWeight: 600, border: 'none', background: 'transparent', padding: '2px 0', marginBottom: 2 }} />
                  <input value={li.description ?? ''} onChange={e => updateLine(li.id, { description: e.target.value })} placeholder="Write a description" style={{ ...inp, fontSize: 12, color: '#999', border: 'none', background: 'transparent', padding: '2px 0' }} />
                </td>
                <td className="os-inv-line-qty" data-label="Qty" style={{ padding: '10px 8px' }}>
                  <input type="number" min={1} inputMode="numeric" value={li.quantity} onChange={e => updateLine(li.id, { quantity: Number(e.target.value) })} style={{ ...inp, textAlign: 'center', padding: '6px' }} />
                </td>
                <td className="os-inv-line-price" data-label="Price" style={{ padding: '10px 8px' }}>
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={li.price} onChange={e => updateLine(li.id, { price: Number(e.target.value) })} style={{ ...inp, textAlign: 'right', padding: '6px 8px' }} />
                </td>
                <td className="os-inv-line-total" data-label="Line total" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{fmt(li.quantity * li.price)}</td>
                <td className="os-inv-line-remove" style={{ padding: '10px 4px' }}>
                  {lineItems.length > 1 && <button type="button" aria-label="Remove line" onClick={() => removeLine(li.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '8px 0 20px' }}>
          {catalog.length > 0 && (
            <select value="" onChange={e => addFromCatalog(e.target.value)} aria-label="Add a line from your offers"
              style={{ ...inp, width: 'auto', minWidth: 240, maxWidth: '100%', fontSize: 13, fontWeight: 700, color: '#7c3aed', cursor: 'pointer' }}>
              <option value="">+ Add from your offers…</option>
              {CATALOG_GROUPS.map(g => (
                <optgroup key={g} label={g}>
                  {catalog.filter(c => c.group === g).map(c => (
                    <option key={c.key} value={c.key}>{c.name} ({c.price < 0 ? '-' : ''}{c.currency} {Math.abs(c.price).toLocaleString('en-US')}{c.suffix ?? ''})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <button type="button" onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontWeight: 700, fontSize: 13, padding: 0 }}>+ Add a blank line</button>
        </div>

        <div className="os-inv-totals" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <div className="os-minfree" style={{ minWidth: 300 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ color: '#666', fontSize: 13 }}>Subtotal</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{fmt(subtotal)}</span>
            </div>

            {taxAdded ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <input value={taxLabel} onChange={e => setTaxLabel(e.target.value)} placeholder="Tax name" style={{ ...inp, width: 90, padding: '4px 8px', fontSize: 12.5 }} />
                <input type="number" min={0} step="0.1" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} style={{ ...inp, width: 64, padding: '4px 8px', fontSize: 12.5, textAlign: 'right' }} />
                <span style={{ fontSize: 12.5, color: '#888' }}>%</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>{fmt(taxAmount)}</span>
                <button type="button" onClick={() => { setTaxAdded(false); setTaxRate(0) }} title="Remove tax" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ) : (
              <div style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <button type="button" onClick={() => setTaxAdded(true)} style={{ background: 'none', border: 'none', color: '#7c3aed', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>+ Add tax</button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Invoice total</span>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{fmt(total)}</span>
            </div>
            {amountPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: '#666', fontSize: 13 }}>Amount paid</span>
                <span style={{ fontSize: 13, color: '#16a34a' }}>-{fmt(amountPaid)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#e8e0f4', borderRadius: 6, marginTop: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 13.5 }}>Balance Due</span>
              <span style={{ fontWeight: 900, fontSize: 15, color: '#0f0020' }}>{fmt(balance)}</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#faf8ff', border: '1px solid #ede8fb', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#0f0020' }}>
            <input type="checkbox" checked={cardPayment} onChange={e => setCardPayment(e.target.checked)} />
            Offer card payment on this invoice
          </label>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6, lineHeight: 1.5 }}>
            {cardPayment
              ? 'They can pay by card through Stripe, or transfer. Card is faster for them, and the payout takes a few days to reach you.'
              : 'Bank transfer only. The card button is hidden and your transfer details are what they see.'}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 260px' }}>
              <label style={lbl}>Your own payment link</label>
              <input
                style={inp}
                value={paymentUrl}
                onChange={e => setPaymentUrl(e.target.value)}
                placeholder="Optional. Paste a payment link"
              />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label style={lbl}>Button says</label>
              <input
                style={inp}
                value={paymentUrlLabel}
                onChange={e => setPaymentUrlLabel(e.target.value)}
                placeholder="Pay this invoice"
              />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6, lineHeight: 1.5 }}>
            <strong>Usually leave this empty.</strong> Card payment through Stripe is already
            handled by the tick box above, for the exact amount due. Only paste something here
            (a PayPal or bank payment link) if this client pays that way instead, and it becomes
            the main button above the card option.
          </div>
        </div>

        <div style={{ background: '#faf8ff', border: '1px solid #ede8fb', borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#0f0020' }}>
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
            Make this a recurring monthly invoice
          </label>
          {recurring && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#666' }}>
              Bill on the
              <select value={recurringDay} onChange={e => setRecurringDay(Number(e.target.value))} style={{ ...inp, width: 90, padding: '5px 8px' }}>
                <option value={1}>1st</option>
                <option value={15}>15th</option>
              </select>
              of each month
            </span>
          )}
          {recurring && <span style={{ fontSize: 11.5, color: '#b6adc9', width: '100%' }}>A fresh copy is generated and emailed automatically each month by the billing cron.</span>}

          {recurring && (
            <div style={{ width: '100%', borderTop: '1px solid #ede8fb', paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f0020', marginBottom: 2 }}>Charge a different amount for one month</div>
              <div style={{ fontSize: 11.5, color: '#8b839a', marginBottom: 10 }}>
                The usual amount stays {fmt(total)}. Only the month you pick below is billed differently, then it goes back by itself.
              </div>
              {ovLive.length > 0 && (
                <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                  {ovLive.map(([key, ov]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#241a33', background: '#fff', border: '1px solid #ede8fb', borderRadius: 8, padding: '8px 12px' }}>
                      <span style={{ fontWeight: 700, minWidth: 120 }}>{monthLabel(key)}</span>
                      <span style={{ fontWeight: 800, color: '#7C3AED' }}>{fmt(ov.amount)}</span>
                      {ov.note && <span style={{ color: '#8b839a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ov.note}</span>}
                      <button type="button" onClick={() => removeOverride(key)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8b839a', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              {ovMonths.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={ovMonth || ovMonths[0]} onChange={e => setOvMonth(e.target.value)} style={{ ...inp, width: 160, padding: '6px 8px' }}>
                    {ovMonths.map(k => <option key={k} value={k}>{monthLabel(k)}</option>)}
                  </select>
                  <input type="number" min={0} step="1" placeholder="Amount" value={ovAmount} onChange={e => setOvAmount(e.target.value)}
                    style={{ ...inp, width: 110, padding: '6px 8px' }} />
                  <input type="text" placeholder="Why (printed on the invoice), optional" value={ovNote} onChange={e => setOvNote(e.target.value)} maxLength={120}
                    style={{ ...inp, flex: 1, minWidth: 200, padding: '6px 8px' }} />
                  <button type="button" onClick={addOverride} disabled={!ovAmount}
                    style={{ padding: '7px 14px', borderRadius: 12, border: '1px solid #7C3AED', background: ovAmount ? '#7C3AED' : '#fff', color: ovAmount ? '#fff' : '#7C3AED', fontWeight: 700, fontSize: 12.5, cursor: ovAmount ? 'pointer' : 'default' }}>
                    Set for that month
                  </button>
                  {!invoice?.recurring && <span style={{ width: '100%', fontSize: 11.5, color: '#b6adc9' }}>Saved with the invoice.</span>}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Notes</label>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="An additional note for your customer, e.g. 'Thanks for your business.'" style={{ ...inp, resize: 'vertical' } as React.CSSProperties} />
        </div>

        <div>
          <label style={lbl}>Terms &amp; Conditions</label>
          <div style={{ ...inp, whiteSpace: 'pre-wrap', color: '#666', fontSize: 12, lineHeight: 1.7, background: '#fafafa' }}>{terms}</div>
        </div>
      </div>

      {isEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 0' }}>
          <button type="button" onClick={remove} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Delete invoice</button>
        </div>
      )}
      <div style={{ height: 40 }} />
    </div>
  )
}
