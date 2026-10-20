'use client'

import { useEffect, useState } from 'react'
import { stateMeta, type PersonState } from '@/lib/people'

export function StateChip({ state }: { state: PersonState }) {
  const m = stateMeta(state)
  return <span className="os-state" data-tone={m.tone}>{m.label}</span>
}

export function StateChips({ states, max }: { states: PersonState[]; max?: number }) {
  const shown = max ? states.slice(0, max) : states
  const rest = states.length - shown.length
  return (
    <>
      {shown.map(s => <StateChip key={s} state={s} />)}
      {rest > 0 && (
        <span className="os-state" data-tone="muted" title={states.slice(shown.length).map(s => stateMeta(s).label).join(', ')}>
          +{rest}
        </span>
      )}
    </>
  )
}

export function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

export function avatarBgOf(seed: string) {
  const colors = ['#7b2fff', '#0891b2', '#d97706', '#16a34a', '#db2777', '#9333ea']
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

export function useIsNarrow(query = '(max-width: 768px)'): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return narrow
}
