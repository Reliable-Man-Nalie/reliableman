'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { OfferLadderEditor } from '@/components/os/OfferLadderEditor'
import OffersCatalog from '@/components/os/OffersCatalog'

type Tab = 'ladder' | 'catalog'
const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: 'ladder', label: 'Ascension Ladder', sub: 'Place your Service Catalog offers on the pyramid' },
  { key: 'catalog', label: 'Service Catalog', sub: 'Define your offers, by business line' },
]

function OffersInner() {
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'catalog' ? 'catalog' : 'ladder')
  useEffect(() => { if (params.get('tab') === 'catalog') setTab('catalog') }, [params])

  return (
    <>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Offers</div>
          <div className="os-page-sub">{TABS.find(t => t.key === tab)?.sub}</div>
        </div>
      </div>

      <div className="os-chiprow" style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--os-line)', marginBottom: 22 }}>
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', fontSize: 14, fontWeight: active ? 800 : 600, color: active ? 'var(--os-accent)' : '#8a83a0', borderBottom: active ? '2px solid var(--os-accent)' : '2px solid transparent', marginBottom: -1 }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'ladder' && <OfferLadderEditor />}
      {tab === 'catalog' && <OffersCatalog embedded />}
    </>
  )
}

export default function OffersPage() {
  return (
    <Suspense fallback={null}>
      <OffersInner />
    </Suspense>
  )
}
