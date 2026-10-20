'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Deal, DealStage, ActivityType, ActivityEntry } from '@/lib/crm-types'

export type Stage = { key: string; label: string; color: string }

export const DEFAULT_STAGES: Stage[] = [
  { key: 'lead', label: 'New Lead', color: 'var(--os-bad)' },
  { key: 'contacted', label: 'Contacted', color: '#f97316' },
  { key: 'discovery', label: 'Discovery', color: 'var(--os-warn)' },
  { key: 'proposal_sent', label: 'Proposal Sent', color: 'var(--os-accent)' },
  { key: 'negotiation', label: 'Negotiation', color: '#6366f1' },
  { key: 'signed', label: 'Signed ✓', color: '#14b8a6' },
]

const STAGES_KEY = 'bos_stages'

const STAGES_VERSION = 3

export function getStages(): Stage[] {
  if (typeof localStorage === 'undefined') return DEFAULT_STAGES
  try {
    const raw = localStorage.getItem(STAGES_KEY)
    if (!raw) return DEFAULT_STAGES
    const parsed = JSON.parse(raw)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.v === STAGES_VERSION
      && Array.isArray(parsed.stages) && parsed.stages.length
      && parsed.stages.every((s: Stage) => s.key && s.label && s.color)) {
      return parsed.stages as Stage[]
    }
  } catch { /* fall through */ }
  return DEFAULT_STAGES
}

export function saveStages(stages: Stage[]): void {
  try { localStorage.setItem(STAGES_KEY, JSON.stringify({ v: STAGES_VERSION, stages })) } catch { /* ignore */ }
}

export function stageSlug(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('stage_' + Date.now().toString(36))
}

export const STAGES: Stage[] = DEFAULT_STAGES

export const PRESET_TAGS = ['Real Estate', 'AI Agent', 'E-commerce', 'Tour Company', 'Beauty', 'Restaurant', 'Coaching', 'Other']

export const PRIORITY_COLOR: Record<NonNullable<Deal['priority']>, string> = {
  low: '#cbd5e1', medium: 'var(--os-warn)', high: 'var(--os-bad)',
}

export const ACTIVITY_ICON: Record<ActivityType, string> = {
  note: 'ti-note', call: 'ti-phone', email: 'ti-mail', meeting: 'ti-calendar-event', stage: 'ti-arrow-right', whatsapp: 'ti-brand-whatsapp',
}

export function genId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function fmtTs(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const CLOSED_STAGES = new Set(['signed', 'active', 'completed', 'lost'])
export const STALE_HOURS = 48
export const WARN_HOURS = 24

export function isOpenStage(stage: DealStage): boolean {
  return !CLOSED_STAGES.has(stage)
}

function ts(value: unknown): number {
  const t = new Date(String(value ?? '')).getTime()
  return Number.isFinite(t) ? t : NaN
}

export function lastTouchTs(deal: Deal): number {
  const touched = ts(deal.activity?.[0]?.ts)
  if (Number.isFinite(touched)) return touched
  const created = ts(deal.createdAt)
  return Number.isFinite(created) ? created : Date.now()
}

export function hoursSinceContact(deal: Deal): number {
  return (Date.now() - lastTouchTs(deal)) / 3600000
}

export function hoursSinceCreated(deal: Deal): number {
  const created = ts(deal.createdAt)
  return (Date.now() - (Number.isFinite(created) ? created : Date.now())) / 3600000
}

export function hasBeenContacted(deal: Deal): boolean {
  return (deal.activity?.length ?? 0) > 0
}

export function recentlyLogged(deal: Deal, type: ActivityType, withinMs = 60000): boolean {
  const a = deal.activity?.[0]
  if (!a || a.type !== type) return false
  return Date.now() - new Date(a.ts).getTime() < withinMs
}

export function isStale(deal: Deal): boolean {
  return isOpenStage(deal.stage) && hoursSinceContact(deal) >= STALE_HOURS
}

function fmtElapsed(hours: number): string {

  if (!Number.isFinite(hours) || hours < 1) return 'just now'
  if (hours < 24) return `${Math.floor(hours)}h`
  return `${Math.floor(hours / 24)}d`
}

export function ContactTimer({ deal, style }: { deal: Deal; style?: CSSProperties }) {
  if (!isOpenStage(deal.stage)) return null
  const hrs = hoursSinceContact(deal)
  const contacted = hasBeenContacted(deal)
  const stale = hrs >= STALE_HOURS
  const warn = !stale && hrs >= WARN_HOURS
  const color = stale ? 'var(--os-bad)' : warn ? 'var(--os-warn)' : 'var(--os-good)'
  const bg = stale ? 'var(--os-bad-soft)' : warn ? 'var(--os-warn-soft)' : 'var(--os-good-soft)'
  return (
    <span
      title={contacted ? 'Time since the last action on this lead' : 'No action taken yet, time since the lead entered the pipeline'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color, whiteSpace: 'nowrap', ...style }}
    >
      <i className={`ti ${stale ? 'ti-alarm-filled' : 'ti-clock'}`} style={{ fontSize: 12 }} />
      {fmtElapsed(hrs)}{contacted ? '' : ' new'}
    </span>
  )
}

