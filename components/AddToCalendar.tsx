'use client'

import { useState } from 'react'
import type { BosEvent } from '@/lib/event-types'
import { googleCalUrl, icalString } from '@/lib/calendar-links'

export function AddToCalendar({ event }: { event: BosEvent }) {
  const [open, setOpen] = useState(false)
  if (!event.date) return null

  const gcal = googleCalUrl(event)

  function downloadIcal() {
    const blob = new Blob([icalString(event)], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event.slug}.ics`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const btnBase: React.CSSProperties = { width: '100%', padding: '11px 14px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, background: '#fff', color: '#1a1208', fontFamily: "'Manrope', sans-serif" }

  return (
    <div style={{ position: 'relative', zIndex: open ? 200 : 'auto' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '12px 14px', background: '#fff', border: '1px solid rgba(34,27,61,.14)', borderRadius: 10, color: '#6b5c42', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: "'Manrope', sans-serif", boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
        <i className="ti ti-calendar-plus" style={{ color: '#bd7f06' }} /> Add to Calendar
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#15101F', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, overflow: 'hidden', zIndex: 200, boxShadow: '0 18px 44px rgba(0,0,0,.6)' }}>
          <a href={gcal} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ ...btnBase, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#faf7f1')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
            <i className="ti ti-brand-google" style={{ color: '#16a34a' }} /> Google Calendar
          </a>
          <button onClick={downloadIcal} style={btnBase}
            onMouseEnter={e => (e.currentTarget.style.background = '#faf7f1')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
            <i className="ti ti-calendar" style={{ color: '#7c3aed' }} /> Apple / Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  )
}
