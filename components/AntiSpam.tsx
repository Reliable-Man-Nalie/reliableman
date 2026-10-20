'use client'

import { useRef, useState } from 'react'

export interface AntiSpamControl {
  hp: string
  setHp: (v: string) => void

  fields: { hp: string; elapsedMs: number }
}

export function useAntiSpam(): AntiSpamControl {
  const mountedAt = useRef(Date.now())
  const [hp, setHp] = useState('')
  return {
    hp,
    setHp,
    fields: {
      hp,
      get elapsedMs() {
        return Date.now() - mountedAt.current
      },
    },
  }
}

export function Honeypot({ control }: { control: AntiSpamControl }) {
  return (
    <input
      type="text"
      name="hp_vfy_2k"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      value={control.hp}
      onChange={e => control.setHp(e.target.value)}
      style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}
    />
  )
}
