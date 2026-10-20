'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  getClientRecords, createClientRecord, updateClientRecord, deleteClientRecord,
  CLIENT_DELIVERY_STAGES, CLIENT_DELIVERY_HINTS, normalizeDeliveryStage,
  type ClientRecord, type ClientDeliveryStage,
} from '@/lib/client-store'
import { getDeals, getInvoices, getProposals, hydrateFromSupabase } from '@/lib/crm-store'
import type { Deal, Invoice, Proposal } from '@/lib/crm-types'
import { confirmAction } from '@/app/os/ConfirmHost'
import { currencyOptions } from '@/lib/fx'
import { planSplit } from '@/lib/people'
import { useIsNarrow, initialsOf, avatarBgOf } from '@/components/os/PersonBits'
import { EmailText } from '@/components/os/CopyEmail'

const STAGE_META: Record<ClientDeliveryStage, { color: string; bg: string; emoji: string }> = {
  'Onboarding':  { color: 'var(--os-warn)', bg: 'rgba(232,165,22,.14)', emoji: '🧭' },
  'First call':  { color: 'var(--os-accent)', bg: 'rgba(124,77,214,.12)', emoji: '📞' },
  'Coaching':    { color: 'var(--os-accent)', bg: 'rgba(107,120,232,.14)', emoji: '🌀' },
  'Setup':       { color: 'var(--os-bad)', bg: 'rgba(224,104,63,.14)', emoji: '⚙️' },
  'Launch':      { color: 'var(--os-good)', bg: 'rgba(8,145,178,.14)', emoji: '🚀' },
  'Retainer':    { color: 'var(--os-warn)', bg: 'rgba(232,165,22,.16)', emoji: '🔁' },
  'In group program': { color: '#9333ea', bg: 'rgba(147,51,234,.12)', emoji: '🟣' },
  'Complete':    { color: 'var(--os-good)', bg: 'rgba(31,138,91,.12)', emoji: '✅' },
}

const PROGRAMS = ['Group Coaching', 'Group Coaching Premium', '1:1 Coaching']

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

const AVATAR_BG = [
  'linear-gradient(150deg,var(--os-accent),#b06fd6)',
  'linear-gradient(150deg,var(--os-bad),#eaa92e)',
  'linear-gradient(150deg,var(--os-good),var(--os-accent))',
  'linear-gradient(150deg,var(--os-warn),var(--os-bad))',
  'linear-gradient(150deg,#0891b2,var(--os-accent))',
]

function normalized(f: { monthlyAmount: string; startedAt: string; photoUrl: string; planName: string; website: string; instagram: string; role: string; location: string }) {
  const n = parseFloat(f.monthlyAmount)
  return {
    monthlyAmount: Number.isFinite(n) && n > 0 ? n : undefined,
    photoUrl: f.photoUrl.trim() || undefined,
    planName: f.planName.trim() || undefined,
    website: f.website.trim() || undefined,
    instagram: f.instagram.trim() || undefined,
    role: f.role.trim() || undefined,
    location: f.location.trim() || undefined,
    startedAt: f.startedAt ? new Date(f.startedAt).toISOString() : new Date().toISOString(),
  }
}

const AWG_PER_USD = 1.8
const FX_KEY = 'bos_usd_per_eur'
const DEFAULT_USD_PER_EUR = 1.1

