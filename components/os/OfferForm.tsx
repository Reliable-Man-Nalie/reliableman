'use client'

import { useState, useEffect } from 'react'
import type { Offer, OfferCategory, BillingType, Currency, PaymentMilestone } from '@/lib/crm-types'
import { currencyOptions } from '@/lib/fx'

type Props = {
  offer: Offer | null
  onSave: (data: Omit<Offer, 'id' | 'createdAt'>) => void
  onClose: () => void
}

export default function OfferForm({ offer, onSave, onClose }: Props) {
  const [category, setCategory] = useState<OfferCategory>('programs')
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [price, setPrice] = useState(0)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [billingType, setBillingType] = useState<BillingType>('one-time')
  const [servicesText, setServicesText] = useState('')
  const [deliverablesText, setDeliverablesText] = useState('')
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([{ label: '', amount: 0 }])
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (offer) {
      setCategory(offer.category)
      setName(offer.name)
      setTagline(offer.tagline)
      setPrice(offer.price)
      setCurrency(offer.currency)
      setBillingType(offer.billingType)
      setServicesText(offer.services.join('\n'))
      setDeliverablesText(offer.deliverables.join('\n'))
      setMilestones(offer.paymentSchedule.length ? offer.paymentSchedule : [{ label: '', amount: 0 }])
      setNotes(offer.notes ?? '')
      setActive(offer.active)
    }
  }, [offer])

  function addMilestone() {
    setMilestones(prev => [...prev, { label: '', amount: 0 }])
  }

  function updateMilestone(i: number, patch: Partial<PaymentMilestone>) {
    setMilestones(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
  }

  function removeMilestone(i: number) {
    setMilestones(prev => prev.filter((_, idx) => idx !== i))
  }

  function handleSubmit() {
    onSave({
      category,
      name,
      tagline,
      price,
      currency,
      billingType,
      services: servicesText.split('\n').map(s => s.trim()).filter(Boolean),
      deliverables: deliverablesText.split('\n').map(s => s.trim()).filter(Boolean),
      paymentSchedule: milestones.map(m => ({ ...m, amount: Number(m.amount) })),
      notes: notes || undefined,
      active,
    })
  }

  const billingLabel: Record<BillingType, string> = {
    'one-time': 'One-time',
    'monthly': 'Monthly',
    'retainer': 'Retainer',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end',
    }}>
      <div
        style={{ flex: 1, background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />
      <div style={{
        width: 520, maxWidth: '100vw', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', boxShadow: '-4px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ padding: '24px 28px 0', borderBottom: '1px solid var(--os-line)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--os-text)' }}>
              {offer ? 'Edit Offer' : 'New Offer'}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--os-text-faint)', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          <div className="os-form-group">
            <label className="os-label">Category</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['programs', 'coaching', 'Partner'] as OfferCategory[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12.5,
                    border: category === c ? '2px solid var(--os-accent)' : '2px solid var(--os-line)',
                    background: category === c ? 'var(--os-accent-soft)' : 'transparent',
                    color: category === c ? 'var(--os-accent)' : 'var(--os-text-muted)',
                  }}
                >
                  {c === 'programs' ? '🎓 Online Programs' : c === 'coaching' ? '🧠 Coaching' : '🤖 Partner'}
                </button>
              ))}
            </div>
          </div>

          <div className="os-form-group">
            <label className="os-label">Name</label>
            <input className="os-input" value={name} onChange={e => setName(e.target.value)} placeholder="Offer name" />
          </div>

          <div className="os-form-group">
            <label className="os-label">Tagline</label>
            <input className="os-input" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Short description" />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="os-form-group" style={{ flex: 1 }}>
              <label className="os-label">Price</label>
              <input className="os-input" type="number" value={price || ''} onChange={e => setPrice(Number(e.target.value))} placeholder="0" />
            </div>
            <div className="os-form-group" style={{ width: 100 }}>
              <label className="os-label">Currency</label>
              <select className="os-select" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
                {currencyOptions(currency).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="os-form-group">
            <label className="os-label">Billing Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['one-time', 'monthly', 'retainer'] as BillingType[]).map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBillingType(b)}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                    border: billingType === b ? '2px solid var(--os-accent)' : '2px solid var(--os-line)',
                    background: billingType === b ? 'var(--os-accent-soft)' : 'transparent',
                    color: billingType === b ? 'var(--os-accent)' : 'var(--os-text-muted)',
                  }}
                >
                  {billingLabel[b]}
                </button>
              ))}
            </div>
          </div>

          <div className="os-form-group">
            <label className="os-label">Services <span style={{ fontWeight: 400, color: 'var(--os-text-faint)' }}>(one per line)</span></label>
            <textarea
              className="os-textarea"
              value={servicesText}
              onChange={e => setServicesText(e.target.value)}
              placeholder="Meta & Google advertising setup&#10;AI chatbot built and integrated&#10;..."
              style={{ minHeight: 100 }}
            />
          </div>

          <div className="os-form-group">
            <label className="os-label">Deliverables <span style={{ fontWeight: 400, color: 'var(--os-text-faint)' }}>(one per line)</span></label>
            <textarea
              className="os-textarea"
              value={deliverablesText}
              onChange={e => setDeliverablesText(e.target.value)}
              placeholder="Live ad campaigns on Meta and Google&#10;Custom AI chatbot deployed&#10;..."
              style={{ minHeight: 80 }}
            />
          </div>

          <div className="os-form-group">
            <label className="os-label">Payment Schedule</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {milestones.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--os-card-alt)', border: '1px solid var(--os-line)', borderRadius: 8, padding: '10px 12px' }}>
                  <input
                    className="os-input"
                    value={m.label}
                    onChange={e => updateMilestone(i, { label: e.target.value })}
                    placeholder="Label"
                    style={{ flex: 2 }}
                  />
                  <input
                    className="os-input"
                    type="number"
                    value={m.amount || ''}
                    onChange={e => updateMilestone(i, { amount: Number(e.target.value) })}
                    placeholder="$"
                    style={{ flex: '0 0 90px' }}
                  />
                  <input
                    className="os-input"
                    value={m.note ?? ''}
                    onChange={e => updateMilestone(i, { note: e.target.value || undefined })}
                    placeholder="Note (optional)"
                    style={{ flex: 2 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeMilestone(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 16 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="os-add-btn" style={{ marginTop: 8 }} onClick={addMilestone}>
              <i className="ti ti-plus" /> Add Milestone
            </button>
          </div>

          <div className="os-form-group">
            <label className="os-label">Notes <span style={{ fontWeight: 400, color: 'var(--os-text-faint)' }}>(optional)</span></label>
            <textarea
              className="os-textarea"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes about this offer..."
              style={{ minHeight: 60 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setActive(prev => !prev)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                background: active ? 'var(--os-accent)' : 'var(--os-line)', position: 'relative', transition: 'background .2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: active ? 20 : 2, width: 18, height: 18,
                background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: '50%', transition: 'left .2s', display: 'block',
              }} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--os-accent)' : 'var(--os-text-faint)' }}>
              {active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div style={{ padding: '16px 28px 28px', borderTop: '1px solid var(--os-line)', display: 'flex', gap: 10 }}>
          <button type="button" className="os-btn os-btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button
            type="button"
            className="os-btn os-btn-primary"
            onClick={handleSubmit}
            disabled={!name}
            style={{ flex: 2 }}
          >
            <i className="ti ti-device-floppy" /> Save Offer
          </button>
        </div>
      </div>
    </div>
  )
}
