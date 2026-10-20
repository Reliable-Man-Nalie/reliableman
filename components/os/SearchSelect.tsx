'use client'
import { useEffect, useId, useRef, useState } from 'react'

export type SearchItem = { id: string; label: string; sub?: string; badge?: string }

type Props = {
  value: string
  items: SearchItem[]
  onChange: (id: string) => void
  placeholder?: string

  emptyLabel?: string
  style?: React.CSSProperties
  autoFocus?: boolean
}

export function SearchSelect({ value, items, onChange, placeholder = 'Search…', emptyLabel, style, autoFocus }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const listId = useId()

  const chosen = items.find(i => i.id === value)
  const needle = q.trim().toLowerCase()
  const shown = (needle
    ? items.filter(i => `${i.label} ${i.sub ?? ''} ${i.badge ?? ''}`.toLowerCase().includes(needle))
    : items
  ).slice(0, 60)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [open])

  const pick = (id: string) => { onChange(id); setQ(''); setOpen(false) }

  return (
    <div ref={wrap} style={{ position: 'relative', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          value={open ? q : (chosen ? chosen.label : '')}
          placeholder={chosen ? chosen.label : (emptyLabel ?? placeholder)}
          onFocus={() => { setOpen(true); setHi(0) }}
          onChange={e => { setQ(e.target.value); setOpen(true); setHi(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, shown.length - 1 + (emptyLabel ? 1 : 0))) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
            else if (e.key === 'Enter') {
              e.preventDefault()
              const idx = emptyLabel ? hi - 1 : hi
              if (emptyLabel && hi === 0) pick('')
              else if (shown[idx]) pick(shown[idx].id)
            }
            else if (e.key === 'Escape') { setOpen(false); setQ('') }
          }}
          style={{
            flex: 1, minWidth: 0, width: '100%', padding: '9px 10px', border: '1.5px solid var(--os-line)', borderRadius: 8,
            fontSize: 13, color: 'var(--os-text)', outline: 'none', background: 'var(--os-card)',
          }}
        />
        {value && (
          <button type="button" aria-label="Clear" onClick={() => pick('')}
            style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--os-text-faint)', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>×</button>
        )}
      </div>

      {open && (
        <ul
          id={listId} role="listbox"
          style={{
            position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 60,
            margin: 0, padding: 4, listStyle: 'none', maxHeight: 260, overflowY: 'auto',
            background: 'var(--os-base-2, #fff)', backgroundImage: 'var(--os-card-image, none)',
            border: '1px solid var(--os-line)', borderRadius: 10, boxShadow: '0 18px 44px -14px rgba(0,0,0,.35)',
          }}
        >
          {emptyLabel && (
            <li role="option" aria-selected={value === ''} onMouseDown={e => { e.preventDefault(); pick('') }}
              style={{ padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--os-text-muted)', background: hi === 0 ? 'var(--os-chip)' : 'transparent' }}>
              {emptyLabel}
            </li>
          )}
          {shown.map((i, n) => {
            const idx = emptyLabel ? n + 1 : n
            return (
              <li key={i.id} role="option" aria-selected={i.id === value}
                onMouseDown={e => { e.preventDefault(); pick(i.id) }}
                onMouseEnter={() => setHi(idx)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: hi === idx ? 'var(--os-chip)' : 'transparent' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: i.id === value ? 800 : 600, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
                  {i.sub && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--os-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.sub}</span>}
                </span>
                {i.badge && <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3, color: 'var(--os-text-faint)', flexShrink: 0 }}>{i.badge}</span>}
              </li>
            )
          })}
          {shown.length === 0 && <li style={{ padding: '10px', fontSize: 12.5, color: 'var(--os-text-faint)' }}>No match.</li>}
        </ul>
      )}
    </div>
  )
}