function loadRate(): number {
  if (typeof window === 'undefined') return DEFAULT_USD_PER_EUR
  const raw = window.localStorage.getItem(FX_KEY)
  const n = raw ? parseFloat(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_PER_EUR
}

function saveRate(n: number) {
  if (typeof window !== 'undefined') window.localStorage.setItem(FX_KEY, String(n))
}

function toEur(amount: number, currency: 'USD' | 'EUR' | 'AWG', usdPerEur: number): number {
  if (currency === 'EUR') return amount
  const usd = currency === 'AWG' ? amount / AWG_PER_USD : amount
  return usd / usdPerEur
}

const eur = (n: number) => '\u20ac' + Math.round(n).toLocaleString()

export interface BillingClient {
  email: string
  name: string
  company?: string
  monthlyAmount?: number
  currency: 'USD' | 'EUR' | 'AWG'
  source: string
  since?: string
}

function liveInvoice(inv: Invoice): boolean {

  return inv.status !== 'draft'
}

function recurringProposal(p: Proposal): boolean {
  return p.status === 'signed' && (p.paymentSchedule?.length ?? 0) > 1
}

function invoiceTotal(inv: Invoice): number {
  const sub = (inv.lineItems ?? []).reduce((n, li) => n + (li.quantity ?? 1) * (li.price ?? 0), 0)
  return sub + (inv.taxes ?? 0)
}

function deriveBillingClients(invoices: Invoice[], proposals: Proposal[]): BillingClient[] {
  const byEmail = new Map<string, BillingClient>()

  const put = (b: BillingClient) => {
    const key = b.email.trim().toLowerCase()
    if (!key) return
    const prev = byEmail.get(key)

    if (!prev) { byEmail.set(key, b); return }
    byEmail.set(key, {
      ...prev,
      monthlyAmount: prev.monthlyAmount ?? b.monthlyAmount,
      company: prev.company || b.company,
      since: prev.since && b.since ? (prev.since < b.since ? prev.since : b.since) : (prev.since || b.since),
      source: prev.source === b.source ? prev.source : `${prev.source} + ${b.source}`,
    })
  }

  for (const p of proposals.filter(recurringProposal)) {
    const months = p.paymentSchedule.length
    const amounts = p.paymentSchedule.map(m => m.amount)
    const even = amounts.every(a => a === amounts[0])
    put({
      email: p.clientEmail, name: p.clientName, company: p.clientCompany,

      monthlyAmount: even ? amounts[0] : undefined,
      currency: (p.currency as BillingClient['currency']) ?? 'USD',
      source: even ? `Recurring · ${months} months` : `Signed · ${months} payments`,
      since: p.signedAt || p.createdAt,
    })
  }

  for (const inv of invoices.filter(liveInvoice)) {
    put({
      email: inv.clientEmail, name: inv.clientName, company: inv.clientCompany,
      monthlyAmount: inv.recurring ? invoiceTotal(inv) : undefined,
      currency: (inv.currency as BillingClient['currency']) ?? 'USD',
      source: inv.recurring ? 'Recurring invoice' : `Invoice ${inv.status}`,
      since: inv.issueDate || inv.createdAt,
    })
  }

  return [...byEmail.values()]
}

function monthsWith(startedAt?: string): string {
  if (!startedAt) return 'Client'
  const start = new Date(startedAt)
  if (Number.isNaN(start.getTime())) return 'Client'
  const months = Math.max(0, Math.round((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
  if (months < 1) return 'Just started'
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} with you`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem === 0
    ? `${years} year${years === 1 ? '' : 's'} with you`
    : `${years}y ${rem}m with you`
}

function avatarBg(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]
}

function ClientModal({
  client, deals, onClose, onSaved,
}: {
  client?: ClientRecord
  deals: Deal[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: client?.name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    company: client?.company ?? '',
    program: client?.program ?? '',
    status: (client?.status ?? 'active') as ClientRecord['status'],
    deliveryStage: normalizeDeliveryStage(client?.deliveryStage),
    coachNote: client?.coachNote ?? '',
    dealId: client?.dealId ?? '',
    monthlyAmount: client?.monthlyAmount != null ? String(client.monthlyAmount) : '',
    currency: (client?.currency ?? 'USD') as 'USD' | 'EUR' | 'AWG',
    photoUrl: client?.photoUrl ?? '',
    planName: client?.planName ?? '',
    website: client?.website ?? '',
    instagram: client?.instagram ?? '',
    role: client?.role ?? '',
    location: client?.location ?? '',
    startedAt: (client?.startedAt ?? new Date().toISOString()).slice(0, 10),
  })

  function autofillDeal(dealId: string) {
    const deal = deals.find(d => d.id === dealId)
    if (!deal) return
    setForm(f => ({ ...f, dealId, name: f.name || deal.clientName, email: f.email || deal.clientEmail, phone: f.phone || (deal.clientPhone ?? ''), company: f.company || (deal.clientCompany ?? ''), website: f.website || (deal.clientWebsite ?? ''), instagram: f.instagram || (deal.instagram ?? ''), role: f.role || (deal.clientRole ?? ''), location: f.location || (deal.location ?? '') }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (client) {
      updateClientRecord(client.id, { ...form, ...normalized(form) })
    } else {
      createClientRecord({ ...form, ...normalized(form) })
    }
    onSaved()
    onClose()
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(28,21,53,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 24px 80px var(--os-line)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--os-text)' }}>
            {client ? 'Edit Client' : 'Add Active Client'}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: 'rgba(124,77,214,.1)', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: 'var(--os-accent)' }}>✕</button>
        </div>

        {!client && deals.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <label className="os-label">Link to a signed deal (auto-fills info)</label>
            <select className="os-select" value={form.dealId} onChange={e => { setForm(f => ({ ...f, dealId: e.target.value })); autofillDeal(e.target.value) }}>
              <option value="">— Start fresh —</option>
              {deals.filter(d => d.stage === 'signed').map(d => (
                <option key={d.id} value={d.id}>{d.clientName}{d.clientCompany ? ` · ${d.clientCompany}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        <form className="os-form" onSubmit={submit}>
          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">Full Name *</label>
              <input className="os-input" required value={form.name} onChange={set('name')} placeholder="Maria Martina" />
            </div>
            <div className="os-form-group">
              <label className="os-label">Email</label>
              <input className="os-input" type="email" value={form.email} onChange={set('email')} />
            </div>
          </div>
          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">WhatsApp</label>
              <input className="os-input" value={form.phone} onChange={set('phone')} placeholder="+297 xxx xxxx" />
            </div>
            <div className="os-form-group">
              <label className="os-label">Company</label>
              <input className="os-input" value={form.company} onChange={set('company')} />
            </div>
          </div>

          <div className="os-form-group">
            <label className="os-label">Website</label>
            <input className="os-input" value={form.website} onChange={set('website')} placeholder="https://theirsite.com" inputMode="url" />
          </div>

          <details style={{ marginBottom: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--os-accent)', padding: '4px 0' }}>
              More details
            </summary>
            <div style={{ paddingTop: 10 }}>
              <div className="os-form-row">
                <div className="os-form-group">
                  <label className="os-label">Instagram</label>
                  <input className="os-input" value={form.instagram} onChange={set('instagram')} placeholder="@handle" />
                </div>
                <div className="os-form-group">
                  <label className="os-label">Role</label>
                  <input className="os-input" value={form.role} onChange={set('role')} placeholder="Owner, Marketing Lead…" />
                </div>
              </div>
              <div className="os-form-group">
                <label className="os-label">Location</label>
                <input className="os-input" value={form.location} onChange={set('location')} placeholder="City, country" />
              </div>
            </div>
          </details>
          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">Paying per month</label>
              <input className="os-input" type="number" inputMode="decimal" min="0" step="any"
                value={form.monthlyAmount} onChange={set('monthlyAmount')} placeholder="1000" />
              <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)', marginTop: 4 }}>Leave empty for one-off or unpaid clients.</div>
            </div>
            <div className="os-form-group">
              <label className="os-label">Currency</label>
              <select className="os-select" value={form.currency} onChange={set('currency')}>
                {currencyOptions(form.currency).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">Plan</label>
              <input className="os-input" value={form.planName} onChange={set('planName')} placeholder="Group Coaching, Premium, 1:1…" />
            </div>
            <div className="os-form-group">
              <label className="os-label">Client since</label>
              <input className="os-input" type="date" value={form.startedAt} onChange={set('startedAt')} />
            </div>
          </div>
          <div className="os-form-group">
            <label className="os-label">Photo URL</label>
            <input className="os-input" value={form.photoUrl} onChange={set('photoUrl')} placeholder="https://… or /images/bos/clients/name.jpg" />
            <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)', marginTop: 4 }}>
              A picture of their face. Falls back to their initials if empty.
            </div>
          </div>

          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">Delivery Stage</label>
              <select className="os-select" value={form.deliveryStage} onChange={set('deliveryStage')}>
                {CLIENT_DELIVERY_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="os-form-group">
              <label className="os-label">Coaching Program</label>
              <select className="os-select" value={form.program} onChange={set('program')}>
                {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="os-form-group">
            <label className="os-label">Coach Note (internal)</label>
            <textarea className="os-textarea" value={form.coachNote} onChange={set('coachNote')} placeholder="Goals, context, what to watch for..." rows={3} />
          </div>
          <button type="submit" className="os-btn os-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            {client ? 'Save Changes' : '+ Add Client'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ClientKanbanCard({
  client, onEdit, onDelete, onMoveStage, onOpen,
}: {
  client: ClientRecord
  idx: number
  onEdit: () => void
  onOpen?: () => void
  onDelete: () => void
  onMoveStage: (stage: ClientDeliveryStage) => void
}) {
  const [hover, setHover] = useState(false)
  const stage = normalizeDeliveryStage(client.deliveryStage)
  const meta = STAGE_META[normalizeDeliveryStage(stage)]
  const total = CLIENT_DELIVERY_STAGES.length
  const stageIdx = CLIENT_DELIVERY_STAGES.indexOf(stage as ClientDeliveryStage)
  const stageNum = stageIdx + 1
  const pct = Math.round((stageNum / total) * 100)
  const nextStage = stageIdx < total - 1 ? CLIENT_DELIVERY_STAGES[stageIdx + 1] : null

  function startedAgo(): string {
    const at = client.startedAt
    if (!at) return ''
    const days = Math.floor((Date.now() - new Date(at).getTime()) / 86400000)
    if (days <= 0) return 'today'
    if (days === 1) return '1 day'
    if (days < 30) return `${days} days`
    const m = Math.floor(days / 30)
    return m === 1 ? '1 month' : `${m} months`
  }
  const ago = startedAgo()

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--os-card)',
        border: '1px solid var(--os-line)',
        borderRadius: 16,
        marginBottom: 10,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: hover ? '0 14px 32px rgba(60,40,100,.14)' : '0 1px 3px rgba(60,40,100,.05)',
        transform: hover ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow .18s ease, transform .18s ease',
      }}
    >
      <div style={{ height: 4, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}66)` }} />

      <div style={{ padding: '15px 16px 16px' }}>
        <div style={{ position: 'absolute', top: 14, right: 12, display: 'flex', gap: 2, opacity: hover ? 1 : 0, transition: 'opacity .15s ease' }}>
          <button onClick={onEdit} title="Edit" style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', background: 'var(--os-line)', color: 'var(--os-text-faint)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            <i className="ti ti-pencil" />
          </button>
          <button onClick={onDelete} title="Remove" style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', background: 'rgba(220,38,38,.07)', color: 'var(--os-bad)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            <i className="ti ti-trash" />
          </button>
        </div>

        <div
          onClick={onOpen}
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          onKeyDown={e => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}
          style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14, paddingRight: 50, cursor: onOpen ? 'pointer' : 'default' }}
        >
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: avatarBg(client.id), display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 14, flexShrink: 0, boxShadow: '0 3px 8px rgba(60,40,100,.18)' }}>
            {initials(client.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 14.5, color: 'var(--os-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>{client.name}</div>
            <div style={{ fontSize: 12, color: 'var(--os-text-faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.company ? client.company : <EmailText email={client.email} />}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'rgba(124,77,214,.1)', color: 'var(--os-accent)' }}>{client.program}</span>
          {ago && <span style={{ fontSize: 11, color: '#b3a9c9', display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className="ti ti-clock" style={{ fontSize: 12 }} /> {ago}</span>}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-space-mono), monospace', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: meta.color, fontWeight: 700 }}>{meta.emoji} {stage}</span>
            <span style={{ fontFamily: 'var(--font-space-mono), monospace', fontSize: 10.5, color: 'var(--os-text-faint)' }}>{stageNum}/{total}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: '#efeaf7', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}aa)`, transition: 'width .4s ease' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/os/clients/${client.id}`} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--os-deep)', color: 'var(--os-on-deep)', borderRadius: 10, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
            Open <i className="ti ti-arrow-right" />
          </Link>
          {client.email && (
            <a
              href={`/os/contacts/${encodeURIComponent(client.email)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open their contact page"
              style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--os-card)', border: '1px solid var(--os-line)', color: 'var(--os-text)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
            >
              <i className="ti ti-eye" /> Contact
            </a>
          )}
          <Link
            href={`/os/invoices/new?name=${encodeURIComponent(client.name ?? '')}&email=${encodeURIComponent(client.email ?? '')}`}
            style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--os-card)', border: '1px solid var(--os-line)', color: 'var(--os-text)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
          >
            <i className="ti ti-file-dollar" /> Invoice
          </Link>
          {nextStage ? (
            <button
              onClick={() => onMoveStage(nextStage)}
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: meta.bg, color: meta.color, border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={`Advance to ${nextStage}`}
            >
              {nextStage} <i className="ti ti-chevron-right" />
            </button>
          ) : (
            <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'rgba(31,138,91,.1)', color: 'var(--os-good)', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 700 }}>
              <i className="ti ti-check" /> Final stage
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function ArchiveRow({ client, onReactivate }: { client: ClientRecord; onReactivate: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--os-line)', background: 'var(--os-card)' }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarBg(client.id), display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
        {initials(client.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--os-text)' }}>{client.name}</div>
        <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>{client.company ? client.company : <EmailText email={client.email} />}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'rgba(31,138,91,.1)', color: 'var(--os-good)', flexShrink: 0 }}>
        {client.deliveryStage ?? 'Complete'}
      </span>
      <span style={{ fontSize: 11, color: 'var(--os-text-faint)', flexShrink: 0 }}>{client.program}</span>
      <button
        onClick={onReactivate}
        style={{ background: 'rgba(124,77,214,.1)', color: 'var(--os-accent)', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
      >
        Reactivate
      </button>
    </div>
  )
}

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [usdPerEur, setUsdPerEur] = useState(DEFAULT_USD_PER_EUR)
  const [editRate, setEditRate] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editClient, setEditClient] = useState<ClientRecord | undefined>()
  const [tab, setTab] = useState<'book' | 'stages' | 'archive'>('book')

  const [planFilter, setPlanFilter] = useState<'all' | 'group' | 'retainer'>('all')
  const narrow = useIsNarrow()

  const readLocal = useCallback(() => {
    setClients(getClientRecords())
    setDeals(getDeals())
    setUsdPerEur(loadRate())
    setInvoices(getInvoices())
    setProposals(getProposals())
  }, [])

  const reload = useCallback(async () => {
    readLocal()
    await hydrateFromSupabase()
    readLocal()
  }, [readLocal])

  useEffect(() => {
    reload()

    window.addEventListener('bos:hydrated', readLocal)
    window.addEventListener('bos:client-promoted', reload as EventListener)
    return () => {
      window.removeEventListener('bos:hydrated', readLocal)
      window.removeEventListener('bos:client-promoted', reload as EventListener)
    }
  }, [reload, readLocal])

  async function remove(id: string) {
    if (!(await confirmAction({ message: 'Remove this client?', detail: 'Their data will also be removed.', confirmLabel: 'Remove' }))) return
    deleteClientRecord(id)
    reload()
  }

  function moveStage(id: string, stage: ClientDeliveryStage) {
    const isComplete = stage === 'Complete'
    updateClientRecord(id, { deliveryStage: stage, status: isComplete ? 'completed' : 'active' })
    reload()
  }

  function reactivate(id: string) {
    updateClientRecord(id, { status: 'active', deliveryStage: 'Retainer' })
    reload()
  }

  const active = clients.filter(c => c.status !== 'completed')

  const groupCount = active.filter(c => planSplit(c).group).length
  const retainerCount = active.filter(c => planSplit(c).retainer).length
  const shown = active.filter(c => planFilter === 'all' || (planFilter === 'group' ? planSplit(c).group : planSplit(c).retainer))

  const billing = deriveBillingClients(invoices, proposals)
  const knownEmails = new Set(clients.map(c => (c.email ?? '').trim().toLowerCase()).filter(Boolean))
  const unbooked = billing.filter(b => !knownEmails.has(b.email.trim().toLowerCase()))
  const unbookedMrr = unbooked
    .filter(b => (b.currency ?? 'USD') === 'USD' && (b.monthlyAmount ?? 0) > 0)
    .reduce((sum, b) => sum + (b.monthlyAmount ?? 0), 0)

  function addFromBilling(b: BillingClient) {
    createClientRecord({
      name: b.name || b.email, email: b.email, company: b.company,
      program: b.source,
      monthlyAmount: b.monthlyAmount, currency: b.currency,
      status: 'active', deliveryStage: 'Retainer',
      startedAt: b.since ? new Date(b.since).toISOString() : new Date().toISOString(),
      planName: b.source,
    })
    reload()
  }

  function openContact(c: ClientRecord) {
    if (c.email) router.push(`/os/contacts/${encodeURIComponent(c.email)}`)
    else { setEditClient(c); setShowCreate(true) }
  }

  function addAllFromBilling() {
    unbooked.forEach(addFromBilling)
  }

  const paying = active.filter(c => (c.monthlyAmount ?? 0) > 0)

  const mrrEur = paying.reduce((sum, c) => sum + toEur(c.monthlyAmount ?? 0, c.currency ?? 'USD', usdPerEur), 0)
  const byCurrency = (['USD', 'EUR', 'AWG'] as const).map(cur => ({
    cur,
    count: paying.filter(c => (c.currency ?? 'USD') === cur).length,
    raw: paying.filter(c => (c.currency ?? 'USD') === cur).reduce((n, c) => n + (c.monthlyAmount ?? 0), 0),
  })).filter(x => x.count > 0)
  const avgEur = paying.length ? mrrEur / paying.length : 0
  const archived = clients.filter(c => c.status === 'completed')

  const byStage = CLIENT_DELIVERY_STAGES.reduce<Record<string, ClientRecord[]>>((acc, s) => {
    acc[s] = active.filter(c => normalizeDeliveryStage(c.deliveryStage) === s)
    return acc
  }, {} as Record<string, ClientRecord[]>)

  return (
    <>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Active Clients</div>
          <div className="os-page-sub">
            {active.length} active · {eur(mrrEur)} per month · {archived.length} archived
          </div>
        </div>
        <div className="os-chiprow" style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setTab('book')}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: tab === 'book' ? 'var(--os-accent-soft)' : 'var(--os-card)', color: tab === 'book' ? '#fff' : 'var(--os-text-muted)', boxShadow: tab === 'book' ? 'none' : '0 1px 4px var(--os-line)' }}
          >
            Clients
          </button>
          <button
            onClick={() => setTab('stages')}
            title="Where every client stands in delivery"
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: tab === 'stages' ? 'var(--os-accent-soft)' : 'var(--os-card)', color: tab === 'stages' ? '#fff' : 'var(--os-text-muted)', boxShadow: tab === 'stages' ? 'none' : '0 1px 4px var(--os-line)' }}
          >
            Stages
          </button>
          <button
            onClick={() => setTab('archive')}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: tab === 'archive' ? 'var(--os-accent-soft)' : 'var(--os-card)', color: tab === 'archive' ? '#fff' : 'var(--os-text-muted)', boxShadow: tab === 'archive' ? 'none' : '0 1px 4px var(--os-line)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Archive {archived.length > 0 && <span style={{ background: 'rgba(31,138,91,.15)', color: 'var(--os-good)', borderRadius: 20, padding: '1px 8px', fontSize: 11 }}>{archived.length}</span>}
          </button>
          <button className="os-btn os-btn-primary" onClick={() => { setEditClient(undefined); setShowCreate(true) }}>
            + New Client
          </button>
        </div>
      </div>

      {tab === 'book' && (
        <>
          {unbooked.length > 0 && (
            <div className="os-card" style={{ marginBottom: 18, borderLeft: '3px solid var(--os-warn)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--os-text)' }}>
                    {unbooked.length} paying {unbooked.length === 1 ? 'person is' : 'people are'} not on your book yet
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--os-text-muted)', marginTop: 3 }}>
                    From live invoices and signed recurring agreements
                    {unbookedMrr > 0 && <> · <strong style={{ color: 'var(--os-good)' }}>${unbookedMrr.toLocaleString()}/mo</strong> missing from your MRR</>}
                  </div>
                </div>
                <button className="os-btn os-btn-primary" onClick={addAllFromBilling}>Add all to clients</button>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {unbooked.map(b => (
                  <div key={b.email} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(232,165,22,.07)', borderRadius: 10 }}>
                    <div style={{ minWidth: 160, flex: '1 1 0' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--os-text)' }}>{b.name || b.email}</div>
                      <div style={{ fontSize: 12, color: 'var(--os-text-muted)', overflowWrap: 'anywhere' }}>
                        {b.company ? `${b.company} · ` : ''}<EmailText email={b.email} />
                      </div>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--os-warn)', fontWeight: 700, whiteSpace: 'nowrap' }}>{b.source}</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--os-good)', whiteSpace: 'nowrap', minWidth: 90 }}>
                      {b.monthlyAmount ? `${b.currency === 'USD' ? '$' : b.currency + ' '}${b.monthlyAmount.toLocaleString()}/mo` : 'One-off'}
                    </div>
                    <button className="os-btn" onClick={() => addFromBilling(b)}>Add</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {active.length > 0 && (
          <div className="os-stats" style={{ marginBottom: 18 }}>
            <div className="os-stat-card">
              <div className="os-stat-label">Monthly recurring</div>
              <div className="os-stat-value">{eur(mrrEur)}</div>
              <div className="os-stat-sub">{paying.length} paying client{paying.length === 1 ? '' : 's'}, all currencies</div>
              <div className="os-stat-icon" style={{ background: 'rgba(31,138,91,.14)' }}>💰</div>
            </div>
            <div className="os-stat-card">
              <div className="os-stat-label">Per year</div>
              <div className="os-stat-value">{eur(mrrEur * 12)}</div>
              <div className="os-stat-sub">At today&apos;s run rate</div>
              <div className="os-stat-icon" style={{ background: 'rgba(124,77,214,.14)' }}>📈</div>
            </div>
            <div className="os-stat-card">
              <div className="os-stat-label">Average client</div>
              <div className="os-stat-value">{eur(avgEur)}</div>
              <div className="os-stat-sub">Per month</div>
              <div className="os-stat-icon" style={{ background: 'rgba(232,165,22,.16)' }}>⚖️</div>
            </div>
            <div className="os-stat-card">
              <div className="os-stat-label">Active clients</div>
              <div className="os-stat-value">{active.length}</div>
              <div className="os-stat-sub">{active.length - paying.length} not on a retainer</div>
              <div className="os-stat-icon" style={{ background: 'rgba(124,77,214,.14)' }}>🤝</div>
            </div>
          </div>
          )}

          <div className="os-card" style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              {byCurrency.map(x => (
                <div key={x.cur}>
                  <div style={{ fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--os-warn)', fontWeight: 700 }}>{x.cur}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--os-text)' }}>
                    {x.cur === 'USD' ? '$' : x.cur === 'EUR' ? '\u20ac' : 'Afl. '}{x.raw.toLocaleString()}
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--os-text-muted)' }}> /mo</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--os-text-muted)' }}>{x.count} client{x.count === 1 ? '' : 's'} = {eur(toEur(x.raw, x.cur, usdPerEur))}</div>
                </div>
              ))}
              {byCurrency.length === 0 && <div style={{ fontSize: 13, color: 'var(--os-text-muted)' }}>No paying clients on the book yet.</div>}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--os-text-muted)' }}>
              {editRate ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  1 EUR =
                  <input
                    className="os-input" type="number" step="0.001" min="0.1" autoFocus
                    defaultValue={usdPerEur} style={{ width: 90 }}
                    onBlur={e => {
                      const n = parseFloat(e.target.value)
                      if (Number.isFinite(n) && n > 0) { saveRate(n); setUsdPerEur(n) }
                      setEditRate(false)
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  />
                  USD
                </span>
              ) : (
                <button
                  onClick={() => setEditRate(true)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--os-accent)', fontSize: 12.5, textDecoration: 'underline', fontFamily: 'inherit' }}
                >
                  Converted at 1 EUR = {usdPerEur} USD, Afl. pegged at {AWG_PER_USD}. Edit rate
                </button>
              )}
            </div>
          </div>

          {active.length === 0 ? (
            <div className="os-card" style={{ padding: 'clamp(38px,6vw,62px) clamp(22px,5vw,44px)', textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
              <div style={{ fontSize: 38, marginBottom: 14, lineHeight: 1 }}>🤝</div>
              <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 'clamp(20px,3vw,26px)', letterSpacing: '-.02em', color: 'var(--os-text)', marginBottom: 9 }}>
                Put your existing clients on the book
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--os-text-muted)', marginBottom: 22, maxWidth: 430, marginLeft: 'auto', marginRight: 'auto' }}>
                Everyone you already work with belongs here, whether or not they ever signed a proposal.
                Add a name and what they pay, then invoice them straight from their card.
              </div>
              <button className="os-btn os-btn-primary" onClick={() => { setEditClient(undefined); setShowCreate(true) }}>
                + Add your first client
              </button>
            </div>
          ) : (
            <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {([
                { k: 'all' as const, label: 'Everyone', n: active.length },
                { k: 'group' as const, label: 'Group program', n: groupCount },
                { k: 'retainer' as const, label: 'Retainer', n: retainerCount },
              ]).map(c => {
                const on = planFilter === c.k
                return (
                  <button key={c.k} type="button" onClick={() => setPlanFilter(c.k)}
                    title={c.k === 'group' ? 'The group programme' : c.k === 'retainer' ? 'One to one, billed monthly' : 'Every active client'}
                    style={{
                      padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${on ? 'var(--os-accent)' : 'var(--os-line)'}`,
                      background: on ? 'var(--os-accent)' : 'transparent',
                      color: on ? '#fff' : 'var(--os-text-muted)',
                    }}>
                    {c.label} <span style={{ opacity: on ? .85 : .6, fontWeight: 800 }}>{c.n}</span>
                  </button>
                )
              })}
            </div>
            <div className="os-card os-people-cards" style={{ padding: 0, overflow: 'hidden' }}>
              {narrow ? (

                <div>
                  {[...shown]
                    .sort((a, b) => (b.monthlyAmount ?? 0) - (a.monthlyAmount ?? 0) || a.name.localeCompare(b.name))
                    .map(c => {
                      const stage = normalizeDeliveryStage(c.deliveryStage)
                      const meta = STAGE_META[stage]
                      const site = c.website ? c.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : ''
                      const kind = planSplit(c)
                      return (
                        <div key={c.id} role="button" tabIndex={0} className="os-pcard"
                          onClick={() => openContact(c)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openContact(c) } }}>
                          <div className="os-pcard-top">
                            {c.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="os-pcard-av" src={c.photoUrl} alt="" width={38} height={38} style={{ objectFit: 'cover', objectPosition: 'center top' }} />
                            ) : (
                              <div className="os-pcard-av" style={{ background: avatarBgOf(c.id) }}>{initialsOf(c.name)}</div>
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="os-pcard-name">{c.name}</div>
                              {c.company && <div className="os-pcard-sub">{c.company}</div>}
                            </div>
                            <div className="os-pcard-money">
                              {(c.monthlyAmount ?? 0) > 0 ? (
                                <>
                                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--os-good)', letterSpacing: '-.01em' }}>
                                    {c.currency === 'EUR' ? '\u20ac' : c.currency === 'AWG' ? 'Afl. ' : '$'}{(c.monthlyAmount ?? 0).toLocaleString()}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--os-text-faint)', fontWeight: 600 }}>per month</div>
                                </>
                              ) : (
                                <div style={{ fontSize: 12, color: 'var(--os-text-faint)', fontStyle: 'italic' }}>No retainer</div>
                              )}
                            </div>
                          </div>
                          <div className="os-pcard-states">
                            <span className="os-state" data-tone="muted">Stage · {stage}</span>
                            {kind.group && <span className="os-state" data-tone="accent">Group</span>}
                            {kind.retainer && <span className="os-state" data-tone="good">Retainer</span>}
                          </div>
                          <div className="os-pcard-meta" onClick={e => e.stopPropagation()}>
                            {c.email && <EmailText email={c.email} style={{ maxWidth: '100%' }} />}
                            {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                            {site && <a href={/^https?:\/\//i.test(c.website!) ? c.website! : `https://${c.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--os-accent)' }}>{site}</a>}
                            <span style={{ color: 'var(--os-text-faint)' }}>{monthsWith(c.startedAt)}</span>
                            <span
                              role="button" tabIndex={0}
                              onClick={() => { setEditClient(c); setShowCreate(true) }}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditClient(c); setShowCreate(true) } }}
                              style={{ marginLeft: 'auto', color: 'var(--os-accent)', fontWeight: 700, cursor: 'pointer' }}
                            >Edit</span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
              <div className="os-client-table-wrap">
                <table className="os-table os-client-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Retainer</th>
                      <th>Plan</th>
                      <th>Stage</th>
                      <th>With you</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shown]
                      .sort((a, b) => (b.monthlyAmount ?? 0) - (a.monthlyAmount ?? 0) || a.name.localeCompare(b.name))
                      .map(c => {
                        const stage = normalizeDeliveryStage(c.deliveryStage)
                        const meta = STAGE_META[stage]
                        const site = c.website ? c.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : ''
                        const siteHref = c.website ? (/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`) : ''
                        return (
                          <tr key={c.id} onClick={() => openContact(c)} style={{ cursor: 'pointer' }}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9, width: 178 }}>
                                {c.photoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={c.photoUrl} alt="" width={32} height={32}
                                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center top', flexShrink: 0, background: 'var(--os-line)' }} />
                                ) : (
                                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarBg(c.id), display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 11.5, flexShrink: 0 }}>
                                    {initials(c.name)}
                                  </div>
                                )}
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.name}>{c.name}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                    {c.company && (
                                      <span style={{ fontSize: 11.5, color: 'var(--os-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.company}>{c.company}</span>
                                    )}
                                    {site && (
                                      <a href={siteHref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                        title={site} aria-label={`Open ${site}`}
                                        style={{ color: 'var(--os-accent)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12 }}>
                                        <i className="ti ti-external-link" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ fontSize: 12.5, color: 'var(--os-text-muted)' }}>
                              {c.email ? <EmailText email={c.email} style={{ maxWidth: 205 }} /> : <span style={{ color: 'var(--os-text-faint)' }}>—</span>}
                            </td>
                            <td style={{ fontSize: 12.5, color: 'var(--os-text-muted)', whiteSpace: 'nowrap' }}>
                              {c.phone ? <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{c.phone}</a> : <span style={{ color: 'var(--os-text-faint)' }}>—</span>}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {(c.monthlyAmount ?? 0) > 0 ? (
                                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--os-good)' }}>
                                  {c.currency === 'EUR' ? '\u20ac' : c.currency === 'AWG' ? 'Afl. ' : '$'}{(c.monthlyAmount ?? 0).toLocaleString()}
                                  <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--os-text-faint)' }}> /mo</span>
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--os-text-faint)', fontStyle: 'italic' }}>None</span>
                              )}
                            </td>
                            <td>
                              {c.planName
                                ? <span title={c.planName} style={{ display: 'block', maxWidth: 118, fontSize: 11, fontWeight: 700, background: 'rgba(124,77,214,.12)', color: 'var(--os-accent)', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.planName}</span>
                                : <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>—</span>}
                            </td>
                            <td>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>{stage}</span>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--os-text-faint)', whiteSpace: 'nowrap' }}>{monthsWith(c.startedAt).replace(' with you', '')}</td>
                            <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => { setEditClient(c); setShowCreate(true) }}
                                title="Edit retainer, plan and stage"
                                className="os-icon-btn"
                              >
                                <i className="ti ti-pencil" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            </>
          )}
        </>
      )}

      {tab === 'stages' && (
        <>
          {active.length === 0 ? (
            <div className="os-card" style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤝</div>
              <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--os-text)', marginBottom: 6 }}>No active clients yet</div>
              <div style={{ fontSize: 14, color: 'var(--os-text-faint)', marginBottom: 20 }}>
                Close a deal in the Leads pipeline and the client lands here in Onboarding.
              </div>
              <button className="os-btn os-btn-primary" onClick={() => { setEditClient(undefined); setShowCreate(true) }}>
                + Add manually
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
              {CLIENT_DELIVERY_STAGES.map(stage => {
                const meta = STAGE_META[stage]
                const cards = byStage[stage] ?? []
                return (
                  <div key={stage} style={{ flexShrink: 0, width: 240 }}>
                    <div style={{ marginBottom: 10, padding: '6px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 15 }}>{meta.emoji}</span>
                        <span style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--os-text)' }}>{stage}</span>
                        {cards.length > 0 && (
                          <span style={{ marginLeft: 'auto', background: meta.bg, color: meta.color, borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{cards.length}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--os-text-faint)', marginTop: 4, minHeight: 32 }}>
                        {CLIENT_DELIVERY_HINTS[stage]}
                      </div>
                    </div>

                    {cards.map((c, idx) => (
                      <ClientKanbanCard
                        key={c.id}
                        client={c}
                        idx={idx}
                        onOpen={() => openContact(c)}
                        onEdit={() => { setEditClient(c); setShowCreate(true) }}
                        onDelete={() => remove(c.id)}
                        onMoveStage={(sNext) => moveStage(c.id, sNext)}
                      />
                    ))}

                    {cards.length === 0 && (
                      <div style={{ border: '1.5px dashed var(--os-line)', borderRadius: 12, minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--os-text-faint)', fontSize: 12 }}>
                        Empty
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'archive' && (
        <div className="os-card">
          <div className="os-card-header">
            <span className="os-card-title">Archived Clients</span>
            <span style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>Completed engagements, available for upsell</span>
          </div>
          {archived.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--os-text-faint)' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🗂️</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>No archived clients yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>When a client completes their engagement, they will appear here.</div>
            </div>
          ) : (
            <div>
              {archived.map(c => (
                <ArchiveRow key={c.id} client={c} onReactivate={() => reactivate(c.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <ClientModal
          client={editClient}
          deals={deals}
          onClose={() => { setShowCreate(false); setEditClient(undefined) }}
          onSaved={() => { reload() }}
        />
      )}
    </>
  )
}
