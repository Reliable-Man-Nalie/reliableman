'use client'

import { useState } from 'react'
import type { BusinessAccount } from '@/lib/business-accounts'

const field: React.CSSProperties = {
  width: '100%', padding: '9px 10px', border: '1.5px solid var(--os-line)',
  borderRadius: 8, fontSize: 13, color: 'var(--os-text)', outline: 'none',
  background: 'var(--os-card)', fontFamily: 'inherit',
}

const label: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--os-text-faint)',
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5,
}

export type ContactSuggestion = { name: string; email: string }

export function BusinessModal({ account, contacts, onClose, onSave, onDelete }: {
  account?: BusinessAccount
  contacts: ContactSuggestion[]
  onClose: () => void
  onSave: (data: { name: string; clientName: string; clientEmail: string }) => void
  onDelete?: () => void
}) {
  const [form, setForm] = useState({
    name: account?.name ?? '',
    clientName: account?.clientName ?? '',
    clientEmail: account?.clientEmail ?? '',
  })

  const [armed, setArmed] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave({ name: form.name.trim(), clientName: form.clientName.trim(), clientEmail: form.clientEmail.trim().toLowerCase() })
    onClose()
  }

  function pickContact(email: string) {
    const c = contacts.find(x => x.email === email)
    setForm(f => ({ ...f, clientEmail: email, clientName: c?.name || f.clientName }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,0,42,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 440, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--os-text)' }}>{account ? 'Edit Business' : 'New Business'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--os-text-faint)', lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>Business name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Business name" required autoFocus style={{ ...field, fontWeight: 600 }} />
          </div>
          <div>
            <label style={label}>Owner (client)</label>
            <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Jane Doe" list="biz-contact-names" style={field} />
          </div>
          <div>
            <label style={label}>Owner email — links their Member area</label>
            <input
              value={form.clientEmail}
              onChange={e => pickContact(e.target.value)}
              placeholder="jane@example.com" type="email" list="biz-contact-emails" style={field}
            />
            <datalist id="biz-contact-emails">
              {contacts.map(c => <option key={c.email} value={c.email}>{c.name}</option>)}
            </datalist>
            <datalist id="biz-contact-names">
              {contacts.map(c => <option key={c.email} value={c.name} />)}
            </datalist>
            <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)', marginTop: 5 }}>
              The member who logs into Member area with this email sees this business’s open tasks.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {account && onDelete && (
              <button
                type="button"
                onClick={() => { if (armed) { onDelete(); onClose() } else setArmed(true) }}
                style={{ flex: 1, padding: '10px', background: armed ? 'var(--os-bad)' : 'var(--os-bad-soft)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: armed ? '#fff' : 'var(--os-bad)', cursor: 'pointer' }}
              >
                {armed ? 'Press again to delete' : 'Delete'}
              </button>
            )}
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px', background: 'var(--os-line)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--os-text-muted)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" style={{ flex: 2, padding: '10px', background: 'var(--os-accent)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
              {account ? 'Save Changes' : 'Add Business'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function QuickCapture({ accounts, onAdd, allowInternal = true }: {
  accounts: BusinessAccount[]
  onAdd: (title: string, accountId: string | undefined) => void

  allowInternal?: boolean
}) {
  const [title, setTitle] = useState('')
  const [accountId, setAccountId] = useState('')
  const chosen = accountId || (allowInternal ? '' : accounts[0]?.id ?? '')

  function add() {
    const t = title.trim()
    if (!t) return
    if (!allowInternal && !chosen) return
    onAdd(t, chosen || undefined)
    setTitle('')
  }

  return (
    <div className="os-card" style={{ display: 'flex', gap: 8, padding: '10px 12px', marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 15, flexShrink: 0 }} aria-hidden>⚡</span>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        placeholder="On a call? Note a task and press Enter…"
        style={{ ...field, flex: 1, minWidth: 200, border: 'none', background: 'transparent', fontSize: 14, padding: '8px 4px' }}
      />
      <select value={chosen} onChange={e => setAccountId(e.target.value)} style={{ ...field, width: 'auto', maxWidth: 220 }}>
        {allowInternal && <option value="">Internal</option>}
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        {!allowInternal && accounts.length === 0 && <option value="">No clients in the feed yet</option>}
      </select>
      <button onClick={add} className="os-btn os-btn-primary os-btn-sm" style={{ padding: '8px 14px', fontSize: 12.5 }}>
        Add
      </button>
    </div>
  )
}
