'use client'

import { useState } from 'react'
import { BRAND } from '@/lib/brand'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'signing' | 'denied' | 'throttled' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || status === 'signing') return
    setStatus('signing')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        const j = await res.json().catch(() => ({}))
        window.location.href = j.redirect || '/os'
        return
      }
      setStatus(res.status === 429 ? 'throttled' : res.status === 401 ? 'denied' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--os-panel-deep, #0f0f17)', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <form onSubmit={submit} style={{ background: 'var(--os-card, #fff)', borderRadius: 20, padding: '40px 36px', width: 380, maxWidth: '100%', textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.4)' }}>
        <img src={BRAND.logo} alt="" width={52} height={52} style={{ display: 'block', margin: '0 auto 18px', borderRadius: 13, objectFit: 'contain' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--os-text, #111)', margin: '0 0 6px' }}>{BRAND.name}</h1>
        <p style={{ fontSize: 14, color: 'var(--os-text-faint, #666)', margin: '0 0 26px' }}>Dashboard sign in</p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Passphrase"
          autoComplete="current-password"
          autoFocus
          style={{ width: '100%', padding: '13px 15px', borderRadius: 11, border: '1.5px solid var(--os-line, #ddd)', background: 'var(--os-input, #fff)', color: 'var(--os-text, #111)', caretColor: 'var(--os-accent, #7c3aed)', fontSize: 16, marginBottom: 12 }}
        />
        <button
          type="submit"
          disabled={!password || status === 'signing'}
          style={{ width: '100%', padding: '13px 15px', borderRadius: 11, border: 'none', background: 'var(--os-accent, #7c3aed)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: !password ? 'default' : 'pointer', opacity: !password || status === 'signing' ? 0.6 : 1 }}
        >
          {status === 'signing' ? 'Signing in…' : 'Sign in'}
        </button>
        {status === 'denied' && <p style={{ fontSize: 13, color: 'var(--os-bad, #dc2626)', marginTop: 18 }}>That passphrase is not right.</p>}
        {status === 'throttled' && <p style={{ fontSize: 13, color: 'var(--os-bad, #dc2626)', marginTop: 18 }}>Too many attempts. Wait a few minutes and try again.</p>}
        {status === 'error' && <p style={{ fontSize: 13, color: 'var(--os-bad, #dc2626)', marginTop: 18 }}>Something went wrong. Try again.</p>}
      </form>
    </div>
  )
}