export function LeadAge({ deal, style }: { deal: Deal; style?: CSSProperties }) {
  const hrs = hoursSinceCreated(deal)
  const since = new Date(deal.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <span
      title={`In the pipeline since ${since}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f1edfb', color: '#6e5fa3', whiteSpace: 'nowrap', ...style }}
    >
      <i className="ti ti-hourglass" style={{ fontSize: 12 }} />
      {fmtElapsed(hrs)}
    </span>
  )
}

export function LeadTimers({ deal, style }: { deal: Deal; style?: CSSProperties }) {
  const open = isOpenStage(deal.stage)
  const label: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--os-text-faint)' }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', ...style }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <span style={label}>In pipeline</span>
        <LeadAge deal={deal} />
      </span>
      {open && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={label}>Since last action</span>
          <ContactTimer deal={deal} />
        </span>
      )}
    </div>
  )
}

function digits(s?: string): string {
  return (s ?? '').replace(/[^\d]/g, '')
}

export function QuickActions({ deal, onLog }: { deal: Deal; onLog?: (type: ActivityType, text: string) => void }) {
  const wa = digits(deal.clientPhone)
  const log = (type: ActivityType, text: string) => {
    if (onLog && !recentlyLogged(deal, type)) onLog(type, text)
  }
  return (
    <div className="os-crm-actions">
      {wa && (
        <a className="os-crm-action os-crm-action-wa" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={() => log('whatsapp', 'Messaged on WhatsApp')}>
          <i className="ti ti-brand-whatsapp" /> WhatsApp
        </a>
      )}
      {deal.clientPhone && (
        <a className="os-crm-action os-crm-action-dark" href={`tel:${deal.clientPhone}`} onClick={() => log('call', 'Called the lead')}><i className="ti ti-phone" /> Call</a>
      )}
      {deal.clientEmail && (
        <a className="os-crm-action os-crm-action-dark" href={`mailto:${deal.clientEmail}`} onClick={() => log('email', 'Emailed the lead')}><i className="ti ti-mail" /> Email</a>
      )}
    </div>
  )
}

export function ProcessStepper({ stage, onPick, stages }: { stage: DealStage; onPick: (s: DealStage) => void; stages?: Stage[] }) {
  const list = stages ?? getStages()
  const idx = list.findIndex(s => s.key === stage)
  return (
    <div className="os-stepper">
      {list.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : 'todo'
        return (
          <button key={s.key} className={`os-step os-step-${state}`} onClick={() => onPick(s.key)} title={s.label}>
            <span className="os-step-dot" style={state !== 'todo' ? { background: s.color, borderColor: s.color, color: '#fff' } : undefined}>
              {state === 'done' ? <i className="ti ti-check" /> : i + 1}
            </span>
            <span className="os-step-label">{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}

type DetailProps = {
  deal: Deal
  layout: 'drawer' | 'page'
  onPatch: (p: Partial<Deal>) => void
  onAddActivity: (type: ActivityType, text: string) => void
}

export function CrmDetail({ deal, layout, onPatch, onAddActivity }: DetailProps) {
  const [draft, setDraft] = useState<Deal>(deal)
  const [composer, setComposer] = useState('')
  const [composerType, setComposerType] = useState<ActivityType>('note')

  useEffect(() => { setDraft(deal) }, [deal])

  const set = <K extends keyof Deal>(key: K, value: Deal[K]) => setDraft(d => ({ ...d, [key]: value }))
  const save = <K extends keyof Deal>(key: K) => { if (draft[key] !== deal[key]) onPatch({ [key]: draft[key] } as Partial<Deal>) }

  function submitActivity() {
    const text = composer.trim()
    if (!text) return
    onAddActivity(composerType, text)
    setComposer('')
  }

  function toggleTag(tag: string) {
    const tags = new Set(deal.tags ?? [])
    if (tags.has(tag)) tags.delete(tag); else tags.add(tag)
    onPatch({ tags: [...tags] })
  }

  const field = (label: string, key: keyof Deal, opts?: { type?: string; placeholder?: string; area?: boolean }) => (
    <div className="os-crm-field">
      <label>{label}</label>
      {opts?.area ? (
        <textarea className="os-crm-textarea" placeholder={opts?.placeholder} value={(draft[key] as string) ?? ''}
          onChange={e => set(key, e.target.value as Deal[typeof key])} onBlur={() => save(key)} />
      ) : (
        <input className="os-crm-input" type={opts?.type ?? 'text'} placeholder={opts?.placeholder}
          value={(draft[key] as string | number) ?? ''}
          onChange={e => set(key, (opts?.type === 'number' ? Number(e.target.value) : e.target.value) as Deal[typeof key])}
          onBlur={() => save(key)} />
      )}
    </div>
  )

  const profile = (
    <>
      <div className="os-crm-section">
        <div className="os-crm-section-title">Segments</div>
        <div className="os-crm-tags">
          {PRESET_TAGS.map(t => (
            <button key={t} className={`os-tag-chip${(deal.tags ?? []).includes(t) ? ' active' : ''}`} onClick={() => toggleTag(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="os-crm-section">
        <div className="os-crm-section-title">Contact</div>
        {field('Email', 'clientEmail', { type: 'email', placeholder: 'name@company.com' })}
        {field('Phone', 'clientPhone', { type: 'tel', placeholder: '+297 ...' })}
        {field('Company', 'clientCompany', { placeholder: 'Company name' })}
        {field('Role', 'clientRole', { placeholder: 'Owner, Marketing Lead...' })}
        {field('Website', 'clientWebsite', { placeholder: 'https://...' })}
        {field('Instagram', 'instagram', { placeholder: '@handle' })}
        {field('Location', 'location', { placeholder: 'City, country' })}
      </div>

      <div className="os-crm-section">
        <div className="os-crm-section-title">Deal</div>
        <div className="os-crm-row">
          <div style={{ flex: 1 }}>{field('Value (USD)', 'value', { type: 'number' })}</div>
          <div className="os-crm-field" style={{ flex: 1 }}>
            <label>Revenue type</label>
            <select className="os-crm-input" value={draft.revenueType ?? 'one_time'}
              onChange={e => { set('revenueType', e.target.value as Deal['revenueType']); onPatch({ revenueType: e.target.value as Deal['revenueType'] }) }}>
              <option value="one_time">One-time</option>
              <option value="mrr">Monthly retainer</option>
            </select>
          </div>
        </div>
        <div className="os-crm-row">
          <div style={{ flex: 2 }}>{field('Service', 'service', { placeholder: 'Website + Growth Program' })}</div>
          {draft.revenueType === 'mrr' && <div style={{ flex: 1 }}>{field('Months', 'retainerMonths', { type: 'number' })}</div>}
        </div>
        <div className="os-crm-row">
          <div style={{ flex: 2 }}>{field('Next step', 'nextStep', { placeholder: 'Send proposal, follow up...' })}</div>
          <div style={{ flex: 1 }}>{field('By', 'nextStepDate', { type: 'date' })}</div>
        </div>
        <div className="os-crm-row">
          <div style={{ flex: 1 }}>{field('Expected close', 'closeDate', { type: 'date' })}</div>
          <div style={{ flex: 1 }}>{field('Budget', 'budget', { placeholder: 'Approx budget' })}</div>
        </div>
      </div>

      <div className="os-crm-section">
        <div className="os-crm-section-title">Transformation</div>
        {field('Current state', 'currentState', { area: true, placeholder: 'Where are they now? Pain points, what is not working...' })}
        {field('Desired outcome', 'desiredOutcome', { area: true, placeholder: 'What does success look like for them?' })}
        {field('Goals', 'goals', { area: true, placeholder: 'Concrete goals / targets' })}
        {field('Blockers', 'blockers', { area: true, placeholder: 'Risks, objections, what could stall this' })}
        {field('General notes', 'notes', { area: true, placeholder: 'Anything else worth remembering' })}
      </div>
    </>
  )

  const timeline = (
    <div>
      <div className="os-crm-section-title">Activity timeline</div>
      <div className="os-composer">
        <div className="os-composer-types">
          {(['note', 'call', 'whatsapp', 'email', 'meeting'] as ActivityType[]).map(t => (
            <button key={t} type="button" className={`os-composer-type${composerType === t ? ' active' : ''}`} onClick={() => setComposerType(t)}>
              <i className={`ti ${ACTIVITY_ICON[t]}`} style={{ fontSize: 11, marginRight: 4 }} />{t}
            </button>
          ))}
        </div>
        <textarea className="os-crm-textarea" placeholder="Log a note, call, or meeting... (⌘+Enter)" value={composer}
          onChange={e => setComposer(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submitActivity() } }} />
        <button className="os-btn os-btn-primary os-btn-sm" onClick={submitActivity} style={{ alignSelf: 'flex-start' }}>
          <i className="ti ti-plus" /> Log {composerType}
        </button>
      </div>
      <div className="os-timeline">
        {(deal.activity ?? []).length === 0 && (
          <div style={{ color: 'var(--os-text-muted)', fontSize: 13, padding: '12px 0' }}>No activity yet. Log your first note above.</div>
        )}
        {(deal.activity ?? []).map(a => (
          <div key={a.id} className="os-timeline-item">
            <div className="os-timeline-dot"><i className={`ti ${ACTIVITY_ICON[a.type]}`} /></div>
            <div>
              <div className="os-timeline-text">{a.text}</div>
              <div className="os-timeline-ts">{a.type} · {fmtTs(a.ts)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (layout === 'page') {
    return (
      <div className="os-crm-page-grid">
        <div>{profile}</div>
        <div>{timeline}</div>
      </div>
    )
  }
  return <>{profile}{timeline}</>
}
