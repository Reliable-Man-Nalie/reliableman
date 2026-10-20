'use client'

import { useState } from 'react'
import type { Deal, DealStage } from '@/lib/crm-types'
import { getStages, ContactTimer, LeadAge, isOpenStage, type Stage } from './crm-shared'

function money(v: number, deal: Deal): string {
  return deal.revenueType === 'mrr' ? `$${v.toLocaleString()}/mo` : `$${v.toLocaleString()}`
}

function lastActivityTs(deal: Deal): number {
  const a = deal.activity?.[0]
  return a ? new Date(a.ts).getTime() : new Date(deal.updatedAt).getTime()
}

type SortKey = 'name' | 'stage' | 'value' | 'priority' | 'activity' | 'age'

type TableHandlers = {
  onOpen: (id: string) => void
  onStage: (deal: Deal, stage: DealStage) => void
  onContact: (deal: Deal) => void
  onArchive: (deal: Deal) => void
  onDelete: (deal: Deal) => void
  stages: Stage[]
}

export function TableView({ deals, onOpen, onStage, onContact, onArchive, onDelete, stages }: { deals: Deal[] } & TableHandlers) {

  const [sort, setSort] = useState<SortKey>('activity')
  const [dir, setDir] = useState<1 | -1>(1)
  const [menuId, setMenuId] = useState<string | null>(null)
  const STAGES = stages.length ? stages : getStages()
  const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]))

  const prioRank = { high: 3, medium: 2, low: 1, '': 0 } as Record<string, number>
  const sorted = [...deals].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0
    if (sort === 'name') { av = a.clientName.toLowerCase(); bv = b.clientName.toLowerCase() }
    else if (sort === 'stage') { av = STAGES.findIndex(s => s.key === a.stage); bv = STAGES.findIndex(s => s.key === b.stage) }
    else if (sort === 'value') { av = a.value; bv = b.value }
    else if (sort === 'priority') { av = prioRank[a.priority ?? '']; bv = prioRank[b.priority ?? ''] }
    else if (sort === 'activity') { av = lastActivityTs(a); bv = lastActivityTs(b) }
    else if (sort === 'age') { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime() }
    return av < bv ? -dir : av > bv ? dir : 0
  })

  const head = (key: SortKey, label: string, align?: string) => (
    <th style={{ textAlign: align as 'left' | 'right' | undefined, cursor: 'pointer' }} onClick={() => { if (sort === key) setDir(d => (d === 1 ? -1 : 1)); else { setSort(key); setDir(key === 'activity' || key === 'age' ? 1 : -1) } }}>
      {label}{sort === key && <span style={{ color: 'var(--accent)' }}> {dir === 1 ? '↑' : '↓'}</span>}
    </th>
  )

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="os-card" style={{ padding: 0, overflow: 'visible' }}>
      <table className="os-table">
        <thead><tr>
          {head('name', 'Contact')}
          {head('stage', 'Stage')}
          {head('value', 'Value', 'right')}
          {head('priority', 'Priority')}
          <th>Next step</th>
          {head('age', 'Lead age', 'right')}
          {head('activity', 'Last action', 'right')}
          <th style={{ width: 44 }} />
        </tr></thead>
        <tbody>
          {sorted.map(d => {
            const st = STAGE_MAP[d.stage]
            return (
              <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(d.id)}>
                <td>
                  <div style={{ fontWeight: 700, color: 'var(--os-text)' }}>{d.clientName}</div>
                  {d.clientCompany && <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>{d.clientCompany}</div>}
                </td>
                <td onClick={stop}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: st?.color ?? '#ccc', flexShrink: 0 }} />
                    <select
                      value={STAGE_MAP[d.stage] ? d.stage : ''}
                      onChange={e => onStage(d, e.target.value as DealStage)}
                      style={{ border: '1px solid var(--os-line)', borderRadius: 8, padding: '4px 6px', fontSize: 12.5, fontWeight: 600, color: 'var(--os-text)', background: 'var(--os-card)', cursor: 'pointer', maxWidth: 150 }}
                    >
                      {!STAGE_MAP[d.stage] && <option value="">{d.stage}</option>}
                      {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{d.value > 0 ? money(d.value, d) : '—'}</td>
                <td>{d.priority ? <span className={`os-prio-badge prio-${d.priority}`}>{d.priority}</span> : <span style={{ color: 'var(--os-text-faint)' }}>—</span>}</td>
                <td style={{ fontSize: 12.5, color: d.nextStep ? 'var(--os-warn)' : 'var(--os-text-faint)' }}>{d.nextStep || '—'}</td>
                <td style={{ textAlign: 'right' }}><LeadAge deal={d} /></td>
                <td style={{ textAlign: 'right' }}>
                  {isOpenStage(d.stage) ? <ContactTimer deal={d} /> : <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>—</span>}
                </td>
                <td onClick={stop} style={{ position: 'relative', textAlign: 'right' }}>
                  <button
                    onClick={() => setMenuId(menuId === d.id ? null : d.id)}
                    title="Actions"
                    style={{ background: 'none', border: '1px solid var(--os-line)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 14, lineHeight: 1 }}
                  >⋯</button>
                  {menuId === d.id && (
                    <div style={{ position: 'absolute', top: '100%', right: 8, marginTop: 4, background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', border: '1px solid var(--os-line)', borderRadius: 10, boxShadow: '0 8px 28px var(--os-line)', zIndex: 50, minWidth: 180, padding: 6, textAlign: 'left' }}>
                      <RowMenuItem icon="ti-circle-check" label="Mark contacted" onClick={() => { onContact(d); setMenuId(null) }} color="var(--os-good)" />
                      <RowMenuItem icon="ti-trophy" label="Mark Won" onClick={() => { onStage(d, 'completed'); setMenuId(null) }} color="var(--os-good)" />
                      <RowMenuItem icon="ti-archive" label="Archive (Lost)" onClick={() => { onArchive(d); setMenuId(null) }} color="var(--os-warn)" />
                      <div style={{ height: 1, background: 'var(--os-chip)', margin: '4px 0' }} />
                      <RowMenuItem icon="ti-trash" label="Delete" onClick={() => { onDelete(d); setMenuId(null) }} color="var(--os-bad)" />
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {menuId && <div onClick={() => setMenuId(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}
    </div>
  )
}

function RowMenuItem({ icon, label, onClick, color }: { icon: string; label: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color, textAlign: 'left' }}>
      <i className={`ti ${icon}`} /> {label}
    </button>
  )
}

export function InsightsView({ deals }: { deals: Deal[] }) {
  const STAGES = getStages()
  const open = deals.filter(d => !['completed', 'lost'].includes(d.stage))
  const won = deals.filter(d => d.stage === 'completed')
  const lost = deals.filter(d => d.stage === 'lost')
  const openValue = open.reduce((s, d) => s + d.value, 0)
  const mrr = deals.filter(d => d.revenueType === 'mrr' && ['signed', 'active', 'completed'].includes(d.stage)).reduce((s, d) => s + d.value, 0)
  const wonValue = won.reduce((s, d) => s + d.value, 0)
  const decided = won.length + lost.length
  const winRate = decided ? Math.round((won.length / decided) * 100) : 0

  const now = Date.now()
  const weekAgo = now - 7 * 86400000
  const activityWeek = deals.reduce((s, d) => s + (d.activity ?? []).filter(a => new Date(a.ts).getTime() >= weekAgo).length, 0)
  const overdue = deals.filter(d => d.nextStepDate && new Date(d.nextStepDate).getTime() < now && !['completed', 'lost'].includes(d.stage))
  const maxStage = Math.max(1, ...STAGES.map(s => deals.filter(d => d.stage === s.key).length))

  const stat = (label: string, value: string, sub?: string, color?: string) => (
    <div className="os-card" style={{ padding: '18px 20px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color ?? 'var(--os-text)', letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--os-text)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        {stat('Open pipeline', `$${openValue.toLocaleString()}`, `${open.length} active deals`)}
        {stat('Monthly recurring', `$${mrr.toLocaleString()}/mo`, 'Signed + active retainers', 'var(--accent)')}
        {stat('Won', `$${wonValue.toLocaleString()}`, `${won.length} closed`, 'var(--os-good)')}
        {stat('Win rate', `${winRate}%`, `${won.length} won · ${lost.length} lost`)}
        {stat('Activity (7d)', `${activityWeek}`, 'notes, calls, meetings')}
        {stat('Overdue follow-ups', `${overdue.length}`, 'next steps past due', overdue.length ? 'var(--os-bad)' : undefined)}
      </div>

      <div className="os-card" style={{ padding: 24 }}>
        <div className="os-crm-section-title" style={{ marginBottom: 16 }}>Funnel by stage</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STAGES.map(s => {
            const ds = deals.filter(d => d.stage === s.key)
            const val = ds.reduce((sum, d) => sum + d.value, 0)
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 110, fontSize: 12.5, fontWeight: 600, color: 'var(--os-text-muted)' }}>{s.label}</div>
                <div style={{ flex: 1, background: 'var(--os-line)', borderRadius: 8, height: 26, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: `${(ds.length / maxStage) * 100}%`, background: s.color, height: '100%', borderRadius: 8, minWidth: ds.length ? 24 : 0, transition: 'width .3s' }} />
                  <span style={{ position: 'absolute', left: 10, top: 0, lineHeight: '26px', fontSize: 12, fontWeight: 700, color: ds.length / maxStage > 0.15 ? '#fff' : 'var(--os-text-muted)' }}>{ds.length}</span>
                </div>
                <div style={{ width: 90, textAlign: 'right', fontSize: 12.5, color: 'var(--os-text-faint)' }}>{val > 0 ? `$${val.toLocaleString()}` : ''}</div>
              </div>
            )
          })}
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="os-card" style={{ padding: 24 }}>
          <div className="os-crm-section-title" style={{ marginBottom: 12, color: 'var(--os-bad)' }}>Overdue follow-ups</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overdue.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid #f5f0fc' }}>
                <span style={{ fontWeight: 600 }}>{d.clientName}</span>
                <span style={{ color: 'var(--os-warn)' }}>{d.nextStep} · {new Date(d.nextStepDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
