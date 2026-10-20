'use client'

import { useState, useEffect, useCallback } from 'react'
import { getLeads, hydrateFromSupabase } from '@/lib/crm-store'
import type { Lead } from '@/lib/crm-types'
import { FORM_REGISTRY, matchFormId, type FormDef } from '@/lib/forms-directory'
import { EmailText } from '@/components/os/CopyEmail'

const NOTES_KEY = 'bos_form_notes'
function loadNotes(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}') } catch { return {} }
}
function saveNotes(n: Record<string, string>) {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(n)) } catch { /* ignore */ }
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / 86400000)
  if (ms < 3600000) return `${Math.max(1, Math.floor(ms / 60000))}m ago`
  if (d === 0) return `${Math.floor(ms / 3600000)}h ago`
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}
function withinDays(iso: string, days: number) {
  return Date.now() - new Date(iso).getTime() <= days * 86400000
}

interface FormStat {
  form: FormDef | null      // null = unrecognized source bucket
  key: string               // form id, or the raw source string for unknowns
  label: string
  url: string
  submissions: Lead[]       // newest first
  total: number
  last7: number
  last24h: number
}

export default function FormsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    await hydrateFromSupabase()
    setLeads(getLeads())
  }, [])

  useEffect(() => {
    reload()
    setNotes(loadNotes())
    window.addEventListener('bos:hydrated', reload)
    return () => window.removeEventListener('bos:hydrated', reload)
  }, [reload])

  const byForm = new Map<string, Lead[]>()
  const unknown = new Map<string, Lead[]>()
  for (const l of leads) {
    const id = matchFormId(l.source)
    if (id) {
      const arr = byForm.get(id) ?? []; arr.push(l); byForm.set(id, arr)
    } else {
      const raw = (l.source || 'unknown').trim().toLowerCase()
      const arr = unknown.get(raw) ?? []; arr.push(l); unknown.set(raw, arr)
    }
  }

  const build = (form: FormDef | null, key: string, label: string, url: string, subs: Lead[]): FormStat => {
    const submissions = [...subs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return {
      form, key, label, url, submissions,
      total: submissions.length,
      last7: submissions.filter(s => withinDays(s.createdAt, 7)).length,
      last24h: submissions.filter(s => withinDays(s.createdAt, 1)).length,
    }
  }

  const formStats: FormStat[] = FORM_REGISTRY
    .map(f => build(f, f.id, f.name, f.url, byForm.get(f.id) ?? []))
    .sort((a, b) => b.total - a.total)
  const unknownStats: FormStat[] = Array.from(unknown.entries())
    .map(([raw, subs]) => build(null, raw, raw, '', subs))
    .sort((a, b) => b.total - a.total)

  const totalTracked = leads.length
  const activeForms = formStats.filter(s => s.total > 0).length

  function setNote(key: string, text: string) {
    setNotes(prev => { const n = { ...prev, [key]: text }; saveNotes(n); return n })
  }
  function toggle(key: string) {
    setExpanded(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function StatCard({ s, isUnknown }: { s: FormStat; isUnknown?: boolean }) {
    const open = expanded.has(s.key)
    const spike = s.last24h >= 5
    const last = s.submissions[0]
    return (
      <div className="os-card" style={{ padding: 0, overflow: 'hidden', border: isUnknown ? '1px solid #fca5a5' : undefined }}>
        <div style={{ padding: '16px 18px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--os-text)' }}>{isUnknown ? `Unrecognized: “${s.label}”` : s.label}</span>
              {spike && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--os-bad)', background: 'var(--os-bad-soft)', border: '1px solid #fca5a5', borderRadius: 100, padding: '2px 8px' }}>⚠ {s.last24h} in 24h</span>}
              {isUnknown && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--os-warn)', background: 'var(--os-warn-soft)', border: '1px solid var(--os-warn-soft)', borderRadius: 100, padding: '2px 8px' }}>possible spam / unregistered</span>}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', marginTop: 4 }}>
              {isUnknown ? (
                <>Source value <code style={{ background: 'var(--os-line)', padding: '1px 6px', borderRadius: 5 }}>{s.label}</code> is not mapped to a known form.</>
              ) : s.form?.purpose}
            </div>
            {!isUnknown && s.url && (
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--os-accent)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <i className="ti ti-external-link" style={{ fontSize: 13 }} /> Used on {s.url}
              </a>
            )}
            {!isUnknown && !s.url && <div style={{ fontSize: 12, color: 'var(--os-text-faint)', marginTop: 6 }}>Not a public web form</div>}
          </div>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--os-text)' }}>{s.total}</div>
              <div style={{ fontSize: 10.5, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>total</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.last7 ? 'var(--os-accent)' : 'var(--os-text-faint)' }}>{s.last7}</div>
              <div style={{ fontSize: 10.5, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>7 days</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 64 }}>
              <div style={{ fontSize: 12, color: 'var(--os-text-faint)', fontWeight: 600 }}>{last ? timeAgo(last.createdAt) : '—'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>last</div>
            </div>
            <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => toggle(s.key)} disabled={!s.total}>
              <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} /> {s.total ? `${Math.min(s.total, 10)} recent` : 'none'}
            </button>
          </div>
        </div>

        {open && (
          <div style={{ borderTop: '1px solid #f0ecfa', padding: '14px 18px', background: 'var(--os-card-alt)' }}>
            <input
              className="os-input"
              placeholder="Add a note about this form (where it links, known issues, spam status)..."
              value={notes[s.key] ?? ''}
              onChange={e => setNote(s.key, e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Recent submissions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.submissions.slice(0, 10).map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: 'var(--os-text-muted)', padding: '4px 0' }}>
                  <span style={{ fontWeight: 600, color: 'var(--os-text)', minWidth: 140 }}>{l.name || '—'}</span>
                  <span style={{ color: 'var(--os-text-faint)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><EmailText email={l.email} />{l.phone ? ` · ${l.phone}` : ''}</span>
                  <span style={{ color: 'var(--os-text-faint)', whiteSpace: 'nowrap' }}>{timeAgo(l.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Forms</div>
          <div className="os-page-sub">{activeForms} active forms · {totalTracked} submissions tracked</div>
        </div>
      </div>

      <p style={{ fontSize: 13.5, color: 'var(--os-text-faint)', margin: '0 0 18px', maxWidth: 720 }}>
        Every lead-capture form on the site, with live submission counts. Watch the 24h spike flags and the
        Unrecognized section to spot spam or a new form that is not yet registered.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {formStats.filter(s => Boolean(s.url)).map(s => <StatCard key={s.key} s={s} />)}
      </div>

      {unknownStats.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--os-warn)', margin: '26px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-alert-triangle" /> Unrecognized sources ({unknownStats.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {unknownStats.map(s => <StatCard key={s.key} s={s} isUnknown />)}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--os-text-faint)', marginTop: 12 }}>
            To map one of these to a form, add its source value to <code>lib/forms-directory.ts</code>.
          </p>
        </>
      )}
    </>
  )
}
