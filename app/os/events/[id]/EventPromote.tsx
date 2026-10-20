'use client'

import { useMemo, useState } from 'react'
import type { BosEvent } from '@/lib/event-types'
import { BRAND } from '@/lib/brand'
import { copyText as copyToClipboard } from '@/lib/clipboard'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return 'soon'
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export default function EventPromote({ event }: { event: BosEvent }) {
  const url = `${BRAND.website.replace(/\/+$/, '')}/events/${event.slug}`
  const price = Number(event.price) || 0
  const sym = event.currency === 'EUR' ? '€' : '$'
  const priceLine = price > 0 ? ` ${sym}${price % 1 === 0 ? price : price.toFixed(2)}, places are limited.` : ' Places are limited.'
  const [copied, setCopied] = useState('')

  const texts = useMemo(() => {
    const when = dateLabel(event.date) + (event.time ? ` at ${event.time}` : '')
    const tagline = event.tagline ? ` ${event.tagline.replace(/[–—]/g, ',').trim()}` : ''
    return [
      { key: 'wa', label: 'WhatsApp message', text: `${when}: ${event.title}.${tagline}${priceLine}\n\nSave your place here: ${url}` },
      { key: 'post', label: 'Post caption', text: `Coming up: ${event.title}.${tagline}\n\n${when}.${priceLine}\n\nRegister through the link: ${url}` },
      { key: 'personal', label: 'Personal note to a friend', text: `Hey! I am running ${event.title} on ${when} and thought of you. Here is the link if it is useful: ${url}` },
    ]
  }, [event.date, event.time, event.title, event.tagline, priceLine, url])

  function copy(key: string, text: string) {
    void copyToClipboard(text)
    setCopied(key)
    setTimeout(() => setCopied(c => (c === key ? '' : c)), 1600)
  }

  const enc = encodeURIComponent
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
      <div className="os-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--os-text-muted)', marginBottom: 8 }}>Event link</div>
        <div style={{ fontFamily: 'monospace', fontSize: 14, wordBreak: 'break-all', marginBottom: 12 }}>{url}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="os-btn" onClick={() => copy('link', url)}>{copied === 'link' ? 'Copied' : 'Copy link'}</button>
          <a className="os-btn" href={`https://wa.me/?text=${enc(url)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="os-btn" href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`} target="_blank" rel="noreferrer">Facebook</a>
          <a className="os-btn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`} target="_blank" rel="noreferrer">LinkedIn</a>
        </div>
      </div>
      {texts.map(t => (
        <div key={t.key} className="os-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t.label}</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: 'var(--os-text-secondary)', marginBottom: 12 }}>{t.text}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="os-btn" onClick={() => copy(t.key, t.text)}>{copied === t.key ? 'Copied' : 'Copy'}</button>
            <a className="os-btn" href={`https://wa.me/?text=${enc(t.text)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
          </div>
        </div>
      ))}
    </div>
  )
}
