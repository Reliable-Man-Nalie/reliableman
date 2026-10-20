'use client'

import { useState } from 'react'
import { PAYMENT_METHODS, PAYMENT_TERMS, paymentDetailsText } from '@/lib/payment-details'
import { currencyOptions } from '@/lib/fx'
import { SearchSelect } from '@/components/os/SearchSelect'
import { usePeople } from '@/components/os/usePeople'
import { copyText } from '@/lib/clipboard'

interface MadeLink { url: string; description: string; amount: number; currency: string; recurring: boolean }

export default function PaymentsPage() {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [recurring, setRecurring] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [links, setLinks] = useState<MadeLink[]>([])
  const [copied, setCopied] = useState('')
  const [contactKey, setContactKey] = useState('')

  const people = usePeople()
  const contactItems = people.map(p => ({
    id: p.key,
    label: p.name || p.email,
    sub: [p.company, p.name ? p.email : ''].filter(Boolean).join(' · ') || undefined,
    badge: p.stage,
  }))
  function pickContact(key: string) {
    setContactKey(key)
    const p = people.find(x => x.key === key)
    if (!p) return
    setClientName(p.name)
    setClientEmail(p.email)
  }

  function copy(key: string, text: string) {
    setCopied(key)
    void copyText(text)
    window.setTimeout(() => setCopied(c => (c === key ? '' : c)), 2200)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/os/payment-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description, amount: Number(amount), currency, recurring, clientName, clientEmail,
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.ok) {
        setError(d?.error ? String(d.error) : `Stripe refused that (HTTP ${res.status}).`)
      } else {
        setLinks(prev => [{ url: d.url, description: d.description, amount: d.amount, currency: d.currency, recurring: d.recurring }, ...prev])
        setDescription(''); setAmount('')
      }
    } catch {
      setError('Could not reach the server. Nothing was created.')
    }
    setBusy(false)
  }

  const missingBank = PAYMENT_METHODS.some(m => m.id === 'bank' && !m.enabled)

  return (
    <div>
      <div className="os-page-header">
        <div>
          <h1 className="os-page-title">Get paid</h1>
          <p className="os-page-sub">
            Make a payment link for any amount, or copy your transfer details to send.
          </p>
        </div>
      </div>

      {error && (
        <div className="os-card" style={{ borderColor: 'var(--os-bad)', marginBottom: 18 }}>
          <strong style={{ color: 'var(--os-bad)' }}>{error}</strong>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 16, alignItems: 'start' }}>

        <form onSubmit={create} className="os-card">
          <div className="os-card-title" style={{ marginBottom: 4 }}>New payment link</div>
          <p style={{ fontSize: 13, color: 'var(--os-text-faint)', margin: '0 0 16px' }}>
            No expiry, so it still works when they open the mail next week.
          </p>

          <label className="os-label">What is it for</label>
          <input className="os-input" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Express Web Design" required />

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="os-label">Amount</label>
              <input className="os-input" value={amount} onChange={e => setAmount(e.target.value)}
                inputMode="decimal" placeholder="500" required />
            </div>
            <div style={{ width: 108 }}>
              <label className="os-label">Currency</label>
              <select className="os-select" value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: '100%' }}>
                {currencyOptions(currency).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <label className="os-label" style={{ display: 'block', marginTop: 12 }}>Pick from contacts</label>
          <SearchSelect value={contactKey} items={contactItems} onChange={pickContact}
            placeholder="Search a name or email…" />

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="os-label">Client name</label>
              <input className="os-input" value={clientName} onChange={e => { setClientName(e.target.value); setContactKey('') }} placeholder="Optional" />
            </div>
            <div style={{ flex: 1 }}>
              <label className="os-label">Client email</label>
              <input className="os-input" value={clientEmail} onChange={e => { setClientEmail(e.target.value); setContactKey('') }} placeholder="Optional" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
            Charge this every month
          </label>

          <button className="os-btn os-btn-primary" disabled={busy} style={{ marginTop: 16, width: '100%' }}>
            {busy ? 'Creating…' : 'Create the link'}
          </button>
        </form>

        <div className="os-card">
          <div className="os-card-title" style={{ marginBottom: 4 }}>Your payment details</div>
          <p style={{ fontSize: 13, color: 'var(--os-text-faint)', margin: '0 0 14px' }}>
            The same block that goes on every invoice.
          </p>

          {PAYMENT_METHODS.filter(m => m.enabled).map(m => (
            <div key={m.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--os-text)' }}>{m.label}</div>
              {m.bestFor && <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', marginBottom: 4 }}>{m.bestFor}</div>}
              <pre style={{
                margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.6,
                color: 'var(--os-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{m.lines.join('\n')}</pre>
            </div>
          ))}

          <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', lineHeight: 1.6, marginBottom: 14 }}>
            {PAYMENT_TERMS.map(t => <div key={t}>{t}</div>)}
          </div>

          <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => copy('details', paymentDetailsText())}>
            {copied === 'details' ? '✓ Copied' : 'Copy for an email'}
          </button>

          {missingBank && (
            <p style={{ fontSize: 12.5, color: 'var(--os-warn)', margin: '14px 0 0', lineHeight: 1.55 }}>
              <strong>Bank details are not set.</strong> Add NEXT_PUBLIC_BANK_ACCOUNT_NAME and
              NEXT_PUBLIC_BANK_IBAN in your hosting settings and redeploy. Until then invoices only offer card.
            </p>
          )}
        </div>
      </div>

      {links.length > 0 && (
        <div className="os-card" style={{ marginTop: 16 }}>
          <div className="os-card-title" style={{ marginBottom: 12 }}>Links made just now</div>
          {links.map(l => (
            <div key={l.url} style={{
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
              padding: '12px 0', borderTop: '1px solid var(--os-line)',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--os-text)' }}>
                  {l.description} · {l.currency} {l.amount}{l.recurring ? ' / month' : ''}
                </div>
                <a href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12.5, color: 'var(--os-accent)', wordBreak: 'break-all' }}>{l.url}</a>
              </div>
              <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => copy(l.url, l.url)}>
                {copied === l.url ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
          ))}
          <p style={{ fontSize: 12.5, color: 'var(--os-text-faint)', margin: '12px 0 0' }}>
            These live in Stripe from now on. This list is only what you made in this session.
          </p>
        </div>
      )}
    </div>
  )
}
