'use client'

import { getLeads } from '@/lib/crm-store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDeals, saveDeal, updateDeal, deleteDeal, saveProposal, dealToRow, rowToDeal } from '@/lib/crm-store'
import { getClientRecords, createClientRecord } from '@/lib/client-store'
import type { Deal, DealStage, ActivityType, ActivityEntry } from '@/lib/crm-types'
import { getStages, saveStages, stageSlug, type Stage, PRESET_TAGS, PRIORITY_COLOR, genId, QuickActions, ProcessStepper, CrmDetail, ContactTimer, LeadAge, LeadTimers, recentlyLogged } from './crm-shared'
import { TableView, InsightsView } from './views'
import ContactCard, { type ContactCardContact } from '@/components/ContactCard'
import { hasUnsyncedWrites } from '@/lib/sync-status'
import LeadsSwitch from '@/components/os/LeadsSwitch'
import { getPeople } from '@/lib/people'
import { isLikelySpam } from '@/lib/apply-guard'
import { confirmAction } from '@/app/os/ConfirmHost'
import { EmailText } from '@/components/os/CopyEmail'

type ViewMode = 'pipeline' | 'table' | 'insights'

function money(v: number, deal: Deal): string {
  return deal.revenueType === 'mrr' ? `$${v.toLocaleString()}/mo` : `$${v.toLocaleString()}`
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

const AVATAR_COLORS = ['#7b2fff', '#0891b2', 'var(--os-warn)', 'var(--os-good)', '#db2777', 'var(--os-accent)', '#9333ea']
function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function exportCsv(deals: Deal[]) {
  const cols = ['clientName', 'clientCompany', 'clientEmail', 'clientPhone', 'stage', 'value', 'revenueType', 'priority', 'service', 'nextStep', 'nextStepDate', 'location', 'tags']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = deals.map(d => cols.map(c => esc(c === 'tags' ? (d.tags ?? []).join('; ') : (d as unknown as Record<string, unknown>)[c])).join(','))
  const csv = [cols.join(','), ...rows].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'bos-crm-contacts.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function DealsPage() {
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [view, setView] = useState<ViewMode>('pipeline')

  const [orphanLeads, setOrphanLeads] = useState<{ id: string; name: string; email?: string; company?: string; source?: string; createdAt: string }[]>([])
  const [tagFilter, setTagFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [prioFilter, setPrioFilter] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<DealStage | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  const [cardContact, setCardContact] = useState<ContactCardContact | null>(null)
  const [stages, setStages] = useState<Stage[]>(() => getStages())
  const [showStages, setShowStages] = useState(false)
  const [logDeal, setLogDeal] = useState<Deal | null>(null)
  const [onboarding, setOnboarding] = useState<OnboardingLink | null>(null)

  const reload = () => {
    const ds = getDeals()

    for (const d of ds) {
      if (d.stage === 'signed' || d.stage === 'completed') provisionActiveClient(d)
    }
    setDeals(ds)
    const dealEmails = new Set(ds.map(d => (d.clientEmail ?? '').trim().toLowerCase()).filter(Boolean))
    setOrphanLeads(getLeads().filter(l => {
      const e = (l.email ?? '').trim().toLowerCase()
      return e && !dealEmails.has(e)
    }))
  }

  const pullFromServer = useCallback((force = false) => {
    if (!force && (dragIdRef.current || selectedIdRef.current)) return

    if (hasUnsyncedWrites()) return
    fetch('/api/os-data?parts=deals')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then(data => {
        if (!data.ok || !data.deals?.length) return
        const seen = new Set<string>()
        const deduped = (data.deals as Record<string, unknown>[]).map(rowToDeal).filter(d => {
          const key = (d.clientEmail || d.clientPhone || '').trim().toLowerCase()
          if (!key) return true
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        localStorage.setItem('bos_deals', JSON.stringify(deduped))
        setDeals(deduped)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    reload()
    pullFromServer(true)

    const interval = setInterval(() => pullFromServer(), 20000)
    const onFocus = () => pullFromServer()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [pullFromServer])

  const q = search.trim().toLowerCase()
  const visible = deals.filter(d => {
    if (tagFilter !== 'All' && !(d.tags ?? []).includes(tagFilter)) return false
    if (prioFilter && d.priority !== prioFilter) return false
    if (q && !(`${d.clientName} ${d.clientCompany ?? ''} ${d.clientEmail} ${d.service ?? ''}`.toLowerCase().includes(q))) return false
    return true
  })
  const selected = deals.find(d => d.id === selectedId) ?? null

  const clientDealIds = new Set(getClientRecords().map(c => c.dealId).filter(Boolean))
  const pipelineDeals = visible.filter(d => !clientDealIds.has(d.id))
  const totalPipeline = pipelineDeals.filter(d => !['completed', 'lost'].includes(d.stage)).reduce((s, d) => s + d.value, 0)

  const stageKeys = new Set(stages.map(s => s.key))
  const extraStages: Stage[] = []
  const seenExtra = new Set<string>()
  for (const d of pipelineDeals) {
    if (d.stage && !stageKeys.has(d.stage) && !seenExtra.has(d.stage)) {
      seenExtra.add(d.stage)
      extraStages.push({ key: d.stage, label: d.stage, color: 'var(--os-text-muted)' })
    }
  }
  const columns = [...stages, ...extraStages]

  function logActivity(deal: Deal, type: ActivityType, text: string) {
    const entry: ActivityEntry = { id: genId('a'), ts: new Date().toISOString(), type, text }

    const fresh = getDeals().find(d => d.id === deal.id) ?? deal
    updateDeal(deal.id, { activity: [entry, ...(fresh.activity ?? [])] })
    reload()
  }

  function logTouch(deal: Deal, type: ActivityType, text: string) {
    if (recentlyLogged(deal, type)) return
    logActivity(deal, type, text)
  }

  function provisionActiveClient(deal: Deal) {
    const email = deal.clientEmail.trim().toLowerCase()
    const already = getClientRecords().some(c =>
      c.dealId === deal.id || (email && c.email.trim().toLowerCase() === email))
    if (already) return
    createClientRecord({
      dealId: deal.id,
      name: deal.clientName,
      email: deal.clientEmail,
      phone: deal.clientPhone,
      company: deal.clientCompany,
      program: deal.service || '',
      status: 'active',

      deliveryStage: 'Onboarding',
      startedAt: new Date().toISOString(),
      monthlyAmount: deal.revenueType === 'mrr' ? deal.value : undefined,
      currency: deal.currency,
      coachNote: deal.notes || undefined,
    })
  }

  function setStage(deal: Deal, stage: DealStage) {
    if (deal.stage === stage) return
    const label = stages.find(s => s.key === stage)?.label ?? stage
    const entry: ActivityEntry = { id: genId('a'), ts: new Date().toISOString(), type: 'stage', text: `Moved to ${label}` }
    if (stage === 'signed' || stage === 'completed') provisionActiveClient(deal)
    updateDeal(deal.id, { stage, activity: [entry, ...(deal.activity ?? [])] })
    reload()
  }

  function handleDrop(stage: DealStage) {
    setDragOver(null)
    const id = dragIdRef.current
    dragIdRef.current = null; setDragId(null)
    if (!id) return
    const deal = deals.find(d => d.id === id)
    if (deal) setStage(deal, stage)
  }

  function addDeal() {
    const deal = saveDeal({ clientName: 'New Contact', clientEmail: '', clientCompany: '', stage: 'lead', value: 0, currency: 'USD', service: '', notes: '' })
    reload(); setSelectedId(deal.id)
  }

  function patch(id: string, p: Partial<Deal>) { updateDeal(id, p); reload() }

  function markContacted(deal: Deal) {
    const entry: ActivityEntry = { id: genId('a'), ts: new Date().toISOString(), type: 'call', text: 'Marked as contacted' }
    updateDeal(deal.id, { activity: [entry, ...(deal.activity ?? [])] })
    reload()
  }

  function quickFollowUp(deal: Deal) {
    const next = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const entry: ActivityEntry = { id: genId('a'), ts: new Date().toISOString(), type: 'call', text: 'Logged a follow-up' }
    updateDeal(deal.id, { activity: [entry, ...(deal.activity ?? [])], nextStep: deal.nextStep || 'Follow up', nextStepDate: next })
    reload()
  }

  function quickLog(deal: Deal, opts: { note: string; stage: DealStage; value: number }) {
    const activity = [...(deal.activity ?? [])]
    const patch: Partial<Deal> = {}
    if (opts.stage && opts.stage !== deal.stage) {
      const label = stages.find(s => s.key === opts.stage)?.label ?? opts.stage
      activity.unshift({ id: genId('a'), ts: new Date().toISOString(), type: 'stage', text: `Moved to ${label}` })
      patch.stage = opts.stage
      if (opts.stage === 'signed' || opts.stage === 'completed') provisionActiveClient(deal)
    }
    if (opts.note.trim()) {
      activity.unshift({ id: genId('a'), ts: new Date().toISOString(), type: 'call', text: opts.note.trim() })
    }
    if (!Number.isNaN(opts.value) && opts.value !== (deal.value ?? 0)) patch.value = opts.value
    patch.activity = activity
    updateDeal(deal.id, patch)
    reload()
    setLogDeal(null)
  }

  const [armedDelete, setArmedDelete] = useState<string | null>(null)

  function removeDeal(id: string) {
    if (armedDelete !== id) { setArmedDelete(id); return }
    setArmedDelete(null)
    deleteDeal(id); setSelectedId(null); reload()
  }

  function convertToProposal(deal: Deal) {
    const months = deal.retainerMonths && deal.retainerMonths > 0 ? deal.retainerMonths : 1
    const schedule = deal.revenueType === 'mrr'
      ? Array.from({ length: months }, (_, i) => ({ label: `Month ${i + 1}`, amount: deal.value, note: '' }))
      : [{ label: deal.service || 'Project fee', amount: deal.value, note: '' }]
    const total = schedule.reduce((s, m) => s + m.amount, 0)
    const proposal = saveProposal({
      dealId: deal.id, clientName: deal.clientName, clientEmail: deal.clientEmail, clientCompany: deal.clientCompany,
      title: deal.service ? `${deal.service}, Proposal for ${deal.clientName}` : `Proposal for ${deal.clientName}`,
      intro: deal.desiredOutcome || '', services: deal.service ? [deal.service] : [], deliverables: [],
      paymentSchedule: schedule, total, currency: 'USD', validDays: 14, status: 'draft', paymentLink: '', bankInfo: '',
    })
    logActivity(deal, 'note', `Created proposal ${proposal.ref}`)
    router.push(`/os/proposals/${proposal.id}/edit`)
  }

  async function openOnboarding(deal: Deal) {
    setOnboarding({ deal, state: 'loading' })
    try {
      const res = await fetch('/api/os/learning-platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-welcome',
          email: deal.clientEmail,
          name: deal.clientName,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setOnboarding({ deal, state: 'error', error: data.error || `Could not send access (${res.status}).` })
        return
      }
      logActivity(deal, 'note', 'Portal access sent')
      setOnboarding({ deal, state: 'sent' })
    } catch {
      setOnboarding({ deal, state: 'error', error: 'Could not reach the server.' })
    }
  }

  const headerSub =
    view === 'insights' ? 'Pipeline analytics across all contacts'
    : `$${totalPipeline.toLocaleString()} in active pipeline · ${visible.length} contacts`

  return (
    <>
      <LeadsSwitch active="inbound" />
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Inbound leads</div>
          <div className="os-page-sub">{headerSub}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="os-btn os-btn-ghost" onClick={() => setShowStages(true)}><i className="ti ti-columns" /> Stages</button>
          <button className="os-btn os-btn-ghost" onClick={() => exportCsv(visible)}><i className="ti ti-download" /> Export{visible.length !== deals.length ? ` (${visible.length})` : ''}</button>
          <button className="os-btn os-btn-primary" onClick={addDeal}><i className="ti ti-plus" /> Add Contact</button>
        </div>
      </div>

      <div className="os-crm-toolbar">
        <div className="os-view-tabs">
          {(['pipeline', 'table', 'insights'] as ViewMode[]).map(v => (
            <button key={v} className={`os-view-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
              <i className={`ti ${v === 'pipeline' ? 'ti-layout-kanban' : v === 'table' ? 'ti-table' : 'ti-chart-bar'}`} /> {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        {view !== 'insights' && (
          <div className="os-crm-toolbar-right">
            <div className="os-search-box">
              <i className="ti ti-search" />
              <input placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="os-crm-input" value={prioFilter} onChange={e => setPrioFilter(e.target.value)} style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }}>
              <option value="">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </div>
        )}
      </div>

      {view !== 'insights' && (
        <>
          <div className="os-tag-filter os-tag-filter-chips">
            {['All', ...PRESET_TAGS].map(t => (
              <button key={t} className={`os-tag-chip${tagFilter === t ? ' active' : ''}`} onClick={() => setTagFilter(t)}>{t}</button>
            ))}
          </div>
          <label className="os-tag-filter-select">
            <span className="os-visually-hidden">Filter by industry</span>
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
              <option value="All">All industries</option>
              {PRESET_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </>
      )}

      {view === 'insights' && <InsightsView deals={deals} />}
      {view === 'table' && orphanLeads.length > 0 && (
        <div className="os-card" style={{ marginBottom: 14, padding: '14px 16px', borderLeft: '3px solid var(--os-warn)' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--os-text)', marginBottom: 3 }}>
            {orphanLeads.length} captured {orphanLeads.length === 1 ? 'lead is' : 'leads are'} not in the pipeline
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--os-text-muted)', marginBottom: 10 }}>
            They came in through a form but never became a deal, so they were only ever visible on the old Leads page.
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {orphanLeads.map(l => (
              <div key={l.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(232,165,22,.07)', borderRadius: 9 }}>
                <div style={{ minWidth: 150, flex: '1 1 0' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)' }}>{l.name || l.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--os-text-muted)', overflowWrap: 'anywhere' }}>{l.company ? `${l.company} · ` : ''}<EmailText email={l.email} /></div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--os-warn)', fontWeight: 700 }}>{l.source ?? 'form'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'table' && (
        <TableView
          deals={visible}
          stages={stages}
          onOpen={id => setSelectedId(id)}
          onStage={(deal, stage) => setStage(deal, stage)}
          onContact={markContacted}
          onArchive={deal => setStage(deal, 'lost')}
          onDelete={deal => removeDeal(deal.id)}
        />
      )}

      {view === 'pipeline' && <PipelineHygiene deals={pipelineDeals} onMoveOut={(deal, reason) => { logActivity(deal, 'note', reason); setStage(deal, 'lost') }} onKeepAsClient={deal => setStage(deal, 'active')} />}

      {view === 'pipeline' && (
        <div className="os-pipeline">
          {columns.map(stage => {
            const stageDeals = pipelineDeals.filter(d => d.stage === stage.key)
            const stageValue = stageDeals.reduce((s, d) => s + d.value, 0)
            return (
              <div key={stage.key} className={`os-pipeline-col${dragOver === stage.key ? ' drop-active' : ''}`}
                onDragOver={e => { e.preventDefault(); if (dragOver !== stage.key) setDragOver(stage.key) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null) }}
                onDrop={() => handleDrop(stage.key)}>
                <div className="os-pipeline-col-header">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, display: 'inline-block' }} />
                  {stage.label}
                  <span className="os-pipeline-col-count">{stageDeals.length}</span>
                  {stageValue > 0 && <span style={{ marginLeft: 'auto', color: 'var(--os-text-muted)', fontSize: 11 }}>${stageValue.toLocaleString()}</span>}
                </div>
                {stageDeals.map(deal => (
                  <div key={deal.id} className={`os-deal-card${dragId === deal.id ? ' dragging' : ''}`} draggable
                    style={{ borderLeft: `4px solid ${deal.priority ? PRIORITY_COLOR[deal.priority] : 'var(--os-line)'}` }}
                    onDragStart={() => { dragIdRef.current = deal.id; setDragId(deal.id) }}
                    onDragEnd={() => { dragIdRef.current = null; setDragId(null); setDragOver(null) }}
                    onClick={() => { setArmedDelete(null); setSelectedId(deal.id) }}>
                    <div className="os-deal-head">
                      <span className="os-deal-avatar" style={{ background: avatarColor(deal.id) }}>{initials(deal.clientName)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="os-deal-name" style={{ marginBottom: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.clientName}</span>
                          {deal.priority && <span className={`os-prio-badge prio-${deal.priority}`}>{deal.priority}</span>}
                        </div>
                        {(deal.clientCompany || deal.clientRole) && <div className="os-deal-company" style={{ marginBottom: 0 }}>{deal.clientCompany}{deal.clientRole ? ` · ${deal.clientRole}` : ''}</div>}
                      </div>
                      <i className="ti ti-grip-vertical os-deal-grip" />
                    </div>

                    {deal.service && <div className="os-deal-line"><i className="ti ti-briefcase" /> {deal.service}</div>}
                    {deal.clientPhone && <div className="os-deal-line"><i className="ti ti-phone" /> {deal.clientPhone}</div>}
                    {deal.clientEmail && <div className="os-deal-line"><i className="ti ti-mail" /> <EmailText email={deal.clientEmail} /></div>}
                    {deal.location && <div className="os-deal-line"><i className="ti ti-map-pin" /> {deal.location}</div>}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <div className="os-deal-value">{deal.value > 0 ? money(deal.value, deal) : 'No value set'}</div>
                      {(deal.activity?.length ?? 0) > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--os-text-faint)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <i className="ti ti-message-dots" style={{ fontSize: 12 }} /> {deal.activity!.length}
                        </span>
                      )}
                    </div>

                    {(deal.tags?.length ?? 0) > 0 && (
                      <div className="os-deal-tags">{deal.tags!.slice(0, 3).map(t => <span key={t} className="os-chip">{t}</span>)}</div>
                    )}

                    <div className={`os-deal-next${deal.nextStep ? '' : ' empty'}`}>
                      <i className={`ti ${deal.nextStep ? 'ti-flag-3' : 'ti-alert-triangle'}`} />
                      <span>{deal.nextStep || 'No next activity'}</span>
                      {deal.nextStepDate && <span className="os-deal-next-date">{new Date(deal.nextStepDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    </div>

                    <div className="os-deal-actions" onClick={e => e.stopPropagation()}>
                      <div className="os-deal-actrow">
                      {deal.clientPhone ? (
                        <a className="os-deal-act act-call" href={`tel:${deal.clientPhone}`} onClick={() => logTouch(deal, 'call', 'Called the lead')}><i className="ti ti-phone" /> Call</a>
                      ) : (
                        <button className="os-deal-act act-disabled" onClick={() => setSelectedId(deal.id)} title="Add a phone number"><i className="ti ti-phone" /> Call</button>
                      )}
                      {deal.clientPhone && (
                        <a className="os-deal-act act-wa" href={`https://wa.me/${deal.clientPhone.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="Message on WhatsApp" onClick={() => logTouch(deal, 'whatsapp', 'Messaged on WhatsApp')}><i className="ti ti-brand-whatsapp" /></a>
                      )}
                      </div>
                      <div className="os-deal-actrow">
                      <button className="os-deal-act act-follow" onClick={() => quickFollowUp(deal)} title="Log a follow-up and schedule the next in 3 days"><i className="ti ti-corner-down-right" /> Follow up</button>
                      <button className="os-deal-act act-log" onClick={() => setLogDeal(deal)} title="Log a call or a quick update" aria-label="Log a call or update"><i className="ti ti-notes" /></button>
                      <button
                        className={`os-deal-act act-del${armedDelete === deal.id ? ' armed' : ''}`}
                        onClick={() => removeDeal(deal.id)}
                        title={armedDelete === deal.id ? 'Press again to delete' : 'Delete this lead'}
                        aria-label={armedDelete === deal.id ? 'Press again to delete this lead' : 'Delete this lead'}
                      >
                        <i className={`ti ${armedDelete === deal.id ? 'ti-alert-triangle' : 'ti-trash'}`} />
                        {armedDelete === deal.id ? 'Sure? Delete' : ''}
                      </button>
                      </div>
                    </div>
                    <div className="os-deal-foot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <ContactTimer deal={deal} />
                      <LeadAge deal={deal} />
                    </div>
                  </div>
                ))}
                <div className="os-pipeline-dropzone">{stageDeals.length === 0 ? 'Drop here' : '+'}</div>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <>
          <div className="os-drawer-overlay" onClick={() => setSelectedId(null)} />
          <div className="os-crm-drawer">
            <div className="os-drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <input className="os-crm-input" value={selected.clientName}
                  onChange={e => setDeals(ds => ds.map(d => d.id === selected.id ? { ...d, clientName: e.target.value } : d))}
                  onBlur={e => patch(selected.id, { clientName: e.target.value })}
                  style={{ fontSize: 18, fontWeight: 800, background: 'transparent', padding: '2px 4px' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingLeft: 4 }}>
                  <select className="os-crm-input" value={selected.stage} onChange={e => setStage(selected, e.target.value as DealStage)} style={{ width: 'auto', padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>
                    {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <select className="os-crm-input" value={selected.priority ?? ''} onChange={e => patch(selected.id, { priority: (e.target.value || undefined) as Deal['priority'] })} style={{ width: 'auto', padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>
                    <option value="">No priority</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <LeadTimers deal={selected} style={{ marginTop: 10, paddingLeft: 4 }} />
              </div>
              <button className="os-icon-btn" title="View contact profile" onClick={() => setCardContact({ id: selected.id, name: selected.clientName, email: selected.clientEmail, phone: selected.clientPhone, company: selected.clientCompany, tags: selected.tags, notes: selected.notes, createdAt: selected.createdAt, _deal: selected })}><i className="ti ti-user-circle" /></button>
              <button className="os-icon-btn" title="Open full contact page" onClick={() => router.push(`/os/contacts/${encodeURIComponent(selected.clientEmail)}`)}><i className="ti ti-arrows-diagonal" /></button>
              <button
                className="os-icon-btn"
                title={armedDelete === selected.id ? 'Press again to delete' : 'Delete'}
                onClick={() => removeDeal(selected.id)}
                style={{
                  color: 'var(--os-bad)',
                  borderColor: 'var(--os-bad)',
                  background: armedDelete === selected.id ? 'var(--os-bad-soft)' : undefined,
                  width: armedDelete === selected.id ? 'auto' : undefined,
                  padding: armedDelete === selected.id ? '0 12px' : undefined,
                  fontWeight: 700,
                }}
              >
                <i className={`ti ${armedDelete === selected.id ? 'ti-alert-triangle' : 'ti-trash'}`} />
                {armedDelete === selected.id ? ' Sure?' : ''}
              </button>
              <button className="os-icon-btn" title="Close" onClick={() => setSelectedId(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="os-drawer-body">
              <QuickActions deal={selected} onLog={(t, txt) => logActivity(selected, t, txt)} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <button className="os-btn os-btn-sm" onClick={() => convertToProposal(selected)} style={{ background: 'var(--os-deep)', color: 'var(--os-on-deep)', flex: 1, minWidth: 165 }}>
                  <i className="ti ti-file-export" /> Convert to Proposal
                </button>
                <button className="os-btn os-btn-sm" onClick={() => openOnboarding(selected)} title="Get this client's onboarding link" style={{ background: '#eaa92e', color: '#3a2600', flex: 1, minWidth: 140 }}>
                  <i className="ti ti-clipboard-check" /> Onboarding
                </button>
                <button className="os-btn os-btn-sm os-btn-ghost" onClick={() => setStage(selected, 'completed')} style={{ color: 'var(--os-good)', borderColor: '#bbf7d0' }}><i className="ti ti-trophy" /> Won</button>
                <button className="os-btn os-btn-sm os-btn-ghost" onClick={() => { const r = prompt('Reason lost? (optional)'); if (r) logActivity(selected, 'note', `Lost: ${r}`); setStage(selected, 'lost') }} style={{ color: 'var(--os-bad)', borderColor: 'var(--os-bad-soft)' }}>Lost</button>
              </div>
              <div className="os-crm-section">
                <div className="os-crm-section-title">Process</div>
                <ProcessStepper stage={selected.stage} onPick={s => setStage(selected, s)} stages={stages} />
              </div>
              <CrmDetail deal={selected} layout="drawer" onPatch={p => patch(selected.id, p)} onAddActivity={(t, txt) => logActivity(selected, t, txt)} />
            </div>
          </div>
        </>
      )}

      <ContactCard contact={cardContact} onClose={() => setCardContact(null)} />

      {showStages && (
        <StagesManager
          initial={stages}
          onClose={() => setShowStages(false)}
          onSave={s => { saveStages(s); setStages(s); setShowStages(false) }}
        />
      )}

      {logDeal && (
        <QuickLogModal
          deal={logDeal}
          stages={stages}
          onClose={() => setLogDeal(null)}
          onSave={opts => quickLog(logDeal, opts)}
        />
      )}

      {onboarding && (
        <OnboardingLinkModal
          link={onboarding}
          onClose={() => setOnboarding(null)}
        />
      )}
    </>
  )
}

type OnboardingLink =
  | { deal: Deal; state: 'loading' }
  | { deal: Deal; state: 'error'; error: string }

  | { deal: Deal; state: 'sent' }

function OnboardingLinkModal({ link, onClose }: {
  link: OnboardingLink
  onClose: () => void
  onShared?: () => void
}) {
  const deal = link.deal
  const firstName = deal.clientName.trim().split(/\s+/)[0] || 'there'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ position:'absolute', inset:0, background:'var(--os-overlay, rgba(26,14,0,.35))', backdropFilter:'blur(4px)' }} onClick={onClose} />
      <div style={{ position:'relative', background:'var(--os-card)', borderRadius:20, padding:30, width:'100%', maxWidth:460, boxShadow:'0 24px 80px var(--os-line)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:'var(--font-sora), Sora, sans-serif', fontSize:18, fontWeight:800, color:'var(--os-text)' }}>
              Portal access
            </div>
            <div style={{ fontSize:13, color:'var(--os-text-faint)', marginTop:2 }}>
              {deal.clientName}{deal.clientRole ? ` · ${deal.clientRole}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, border:'none', background:'rgba(124,77,214,.1)', borderRadius:8, cursor:'pointer', fontSize:14, color:'var(--os-accent)' }}>✕</button>
        </div>

        {link.state === 'loading' && (
          <p style={{ fontSize:14, color:'var(--os-text-muted)', margin:0 }}>Sending…</p>
        )}

        {link.state === 'error' && (
          <div style={{ background:'var(--os-bad-soft, rgba(220,38,38,.1))', borderRadius:10, padding:'12px 14px', fontSize:14, color:'var(--os-bad)', lineHeight:1.6 }}>
            {link.error}
          </div>
        )}

        {link.state === 'sent' && (
          <>
            <div style={{ background:'var(--os-good-soft, rgba(31,138,91,.12))', borderRadius:10, padding:'12px 14px', fontSize:14, color:'var(--os-good)', fontWeight:600, marginBottom:12 }}>
              Sent to {deal.clientEmail}
            </div>
            <p style={{ fontSize:13.5, color:'var(--os-text-muted)', lineHeight:1.65, margin:0 }}>
              {firstName} has their login link and their account is live. Their business details
              are collected by the portal itself on first login, and they write straight back onto
              this contact, so there is nothing else to send.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function QuickLogModal({ deal, stages, onClose, onSave }: {
  deal: Deal
  stages: Stage[]
  onClose: () => void
  onSave: (opts: { note: string; stage: DealStage; value: number }) => void
}) {
  const [note, setNote] = useState('')
  const [stage, setStage] = useState<DealStage>(deal.stage)
  const [value, setValue] = useState(String(deal.value ?? 0))

  function save() {
    onSave({ note, stage, value: parseFloat(value) })
  }

  return (
    <div className="os-drawer-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--os-card)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, boxShadow: '0 24px 70px rgba(26,14,0,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 17, fontWeight: 800, color: 'var(--os-text-primary)' }}>Log update</div>
          <button className="os-icon-btn" onClick={onClose} title="Close"><i className="ti ti-x" /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--os-text-muted)', marginBottom: 16 }}>{deal.clientName}{deal.clientCompany ? ` · ${deal.clientCompany}` : ''}</div>

        <label className="os-label">Note / what happened</label>
        <textarea
          className="os-crm-textarea"
          autoFocus
          rows={4}
          placeholder="Discovery call done. Offered $1,500 for website + Meta ads, payable in 2-3 parts…"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save() }}
          style={{ marginBottom: 16 }}
        />

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label className="os-label">Stage</label>
            <select className="os-select" value={stage} onChange={e => setStage(e.target.value)}>
              {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label className="os-label">Value (USD)</label>
            <input className="os-input" type="number" value={value} onChange={e => setValue(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="os-btn os-btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="os-btn os-btn-primary" onClick={save} style={{ flex: 1 }}><i className="ti ti-device-floppy" /> Save update</button>
        </div>
      </div>
    </div>
  )
}

const STAGE_PALETTE = ['#9ca3af', 'var(--os-accent)', 'var(--os-warn)', 'var(--os-accent)', 'var(--os-good)', '#0891b2', 'var(--os-good)', 'var(--os-bad)', '#ec4899', 'var(--os-warn)', '#14b8a6', 'var(--os-accent)']

function StagesManager({ initial, onClose, onSave }: { initial: Stage[]; onClose: () => void; onSave: (s: Stage[]) => void }) {
  const [rows, setRows] = useState<Stage[]>(initial.map(s => ({ ...s })))

  const update = (i: number, patch: Partial<Stage>) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const move = (i: number, dir: -1 | 1) => setRows(rs => {
    const j = i + dir
    if (j < 0 || j >= rs.length) return rs
    const copy = [...rs];[copy[i], copy[j]] = [copy[j], copy[i]]; return copy
  })
  const remove = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i))
  const add = () => setRows(rs => [...rs, { key: 'stage_' + Date.now().toString(36), label: 'New Stage', color: STAGE_PALETTE[rs.length % STAGE_PALETTE.length] }])

  function save() {
    const cleaned = rows
      .map(r => ({ ...r, label: r.label.trim(), key: r.key || stageSlug(r.label) }))
      .filter(r => r.label)
    if (!cleaned.length) return
    onSave(cleaned)
  }

  return (
    <>
      <div className="os-drawer-overlay" onClick={onClose} />
      <div className="os-crm-drawer">
        <div className="os-drawer-head">
          <div style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>Pipeline stages</div>
          <button className="os-icon-btn" title="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="os-drawer-body">
          <div style={{ fontSize: 13, color: '#998fb3', marginBottom: 16 }}>Rename, recolor, reorder, add or remove stages. Drag cards between them on the board.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r, i) => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={r.color} onChange={e => update(i, { color: e.target.value })}
                  style={{ width: 34, height: 34, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }} />
                <input className="os-crm-input" value={r.label} onChange={e => update(i, { label: e.target.value })} style={{ flex: 1 }} />
                <button className="os-icon-btn" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}><i className="ti ti-chevron-up" /></button>
                <button className="os-icon-btn" title="Move down" onClick={() => move(i, 1)} disabled={i === rows.length - 1}><i className="ti ti-chevron-down" /></button>
                <button className="os-icon-btn" title="Remove" onClick={() => remove(i)} style={{ color: 'var(--os-bad)', borderColor: 'var(--os-bad-soft)' }} disabled={rows.length <= 1}><i className="ti ti-trash" /></button>
              </div>
            ))}
          </div>
          <button className="os-add-btn" style={{ marginTop: 14 }} onClick={add}><i className="ti ti-plus" /> Add stage</button>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button className="os-btn os-btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button className="os-btn os-btn-primary" onClick={save} style={{ flex: 1 }}><i className="ti ti-device-floppy" /> Save stages</button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--os-text-muted)', marginTop: 14, lineHeight: 1.5 }}>
            Note: stage settings are saved on this device. Deals you already moved keep their stage; renaming a stage keeps its cards.
          </div>
        </div>
      </div>
    </>
  )
}

function PipelineHygiene({ deals, onMoveOut, onKeepAsClient }: {
  deals: Deal[]
  onMoveOut: (deal: Deal, reason: string) => void
  onKeepAsClient: (deal: Deal) => void
}) {
  const [open, setOpen] = useState(true)
  const clients = new Set(getPeople().filter(p => p.stage === 'client').map(p => p.key))
  const OPEN = ['lead', 'discovery', 'proposal_sent', 'negotiation']
  const live = deals.filter(d => OPEN.includes(d.stage))
  const key = (d: Deal) => (d.clientEmail || d.clientName || '').trim().toLowerCase()
  const isClient = live.filter(d => clients.has(key(d)))
  const isSpam = live.filter(d => !clients.has(key(d)) && isLikelySpam({ name: d.clientName, email: d.clientEmail, clientCompany: d.clientCompany, tags: d.tags }))
  const unqualified = live.filter(d => !clients.has(key(d)) && !isSpam.includes(d) && (d.tags ?? []).some(t => /^not qualified/i.test(t)))
  const total = isClient.length + isSpam.length + unqualified.length
  if (total === 0) return null

  const bucket = async (label: string, items: Deal[], act: (d: Deal) => void, detail: string, tone: string) => {
    if (!(await confirmAction({ message: `${label} — ${items.length} card${items.length === 1 ? '' : 's'}?`, detail, confirmLabel: label }))) return
    items.forEach(act)
  }

  const Row = ({ title, hint, items, action, onAct, tone }: { title: string; hint: string; items: Deal[]; action: string; onAct: () => void; tone: string }) => items.length === 0 ? null : (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid var(--os-line)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone, marginTop: 7, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--os-text)' }}>{title} <span style={{ color: 'var(--os-text-faint)', fontWeight: 700 }}>{items.length}</span></div>
        <div style={{ fontSize: 12, color: 'var(--os-text-faint)', marginTop: 2 }}>{hint}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {items.slice(0, 12).map(d => <span key={d.id} className="os-chip" title={d.clientEmail}>{d.clientName || d.clientEmail}{d.clientCompany ? ` · ${d.clientCompany}` : ''}</span>)}
          {items.length > 12 && <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>+{items.length - 12} more</span>}
        </div>
      </div>
      <button type="button" className="os-btn os-btn-sm os-btn-ghost" onClick={onAct} style={{ flexShrink: 0 }}>{action}</button>
    </div>
  )

  return (
    <div className="os-card" style={{ padding: '14px 18px', marginBottom: 16 }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 10, color: 'var(--os-text-faint)' }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--os-text)' }}>Clean up the pipeline</span>
        <span style={{ fontSize: 12.5, color: 'var(--os-text-faint)' }}>{total} card{total === 1 ? '' : 's'} that should not be here</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <Row title="Already a client" hint="Signed, invoiced or in the portal. They belong in Active, not the pipeline." items={isClient} action="Move to Active" tone="var(--os-good)"
            onAct={() => bucket('Move to Active', isClient, onKeepAsClient, 'They stay clients; the cards leave the pipeline columns.', 'var(--os-good)')} />
          <Row title="Likely spam" hint="Generated names, throwaway addresses. The same verdict Contacts shows." items={isSpam} action="Mark lost" tone="var(--os-bad)"
            onAct={() => bucket('Mark lost', isSpam, d => onMoveOut(d, 'Cleanup: likely spam'), 'Marked Lost with a note. Delete them from Contacts if you want them gone.', 'var(--os-bad)')} />
          <Row title="Not qualified" hint="The application put them under the revenue line for the free call." items={unqualified} action="Mark lost" tone="var(--os-warn)"
            onAct={() => bucket('Mark lost', unqualified, d => onMoveOut(d, 'Cleanup: not qualified'), 'Marked Lost with a note; the history stays on their contact card.', 'var(--os-warn)')} />
        </div>
      )}
    </div>
  )
}
