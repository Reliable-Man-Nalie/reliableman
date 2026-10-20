'use client'

import { useId, useRef } from 'react'

export function todayLocalISO(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function spellDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ''
  const [, y, mo, da] = m

  const d = new Date(Number(y), Number(mo) - 1, Number(da), 12)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function nextMondayISO(): string {
  const d = new Date()
  const ahead = ((8 - d.getDay()) % 7) || 7
  return todayLocalISO(ahead)
}

export function DateField({
  value, onChange, max, min, label, hint, quick: quickProp, clearable = false, compact = false,
}: {
  value: string
  onChange: (iso: string) => void
  max?: string
  min?: string
  label?: string
  hint?: string

  quick?: { iso: string; label: string }[]

  clearable?: boolean

  compact?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const id = useId()

  const today = todayLocalISO()
  const yesterday = todayLocalISO(-1)
  const tomorrow = todayLocalISO(1)
  const allowed = (iso: string) => (!max || iso <= max) && (!min || iso >= min)

  const quick = (quickProp ?? [
    { iso: today, label: 'Today' },
    { iso: yesterday, label: 'Yesterday' },
  ]).filter(q => allowed(q.iso))

  function openPicker() {
    const el = ref.current
    if (!el) return
    try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.() } catch { /* not supported */ }
  }

  const spelled = spellDate(value)

  return (
    <div className={`os-datefield${compact ? ' is-compact' : ''}`}>
      {label ? <label className="os-label" htmlFor={id}>{label}</label> : null}

      <div className="os-datefield-row">
        <input
          ref={ref}
          id={id}
          className="os-input os-datefield-input"
          type="date"
          value={value}
          max={max}
          min={min}
          onChange={e => onChange(e.target.value)}
          onClick={openPicker}
        />
        <div className="os-datefield-quick">
          {quick.map(q => (
            <button
              key={q.iso}
              type="button"
              className={`os-datefield-chip${value === q.iso ? ' is-on' : ''}`}
              aria-pressed={value === q.iso}
              onClick={() => onChange(q.iso)}
            >
              {q.label}
            </button>
          ))}
          {clearable && value && (
            <button type="button" className={`os-datefield-chip${compact ? ' is-clear' : ''}`} onClick={() => onChange('')} aria-label="Clear the date" title="Clear the date">
              {compact ? '×' : 'No date'}
            </button>
          )}
        </div>
      </div>

      <p className="os-datefield-said" aria-live="polite">
        {spelled
          ? <>{spelled}{value === today ? ' · today' : value === yesterday ? ' · yesterday' : value === tomorrow ? ' · tomorrow' : ''}</>
          : clearable ? 'No date set' : 'Pick a date'}
      </p>

      {hint ? <p className="os-datefield-hint">{hint}</p> : null}
    </div>
  )
}
