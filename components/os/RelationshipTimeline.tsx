'use client'

import { useState } from 'react'
import Link from 'next/link'
import { STATUS_LABEL, STATUS_HINT, type HistoryEvent, type PersonRecord } from '@/lib/client-history'

export const KIND_META: Record<HistoryEvent['kind'], { icon: string; color: string }> = {
  lead:     { icon: 'ti-user-plus',    color: 'var(--os-accent)' },
  stage:    { icon: 'ti-arrow-right',  color: 'var(--os-accent)' },
  activity: { icon: 'ti-message-dots', color: 'var(--os-good)' },
  proposal: { icon: 'ti-file-text',    color: 'var(--os-warn)' },
  signed:   { icon: 'ti-writing-sign', color: 'var(--os-good)' },
  invoice:  { icon: 'ti-receipt',      color: 'var(--os-bad)' },
  paid:     { icon: 'ti-cash',         color: 'var(--os-good)' },
  won:      { icon: 'ti-trophy',       color: 'var(--os-good)' },
  lost:     { icon: 'ti-x',            color: 'var(--os-text-faint)' },
  event:    { icon: 'ti-ticket',       color: 'var(--os-accent)' },
  checkin:  { icon: 'ti-circle-check', color: 'var(--os-good)' },
}

export function money(n?: number, cur?: string) {
  if (n === undefined) return null
  const sym = cur === 'EUR' ? '€' : cur === 'AWG' ? 'Afl. ' : '$'
  return sym + n.toLocaleString()
}

export default function RelationshipTimeline({
  person, limit = 12, onAddToPipeline, compact = false,
}: {
  person: PersonRecord
  limit?: number

  onAddToPipeline?: (note: string) => void

  compact?: boolean
}) {
  const [all, setAll] = useState(false)
  const [addingNote, setAddingNote] = useState<string | null>(null)
  const shown = all ? person.events : person.events.slice(0, limit)
  const fs = compact ? { title: 12.5, detail: 11.5, ts: 10.5, dot: 22, icon: 11 } : { title: 13.5, detail: 12.5, ts: 11.5, dot: 26, icon: 13 }

  return (
    <div className="os-crm-section">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="os-crm-section-title" style={{ marginBottom: 0 }}>Relationship history</div>
        <span className="os-tag-chip active" title={STATUS_HINT[person.status]}>{STATUS_LABEL[person.status]}</span>
      </div>

      {person.totalBilled > 0 && (
        <div style={{ display: 'flex', gap: 16, padding: '8px 10px', background: 'var(--os-good-soft)', borderRadius: 10, margin: '10px 0' }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--os-text-faint)', fontWeight: 700 }}>Billed</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--os-text)' }}>{money(person.totalBilled)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--os-text-faint)', fontWeight: 700 }}>Paid</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--os-good)' }}>{money(person.totalPaid)}</div>
          </div>
          {person.totalBilled > person.totalPaid && (
            <div>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--os-text-faint)', fontWeight: 700 }}>Outstanding</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--os-bad)' }}>{money(person.totalBilled - person.totalPaid)}</div>
            </div>
          )}
        </div>
      )}

      {onAddToPipeline && (
        person.openDeal ? (
          <Link href={`/os/deals/${person.openDeal.id}`} className="os-btn os-btn-ghost os-btn-sm" style={{ margin: '8px 0', display: 'inline-flex' }}>
            <i className="ti ti-arrow-up-right" /> Already in the pipeline · {person.openDeal.stage}
          </Link>
        ) : addingNote === null ? (
          <button className="os-btn os-btn-primary os-btn-sm" style={{ margin: '8px 0' }} onClick={() => setAddingNote('')}>
            <i className="ti ti-plus" /> Add to lead pipeline
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
            <input className="os-crm-input" placeholder="What's this about? (optional)" value={addingNote}
              onChange={e => setAddingNote(e.target.value)} style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') { onAddToPipeline(addingNote); setAddingNote(null) } }} />
            <button className="os-btn os-btn-primary os-btn-sm" onClick={() => { onAddToPipeline(addingNote); setAddingNote(null) }}>Add</button>
            <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => setAddingNote(null)}>✕</button>
          </div>
        )
      )}

      {person.events.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', padding: '6px 0' }}>
          Nothing recorded yet. Deals, offers, invoices, events and logged calls for this email will appear here automatically.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          {shown.map((e, i) => {
            const m = KIND_META[e.kind]
            const amt = money(e.amount, e.currency)
            const row = (
              <div style={{ display: 'flex', gap: 10, padding: '7px 2px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ width: fs.dot, height: fs.dot, borderRadius: 7, background: m.color + '1f', color: m.color, display: 'grid', placeItems: 'center', fontSize: fs.icon }}>
                    <i className={`ti ${m.icon}`} />
                  </span>
                  {i < shown.length - 1 && <span style={{ flex: 1, width: 1, background: 'var(--os-line)', marginTop: 4, minHeight: 8 }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, fontSize: fs.title, color: 'var(--os-text)' }}>{e.title}</span>
                    {amt && <span style={{ fontWeight: 700, fontSize: fs.detail, color: m.color }}>{amt}</span>}
                  </div>
                  {e.detail && <div style={{ fontSize: fs.detail, color: 'var(--os-text-muted)', marginTop: 1, overflowWrap: 'anywhere' }}>{e.detail}</div>}
                  <div style={{ fontSize: fs.ts, color: 'var(--os-text-faint)', marginTop: 1 }}>
                    {new Date(e.at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              </div>
            )
            return e.href
              ? <Link key={e.id} href={e.href} style={{ textDecoration: 'none', color: 'inherit' }}>{row}</Link>
              : <div key={e.id}>{row}</div>
          })}
        </div>
      )}

      {person.events.length > limit && (
        <button className="os-btn os-btn-ghost os-btn-sm" style={{ marginTop: 8 }} onClick={() => setAll(v => !v)}>
          {all ? 'Show less' : `Show all ${person.events.length}`}
        </button>
      )}
    </div>
  )
}
