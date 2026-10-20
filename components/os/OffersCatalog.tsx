'use client'

import { useState, useEffect } from 'react'
import { getOffers, saveOffer, updateOffer, deleteOffer, seedDefaultOffers, getProposals } from '@/lib/crm-store'
import type { Offer, OfferCategory } from '@/lib/crm-types'
import OfferForm from './OfferForm'
import { confirmAction } from '@/app/os/ConfirmHost'

type CategoryFilter = 'all' | OfferCategory

const ACCENT: Record<OfferCategory, string> = {
  programs: 'var(--os-warn)',
  coaching: '#0891b2',
  communication: 'var(--os-bad)',
  Partner: '#1c1133',
}

const ICON: Record<OfferCategory, string> = {
  programs: '🎓',
  coaching: '🧠',
  communication: '🎤',
  Partner: '🤖',
}

const CAT_LABEL: Record<OfferCategory, string> = {
  programs: 'Online Programs',
  coaching: 'Coaching',
  communication: 'Communication Coaching',
  Partner: 'Partner Partnerships',
}

function fmt(n: number, cur = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 0 }).format(n)
}

function billingLabel(b: string) {
  if (b === 'one-time') return 'one-time'
  if (b === 'monthly') return '/mo'
  if (b === 'retainer') return ' retainer'
  return ''
}

export default function OffersPage({ embedded }: { embedded?: boolean } = {}) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [filter, setFilter] = useState<CategoryFilter>('programs')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Offer | null>(null)
  const [proposalCounts, setProposalCounts] = useState<Record<string, number>>({})

  function reload() {
    seedDefaultOffers()
    const all = getOffers()
    setOffers(all)
    const proposals = getProposals()
    const counts: Record<string, number> = {}
    for (const o of all) {
      counts[o.id] = proposals.filter(p => p.offerId === o.id).length
    }
    setProposalCounts(counts)
  }

  useEffect(() => { reload() }, [])

  function handleSave(data: Omit<Offer, 'id' | 'createdAt'>) {
    if (editing) {
      updateOffer(editing.id, data)
    } else {
      saveOffer(data)
    }
    setFormOpen(false)
    setEditing(null)
    reload()
  }

  function handleEdit(o: Offer) {
    setEditing(o)
    setFormOpen(true)
  }

  function handleNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function handleToggleActive(o: Offer) {
    updateOffer(o.id, { active: !o.active })
    reload()
  }

  async function handleDelete(id: string) {
    if (!(await confirmAction({ message: 'Delete this offer?', detail: 'This cannot be undone.' }))) return
    deleteOffer(id)
    reload()
  }

  const filtered = filter === 'all' ? offers : offers.filter(o => o.category === filter)

  const tabs: { key: CategoryFilter; label: string }[] = [
    { key: 'programs', label: 'Online Programs' },
    { key: 'coaching', label: 'Coaching' },
    { key: 'Partner', label: 'Partner Partnerships' },
    { key: 'all', label: 'All' },
  ]

  return (
    <>
      {embedded ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#847a9e' }}>{offers.length} service{offers.length !== 1 ? 's' : ''} you can drop into a proposal.</div>
          <button className="os-btn os-btn-primary" onClick={handleNew}><i className="ti ti-plus" /> New Offer</button>
        </div>
      ) : (
        <div className="os-page-header">
          <div>
            <div className="os-page-title">Offers</div>
            <div className="os-page-sub">{offers.length} offer{offers.length !== 1 ? 's' : ''} in your catalog</div>
          </div>
          <button className="os-btn os-btn-primary" onClick={handleNew}>
            <i className="ti ti-plus" /> New Offer
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            style={{
              padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13,
              background: filter === t.key ? 'var(--os-accent-soft)' : 'transparent',
              color: filter === t.key ? 'var(--os-accent)' : 'var(--os-text-muted)',
              boxShadow: 'none',
              transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="os-empty">
          <div style={{ fontSize: 32, marginBottom: 10 }}>📦</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No offers yet</div>
          <div style={{ color: 'var(--os-text-faint)', fontSize: 14 }}>Create your first offer to use in proposals.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(o => {
          const accent = ACCENT[o.category]
          const icon = ICON[o.category]
          const count = proposalCounts[o.id] ?? 0
          const total = o.paymentSchedule.reduce((s, m) => s + m.amount, 0)

          return (
            <div
              key={o.id}
              className="os-card"
              style={{
                display: 'flex', alignItems: 'stretch', padding: 0, overflow: 'hidden',
                opacity: o.active ? 1 : 0.6,
              }}
            >
              <div style={{ width: 5, background: accent, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 22, background: accent + '14', flexShrink: 0,
                }}>
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--os-text)' }}>{o.name}</div>
                    {!o.active && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-text-faint)', background: 'var(--os-line)', padding: '2px 8px', borderRadius: 20 }}>
                        Inactive
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--os-text-faint)', marginBottom: 4 }}>{o.tagline}</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: accent }}>
                      {fmt(o.price, o.currency)}{billingLabel(o.billingType)}
                    </span>
                    {total !== o.price && (
                      <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>
                        {fmt(total, o.currency)} total schedule
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>
                      {count} proposal{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="os-btn os-btn-ghost"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => handleEdit(o)}
                  >
                    <i className="ti ti-pencil" /> Edit
                  </button>
                  <button
                    type="button"
                    className="os-btn os-btn-ghost"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => handleToggleActive(o)}
                  >
                    {o.active ? <><i className="ti ti-eye-off" /> Deactivate</> : <><i className="ti ti-eye" /> Activate</>}
                  </button>
                  <button
                    type="button"
                    className="os-btn os-btn-ghost"
                    style={{ padding: '6px 10px', fontSize: 12, color: 'var(--os-bad)' }}
                    onClick={() => handleDelete(o.id)}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {formOpen && (
        <OfferForm
          offer={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      )}
    </>
  )
}
