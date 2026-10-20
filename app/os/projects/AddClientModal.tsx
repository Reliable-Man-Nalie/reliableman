'use client'

import { useMemo, useState } from 'react'
import type { BusinessAccount } from '@/lib/business-accounts'

export type Candidate = {
  name: string
  email: string
  company: string

  from: 'client' | 'signed'
  monthly?: number
  currency?: string
}

const FROM_LABEL: Record<Candidate['from'], { label: string; color: string; bg: string }> = {
  client: { label: 'portal', color: 'var(--os-good)',   bg: 'var(--os-good-soft)' },
  signed: { label: 'client', color: 'var(--os-accent)', bg: 'var(--os-chip, rgba(124,58,237,.12))' },
}

export default function AddClientModal({ candidates, accounts, onClose, onAdd }: {
  candidates: Candidate[]
  accounts: BusinessAccount[]
  onClose: () => void
  onAdd: (c: Candidate) => void
}) {
  const [q, setQ] = useState('')

  const inFeedNames = useMemo(
    () => new Set(accounts.filter(a => a.inProjectFeed === true).map(a => a.name.trim().toLowerCase())),
    [accounts],
  )

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return candidates
      .filter(c => !inFeedNames.has((c.company || c.name).trim().toLowerCase()))
      .filter(c => !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.email.toLowerCase().includes(needle) ||
        c.company.toLowerCase().includes(needle))
      .slice(0, 40)
  }, [candidates, q, inFeedNames])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,0,42,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: 16, padding: '24px 24px 20px', width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--os-text)' }}>Add a client to Projects</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--os-text-faint)', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', marginBottom: 14, lineHeight: 1.6 }}>
          Anyone you work with one to one, retainer or one-off project. They do not need a portal.
        </div>

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search name, company or email…"
          autoFocus
          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--os-line)', borderRadius: 9, fontSize: 14, color: 'var(--os-text)', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', outline: 'none', marginBottom: 12 }}
        />

        <div style={{ overflowY: 'auto', flex: 1, margin: '0 -6px', padding: '0 6px' }}>
          {shown.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--os-text-faint)', padding: '18px 2px' }}>
              {q ? 'Nobody matches that.' : 'Everyone you know is already in Projects.'}
            </div>
          ) : shown.map(c => {
            const badge = FROM_LABEL[c.from]
            return (
              <button
                key={`${c.email}|${c.company}`}
                onClick={() => { onAdd(c); onClose() }}
                className="os-action-row"
                style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 10px', margin: '0 -10px', borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer', borderTop: '1px solid var(--os-line)' }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.company || c.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--os-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.company ? `${c.name} · ` : ''}{c.email || 'no email'}
                    {c.monthly ? ` · ${c.currency ?? ''}${c.monthly}/mo` : ''}
                  </span>
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', borderRadius: 999, padding: '2px 8px', flexShrink: 0, background: badge.bg, color: badge.color }}>
                  {badge.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
