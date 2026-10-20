'use client'

import { useEffect, useState } from 'react'

export type ConfirmOptions = {
  message: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string

  destructive?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let open: ((p: Pending) => void) | null = null

export function confirmAction(opts: string | ConfirmOptions): Promise<boolean> {
  const o = typeof opts === 'string' ? { message: opts } : opts

  if (!open) return Promise.resolve(false)
  return new Promise<boolean>(resolve => open!({ ...o, resolve }))
}

export default function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    open = p => setPending(p)
    return () => { open = null }
  }, [])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { pending.resolve(false); setPending(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  if (!pending) return null

  const answer = (ok: boolean) => { pending.resolve(ok); setPending(null) }
  const destructive = pending.destructive !== false

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,0,42,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => answer(false)} />
      <div style={{ position: 'relative', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: 16, padding: '24px 26px 20px', width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--os-text)', marginBottom: pending.detail ? 6 : 18, lineHeight: 1.4 }}>
          {pending.message}
        </div>
        {pending.detail && (
          <div style={{ fontSize: 13, color: 'var(--os-text-faint)', marginBottom: 18, lineHeight: 1.6 }}>{pending.detail}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => answer(false)}
            autoFocus
            style={{ flex: 1, padding: '10px', background: 'var(--os-line)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--os-text-muted)', cursor: 'pointer' }}
          >
            {pending.cancelLabel ?? 'Cancel'}
          </button>
          <button
            onClick={() => answer(true)}
            style={{
              flex: 1, padding: '10px', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer',
              background: destructive ? 'var(--os-bad)' : 'var(--os-accent)',
            }}
          >
            {pending.confirmLabel ?? (destructive ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
