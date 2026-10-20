'use client'

import { useState, useRef, useEffect } from 'react'
import { COUNTRY_CODES, DEFAULT_COUNTRY_ISO, countryFromIso, countryFromTimeZone, type CountryCode } from '@/lib/country-codes'

interface PhoneInputProps {

  value: string
  onChange: (fullNumber: string) => void
  inputStyle: React.CSSProperties
}

const DEFAULT_COUNTRY = COUNTRY_CODES.find(c => c.iso === DEFAULT_COUNTRY_ISO) ?? COUNTRY_CODES[0]

export function PhoneInput({ value, onChange, inputStyle }: PhoneInputProps) {
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  const [local, setLocal] = useState('')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const pickedRef = useRef(false)
  const localRef = useRef('')

  useEffect(() => {
    if (value) return // an existing number already decided the country
    const zone = countryFromTimeZone()
    if (zone && !pickedRef.current) setCountry(zone)
    let cancelled = false
    fetch('/api/geo')
      .then(r => (r.ok ? r.json() : null))
      .then((d: { country?: string | null } | null) => {

        if (cancelled || pickedRef.current || localRef.current) return
        const c = countryFromIso(d?.country)
        if (c) setCountry(c)
      })
      .catch(() => { /* a guess that fails is just the default */ })
    return () => { cancelled = true }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function emit(next: { country?: CountryCode; local?: string }) {
    const c = next.country ?? country
    const l = next.local ?? local
    onChange(l.trim() ? `${c.dial} ${l.trim()}` : '')
  }

  function pickCountry(c: CountryCode) {
    pickedRef.current = true
    setCountry(c)
    setOpen(false)
    setQuery('')
    emit({ country: c })
  }

  function handleLocal(e: React.ChangeEvent<HTMLInputElement>) {

    const cleaned = e.target.value.replace(/[^\d\s\-()]/g, '')
    localRef.current = cleaned
    setLocal(cleaned)
    emit({ local: cleaned })
  }

  const filtered = query.trim()
    ? COUNTRY_CODES.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.dial.includes(query.replace(/[^\d+]/g, '')),
      )
    : COUNTRY_CODES

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', gap: 8 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Select country code"
        style={{
          ...inputStyle,
          width: 'auto',
          minWidth: 96,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          flexShrink: 0,
          paddingLeft: 12,
          paddingRight: 10,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{country.flag}</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{country.dial}</span>
        <i className="ti ti-chevron-down" style={{ fontSize: 13, opacity: 0.6, marginLeft: 'auto' }} />
      </button>

      <input
        type="tel"
        inputMode="tel"
        value={local}
        onChange={handleLocal}
        placeholder="560 1234"
        aria-label="Phone number"
        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
      />

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            zIndex: 60,
            width: 280,
            maxHeight: 280,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid rgba(34,27,61,.12)',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(60,40,20,.16)',
            padding: 8,
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search country…"
            style={{
              width: '100%',
              padding: '9px 12px',
              marginBottom: 6,
              border: '1px solid rgba(34,27,61,.14)',
              borderRadius: 8,
              background: '#faf7f1',
              color: '#1a1208',

              fontSize: 16,
              outline: 'none',
              fontFamily: "'Manrope', sans-serif",
            }}
          />
          {filtered.length === 0 ? (
            <div style={{ padding: '12px', fontSize: 13, color: '#9a845c', textAlign: 'center' }}>No match</div>
          ) : (
            filtered.map(c => (
              <button
                key={c.iso}
                type="button"
                onClick={() => pickCountry(c)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  background: c.iso === country.iso ? 'rgba(189,127,6,.12)' : 'none',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: '#1a1208',
                  fontSize: 13,
                  fontFamily: "'Manrope', sans-serif",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#faf7f1')}
                onMouseLeave={e => (e.currentTarget.style.background = c.iso === country.iso ? 'rgba(189,127,6,.12)' : 'none')}
              >
                <span style={{ fontSize: 17, lineHeight: 1 }}>{c.flag}</span>
                <span style={{ flex: 1 }}>{c.name}</span>
                <span style={{ color: '#9a845c', fontWeight: 600 }}>{c.dial}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
