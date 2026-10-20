'use client'

import { useState, type CSSProperties, type MouseEvent } from 'react'
import { copyText } from '@/lib/clipboard'

function writeClipboard(text: string): Promise<void> {
  return copyText(text).then(ok => { if (!ok) throw new Error('copy refused') })
}

export function CopyButton({ value, label = 'Copy e-mail', style }: { value: string; label?: string; style?: CSSProperties }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle')
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {

    e.stopPropagation()
    e.preventDefault()
    writeClipboard(value)
      .then(() => setState('done'))
      .catch(() => setState('fail'))
      .finally(() => setTimeout(() => setState('idle'), 1400))
  }
  const icon = state === 'done' ? 'ti-check' : state === 'fail' ? 'ti-alert-circle' : 'ti-copy'
  return (
    <button
      type="button"
      onClick={onClick}
      title={state === 'done' ? 'Copied' : state === 'fail' ? 'Could not copy' : label}
      aria-label={label}
      className="os-copy-btn"
      data-state={state}
      style={style}
    >
      <i className={`ti ${icon}`} />
    </button>
  )
}

export function EmailText({ email, style, className }: { email?: string | null; style?: CSSProperties; className?: string }) {
  if (!email) return null
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%', ...style }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
      <CopyButton value={email} />
    </span>
  )
}
