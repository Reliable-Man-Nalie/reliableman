'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getOffers, updateOffer, seedDefaultOffers, getDeals } from '@/lib/crm-store'
import { PYRAMID_TIERS, type Offer, type PyramidTier } from '@/lib/crm-types'

const CAT_ICON: Record<string, string> = { programs: '🎓', coaching: '🧠', Partner: '🤖' }

function priceLabel(o: Offer): string {
  const n = new Intl.NumberFormat('en-US', { style: 'currency', currency: o.currency || 'USD', minimumFractionDigits: 0 }).format(o.price)
  return o.billingType === 'monthly' ? `${n}/mo` : o.billingType === 'retainer' ? `${n} retainer` : n
}

export function OfferLadderEditor() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({})

  function reload() { setOffers(getOffers()) }
  useEffect(() => { seedDefaultOffers(); reload() }, [])

  function place(offerId: string, tier: PyramidTier | undefined) {
    updateOffer(offerId, { pyramidTier: tier })
    reload()
  }

  const topDown = [...PYRAMID_TIERS].sort((a, b) => b.level - a.level)
  const byTier = (tier: PyramidTier) => offers.filter(o => o.pyramidTier === tier)
  const unplaced = offers.filter(o => !o.pyramidTier)
  const maxLevel = Math.max(...PYRAMID_TIERS.map(t => t.level))

  const deals = (() => { try { return getDeals() } catch { return [] } })()
  const counts: Record<string, number> = {}
  for (const t of PYRAMID_TIERS) {
    const names = byTier(t.key).map(o => o.name.toLowerCase()).filter(Boolean)
    counts[t.key] = names.length === 0 ? 0
      : deals.filter(d => (d.tags ?? []).some(tag => tag && names.some(n => tag.toLowerCase().includes(n.slice(0, 12))))).length
  }
  const totalPeople = Object.values(counts).reduce((s, n) => s + n, 0)
  let acc = 0
  const slices = topDown.filter(t => counts[t.key] > 0).map(t => {
    const start = (acc / totalPeople) * 360; acc += counts[t.key]; const end = (acc / totalPeople) * 360
    return `${t.color} ${start}deg ${end}deg`
  }).join(', ')

  const sel: React.CSSProperties = { border: '1.5px solid var(--os-line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: '#1c1133', background: 'var(--os-card)', outline: 'none', cursor: 'pointer' }

  return (
    <>
      <div className="ladder-overview" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'linear-gradient(180deg,var(--os-card-alt),var(--os-card))', border: '1px solid rgba(34,27,61,.08)', borderRadius: 16, padding: '20px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#bd7f06', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: 12 }}>$$$ ↑ Ascend</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            {topDown.map(t => {
              const w = Math.max(44, (100 - 44) * (1 - t.level / maxLevel) + 44)
              const placed = byTier(t.key)
              return (
                <button key={t.key} onClick={() => setOpen(o => ({ ...o, [t.key]: true }))}
                  style={{ width: `${w}%`, minWidth: 170, background: placed.length ? t.color : '#e5e7eb', color: placed.length ? '#fff' : 'var(--os-text-faint)', borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                  <span style={{ fontWeight: 800, fontSize: 10.5, flexShrink: 0, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>
                    {placed.length ? placed.map(o => o.name).join(' · ') : 'empty'}
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--os-good)', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginTop: 10 }}>Free · Entry ↓</div>
        </div>

        <div style={{ background: 'var(--os-card)', border: '1px solid rgba(34,27,61,.08)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1c1133', marginBottom: 14 }}>People by area</div>
          {totalPeople === 0 ? (
            <div style={{ color: 'var(--os-text-faint)', fontSize: 13, padding: '30px 0', textAlign: 'center' }}>No leads tagged to an offer yet. As deals come in and get tagged to your offers, they show up here by rung.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(${slices})`, flexShrink: 0, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 22, background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#1c1133', lineHeight: 1 }}>{totalPeople}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>people</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topDown.filter(t => counts[t.key] > 0).map(t => (
                  <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#4b5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                    <span style={{ fontWeight: 700, color: '#1c1133' }}>{counts[t.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {offers.length === 0 && (
        <div style={{ background: 'var(--os-card)', border: '1px dashed rgba(34,27,61,.15)', borderRadius: 14, padding: '28px 20px', textAlign: 'center', color: 'var(--os-text-faint)', fontSize: 13, marginBottom: 16 }}>
          No offers yet. Create them in the <strong>Service Catalog</strong> tab, then place them on the pyramid here.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {topDown.map(t => {
          const placed = byTier(t.key)
          const isOpen = open[t.key] ?? placed.length > 0
          const addable = offers.filter(o => o.pyramidTier !== t.key)
          return (
            <div key={t.key} className="os-card" style={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setOpen(o => ({ ...o, [t.key]: !isOpen }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 8, height: 28, borderRadius: 4, background: t.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: 13.5, color: '#1c1133', flex: 1 }}>{t.label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--os-text-faint)' }}>{placed.length} offer{placed.length === 1 ? '' : 's'}</span>
                <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`} style={{ color: '#c4b5d4', fontSize: 15 }} />
              </button>

              {isOpen && (
                <div style={{ padding: '4px 16px 16px', borderTop: '1px solid #f1eefb' }}>
                  {placed.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: '#b6adc9', padding: '8px 0' }}>No offers placed on this rung yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      {placed.map(o => (
                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--os-card-alt)', border: '1px solid var(--os-line)', borderRadius: 10, padding: '10px 12px' }}>
                          <span style={{ fontSize: 18 }}>{CAT_ICON[o.category] ?? '🏷️'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--os-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</div>
                            <div style={{ fontSize: 11.5, color: '#998fb3' }}>{o.tagline}</div>
                          </div>
                          <span style={{ fontWeight: 800, fontSize: 13.5, color: t.color, flexShrink: 0 }}>{priceLabel(o)}</span>
                          <button onClick={() => place(o.id, undefined)} title="Remove from pyramid" style={{ background: 'none', border: 'none', color: 'var(--os-bad)', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <select
                      value=""
                      onChange={e => { if (e.target.value) place(e.target.value, t.key) }}
                      style={sel}
                    >
                      <option value="">+ Add an offer from the catalog…</option>
                      {addable.map(o => (
                        <option key={o.id} value={o.id}>{o.name} ({priceLabel(o)}){o.pyramidTier ? ` — move from ${PYRAMID_TIERS.find(pt => pt.key === o.pyramidTier)?.label}` : ''}</option>
                      ))}
                    </select>
                    <Link href="/os/offers?tab=catalog" style={{ fontSize: 11.5, color: 'var(--os-accent)', fontWeight: 600, textDecoration: 'none' }}>Manage offers in Service Catalog →</Link>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {unplaced.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--os-text-faint)' }}>
          {unplaced.length} offer{unplaced.length === 1 ? '' : 's'} not yet placed on the pyramid: {unplaced.map(o => o.name).join(', ')}.
        </div>
      )}
      <style>{`@media (max-width: 900px){ .ladder-overview { grid-template-columns: 1fr !important; } }`}</style>
    </>
  )
}
