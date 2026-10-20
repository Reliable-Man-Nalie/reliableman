'use client'

import { useEffect, useState } from 'react'
import { getCompanyGoal, setCompanyGoal, pullCompanyGoal, daysLeft, type CompanyGoal } from '@/lib/company-goal'

export default function CompanyGoalBar() {
  const [goal, setGoal] = useState<CompanyGoal | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {

    let live = true
    const id = window.requestAnimationFrame(() => { setGoal(getCompanyGoal()); setLoaded(true) })

    void pullCompanyGoal().then(g => { if (live && g !== undefined) setGoal(g) })
    return () => { live = false; window.cancelAnimationFrame(id) }
  }, [])

  if (!loaded) return null

  function save() {
    const next = setCompanyGoal(draft)
    if (next) { setGoal(next); setEditing(false); setDraft('') }
  }

  const left = goal ? daysLeft(goal.dueDate) : null

  if (!goal && !editing) {
    return (
      <button
        onClick={() => { setEditing(true); setDraft('') }}
        className="os-card"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '11px 16px', marginBottom: 16, cursor: 'pointer', textAlign: 'left',
          border: '1px dashed var(--os-line-strong)', background: 'transparent',
        }}
      >
        <i className="ti ti-target-arrow" style={{ color: 'var(--os-accent)', fontSize: 17 }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--os-text)' }}>Set your own 90-day goal</span>
        <span style={{ fontSize: 12.5, color: 'var(--os-text-faint)' }}>
          The one your clients are asked for. Run the business the way you teach it.
        </span>
      </button>
    )
  }

  if (editing) {
    return (
      <div className="os-card" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '11px 14px', marginBottom: 16, flexWrap: 'wrap' }}>
        <i className="ti ti-target-arrow" style={{ color: 'var(--os-accent)', fontSize: 17 }} />
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="In 90 days my business has…"
          style={{ flex: '1 1 260px', minWidth: 0, border: '1px solid var(--os-line)', background: 'var(--os-card-alt)', color: 'var(--os-text)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, outline: 'none' }}
        />
        <button onClick={save} disabled={!draft.trim()} className="os-btn os-btn-primary os-btn-sm">Set it</button>
        <button onClick={() => setEditing(false)} className="os-btn os-btn-sm">Cancel</button>
      </div>
    )
  }

  return (
    <div
      className="os-card"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 16, flexWrap: 'wrap' }}
    >
      <i className="ti ti-target-arrow" style={{ color: 'var(--os-accent)', fontSize: 17, flexShrink: 0 }} />
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--os-text-faint)', flexShrink: 0 }}>
        90 days
      </span>
      <span style={{ flex: 1, minWidth: 180, fontSize: 13.5, fontWeight: 700, color: 'var(--os-text)' }}>{goal!.title}</span>
      {left !== null && (
        <span
          style={{ fontSize: 12.5, fontWeight: 800, color: left <= 14 ? 'var(--os-warn)' : 'var(--os-text-faint)', flexShrink: 0 }}
          title={`Due ${goal!.dueDate}`}
        >
          {left <= 0 ? 'Time is up' : `${left} left`}
        </span>
      )}
      <button
        onClick={() => { setDraft(goal!.title); setEditing(true) }}
        className="os-btn os-btn-ghost os-btn-sm"
        style={{ flexShrink: 0 }}
      >
        Edit
      </button>
    </div>
  )
}
