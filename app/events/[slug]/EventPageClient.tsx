'use client'

import { BRAND } from '@/lib/brand'
import { useState, useEffect } from 'react'
import { openTickets } from '@/lib/event-tickets'
import { useRouter } from 'next/navigation'
import { eventTimeLine, eventTimeRangesLine } from '@/lib/event-time'
import Link from 'next/link'
import type { BosEvent } from '@/lib/event-types'
import { SafeHtml } from '@/components/SafeHtml'
import { PhoneInput } from '@/components/PhoneInput'
import { useAntiSpam, Honeypot } from '@/components/AntiSpam'
import Image from 'next/image'
import { NAVY, PURPLE, PURPLE_HI, PAPER, CREAM, INK, BODY as BODY_INK, MUTED, LINE, GOLD_INK } from '@/lib/theme'
import { copyText } from '@/lib/clipboard'

const REASONS = [
  'Build a website for my own business',
  'Get more clients',
  'Automate my business with AI',
  'Start a business from scratch',
  'Sharpen my brand and message',
  'Learn how to actually use AI',
]

const DISPLAY = "var(--oh-display), 'Poppins', system-ui, sans-serif"
const TEXT = "var(--oh-body), 'Quicksand', system-ui, sans-serif"

function useCountdown(dateStr: string, timeStr: string, timezone: string) {
  const [parts, setParts] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, started: false, expired: false })

  useEffect(() => {
    if (!dateStr) return
    function tick() {
      const now = Date.now()
      const t = timeStr || '00:00'
      const target = new Date(`${dateStr}T${t}:00`).getTime()
      const diff = target - now
      if (diff <= 0) {
        setParts({ days: 0, hours: 0, minutes: 0, seconds: 0, started: true, expired: diff < -3600000 })
        return
      }
      const secs = Math.floor(diff / 1000)
      setParts({
        days: Math.floor(secs / 86400),
        hours: Math.floor((secs % 86400) / 3600),
        minutes: Math.floor((secs % 3600) / 60),
        seconds: secs % 60,
        started: false,
        expired: false,
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [dateStr, timeStr, timezone])

  return parts
}

function CountdownTicker({ date, time, timezone }: { date: string; time: string; timezone: string }) {
  const { days, hours, minutes, seconds, started, expired } = useCountdown(date, time, timezone)
  if (!date) return null
  if (expired) return null

  const unit = (n: number, label: string) => (
    <div style={{ textAlign: 'center', minWidth: 52 }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: INK, lineHeight: 1, fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums' }}>
        {String(n).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 5 }}>{label}</div>
    </div>
  )

  const sep = <div style={{ fontSize: 22, fontWeight: 800, color: MUTED, alignSelf: 'flex-start', marginTop: 3 }}>:</div>

  return (
    <div style={{ background: CREAM, borderRadius: 16, padding: '18px 20px' }}>
      {started ? (
        <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#16a34a' }}>Happening now</div>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, textAlign: 'center', fontFamily: DISPLAY }}>Starts in</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {days > 0 && <>{unit(days, 'days')}{sep}</>}
            {unit(hours, 'hrs')}{sep}
            {unit(minutes, 'min')}{sep}
            {unit(seconds, 'sec')}
          </div>
        </>
      )}
    </div>
  )
}

const FORMAT_LABELS: Record<string, string> = { in_person: 'In person', online: 'Online', hybrid: 'Hybrid' }

function safeUrl(url?: string): string | undefined {
  if (!url) return undefined
  try {
    const p = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(p.protocol) ? url : undefined
  } catch {
    return undefined
  }
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${LINE}`, padding: '16px 0' }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', color: INK, fontSize: 15.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 0, fontFamily: DISPLAY, minHeight: 44 }}>
        {question}
        <span style={{ color: PURPLE, fontSize: 20, flexShrink: 0, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
      </button>
      {open && <div style={{ fontSize: 15, color: BODY_INK, lineHeight: 1.65, marginTop: 10 }}>{answer}</div>}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 25, fontWeight: 800, fontFamily: DISPLAY, color: INK, marginBottom: 18, letterSpacing: '-.01em' }}>{children}</h2>
}

type Props = {
  event: BosEvent

  registrationOpen?: boolean

  seatsTaken?: number
}

type DescBlock = { kind: 'list'; title: string; items: string[] } | { kind: 'p'; text: string }

function parseDescription(text: string): DescBlock[] | null {
  if (/<[a-z][^>]*>/i.test(text)) return null
  return text
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const lines = part.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length > 1 && lines[0].endsWith(':')) {
        return { kind: 'list' as const, title: lines[0].slice(0, -1), items: lines.slice(1) }
      }
      return { kind: 'p' as const, text: lines.join(' ') }
    })
}

function LeadP({ text }: { text: string }) {
  const colon = text.indexOf(':')
  const hasLead = colon > 0 && colon <= 40 && !text.slice(0, colon).includes('.')
  return (
    <p style={{ fontSize: 15.5, lineHeight: 1.65, color: BODY_INK, margin: 0 }}>
      {hasLead ? <><strong style={{ color: INK }}>{text.slice(0, colon + 1)}</strong>{text.slice(colon + 1)}</> : text}
    </p>
  )
}

export default function EventPageClient({ event, registrationOpen = true, seatsTaken = 0 }: Props) {
  const router = useRouter()
  const antiSpam = useAntiSpam()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', notes: '', website: '', instagram: '', businessDoes: '' })

  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null)

  const [reasons, setReasons] = useState<string[]>([])
  const toggleReason = (r: string) =>
    setReasons(rs => rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r])

  const openTiers = openTickets(event.id)
  const [tierId, setTierId] = useState<string>(() => {
    const cheapest = [...openTiers].sort((a, b) => a.price - b.price)[0]
    return cheapest ? cheapest.id : ''
  })
  const selected = openTiers.find(t => t.id === tierId) ?? openTiers[0] ?? null
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const [bringing, setBringing] = useState(false)
  const [guest, setGuest] = useState({ name: '', email: '' })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('Please add your name and email before registering.')
      setStatus('error')
      return
    }
    if (bringing && (!guest.name.trim() || !guest.email.trim())) {
      setError('Please add your plus one\'s name and email, or untick "I am bringing someone".')
      setStatus('error')
      return
    }
    if (bringing && guest.email.trim().toLowerCase() === form.email.trim().toLowerCase()) {
      setError('Your plus one needs their own email, so their joining link reaches them.')
      setStatus('error')
      return
    }
    setStatus('submitting')
    setError('')
    try {
      const res = await fetch('/api/event-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          ...form,

          name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),

          hasBusiness: hasBusiness === true,

          notes: [
            reasons.length ? `Why they are coming: ${reasons.join(', ')}` : '',
            hasBusiness === true ? 'Has a business: yes' : hasBusiness === false ? 'Has a business: not yet, starting out' : '',
            form.businessDoes ? `Business does: ${form.businessDoes}` : '',
            form.website ? `Website: ${form.website}` : '',
            form.instagram ? `Instagram: ${form.instagram}` : '',
            form.notes ? `Their message: ${form.notes}` : '',
          ].filter(Boolean).join('\n'),
          ...(bringing ? { plusOne: { name: guest.name.trim(), email: guest.email.trim() } } : {}),
          ...antiSpam.fields,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Registration failed')
      setStatus('success')
      const ticket = d.ticketCode ? `?t=${encodeURIComponent(d.ticketCode)}` : ''

      if (event.price > 0) {
        try {
          const pay = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventTicket: { eventId: event.id, ticketCode: d.ticketCode ?? '', ticketTierId: tierId }, email: form.email }),
          })
          const payload = await pay.json()
          if (pay.ok && payload.url) {
            window.location.assign(payload.url)
            return
          }
        } catch { /* fall through to the ticket page */ }
      }
      router.push(`/events/${event.slug}/thank-you${ticket}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  const iStyle: React.CSSProperties = { width: '100%', padding: '13px 14px', border: `1.5px solid ${LINE}`, borderRadius: 10, background: PAPER, color: INK, caretColor: PURPLE, fontSize: 16, fontFamily: TEXT, fontWeight: 600, outline: 'none' }
  const lStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 6, fontFamily: DISPLAY }

  const pill: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, padding: '5px 13px', borderRadius: 100,
    background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.92)',
    border: '1px solid rgba(255,255,255,.24)', textTransform: 'uppercase', letterSpacing: .8, fontFamily: DISPLAY,
  }

  return (
    <div className="evt" style={{ background: PAPER, fontFamily: TEXT, fontWeight: 600, color: INK, minHeight: '100vh' }}>

      <div style={{ background: PAPER, borderBottom: `1px solid ${LINE}`, textAlign: 'center', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 60 }}>
        <Image src={BRAND.logo} alt={BRAND.name} width={300} height={75} quality={90} style={{ height: 34, width: 'auto', display: 'inline-block' }} priority />
      </div>

      <section style={{ background: NAVY, color: '#fff', padding: 'clamp(44px, 6vw, 72px) 24px clamp(48px, 6vw, 76px)' }}>
        <div className="evt-hero" style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.25fr .75fr', gap: 'clamp(28px, 5vw, 56px)', alignItems: 'center' }}>
          <div className="evt-hero-copy">
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              <span style={pill}>{FORMAT_LABELS[event.format]}</span>
              {event.price === 0
                ? <span style={{ ...pill, background: 'rgba(34,197,94,.16)', borderColor: 'rgba(34,197,94,.42)', color: '#BBF7D0' }}>Free</span>
                : <span style={pill}>${event.price} {event.currency}</span>}
              <span style={pill}>Live with {BRAND.owner}</span>
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 54px)', fontWeight: 800, fontFamily: DISPLAY, color: '#fff', lineHeight: 1.06, letterSpacing: '-.02em', margin: '0 0 16px', textWrap: 'balance' }}>
              {(() => {
                const accent = ['AI Skill', 'Claude AI'].find(a => event.title.includes(a))
                return accent
                  ? <>{event.title.split(accent)[0]}<span style={{ color: '#C9A6FF' }}>{accent}</span>{event.title.split(accent)[1]}</>
                  : event.title
              })()}
            </h1>
            {event.tagline && <p style={{ fontSize: 'clamp(16.5px, 2vw, 19.5px)', color: 'rgba(255,255,255,.9)', lineHeight: 1.5, margin: 0, maxWidth: '52ch' }}>{event.tagline}</p>}

            <div className="evt-hero-actions" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', margin: '26px 0 0' }}>
              <a href="#register" className="evt-cta">
                {event.price === 0 ? 'Save my free seat' : 'Save my seat'} <span aria-hidden="true">→</span>
              </a>
              <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,.66)' }}>
                Cannot make it live? Register anyway, <br />the replay goes to everyone.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 22, marginTop: 26, flexWrap: 'wrap', fontSize: 14.5, color: 'rgba(255,255,255,.86)' }}>
              {event.date && <span>{fmtDate(event.date)}</span>}
              {event.time && <span>{eventTimeLine(event.date, event.time, event.timezone) || `${event.time}${event.endTime ? ` – ${event.endTime}` : ''}`}</span>}
              {event.location && <span>{event.location}</span>}
            </div>
          </div>

          <div className="evt-hero-photo" style={{ borderRadius: 22, overflow: 'hidden', background: '#2C3557' }}>
            <Image
              src={event.coverImage || event.thumbnailImage || '/event-default.png'}
              alt={event.title}
              width={600}
              height={900}
              sizes="(max-width: 900px) 320px, 380px"
              style={{ width: '100%', height: 'auto', display: 'block' }}
              priority
            />
          </div>
        </div>
      </section>

      <div className="evt-detail-grid" style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 40px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 44, alignItems: 'start' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>

          {event.painPoints && event.painPoints.items.length > 0 && (
            <section>
              <SectionHeading>{event.painPoints.title}</SectionHeading>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {event.painPoints.items.map(item => (
                  <li key={item} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: CREAM, borderRadius: 14, padding: '14px 18px', fontSize: 15.5, lineHeight: 1.5, color: INK }}>
                    <span aria-hidden="true" style={{ color: '#B91C1C', fontWeight: 800, flex: 'none', marginTop: 1 }}>✕</span>{item}
                  </li>
                ))}
              </ul>
              {event.painPoints.turn && (
                <p style={{ fontSize: 17.5, fontWeight: 700, color: INK, lineHeight: 1.5, margin: '18px 0 0', fontFamily: DISPLAY }}>{event.painPoints.turn}</p>
              )}
            </section>
          )}

          {event.team && event.team.length > 0 && (
            <section>
              <SectionHeading>The team you build on Sunday</SectionHeading>
              <div className="evt-team" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, event.team.length)}, 1fr)`, gap: 14 }}>
                {event.team.map((m, i) => (
                  <div key={m.role} style={{ background: i === 0 ? NAVY : CREAM, color: i === 0 ? '#fff' : INK, borderRadius: 20, padding: '22px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: i === 0 ? 'rgba(201,166,255,.18)' : 'rgba(124,58,237,.1)', color: i === 0 ? '#C9A6FF' : PURPLE }}>
                      <i className={`ti ${m.icon || 'ti-robot'}`} />
                    </span>
                    <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, fontFamily: DISPLAY, color: 'inherit' }}>{m.role}</h3>
                    <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0, color: i === 0 ? 'rgba(255,255,255,.86)' : BODY_INK }}>{m.does}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 20 }}>
                <a href="#register" className="evt-cta">{event.price === 0 ? 'Save my free seat' : `Save my seat, $${event.price}`} <span aria-hidden="true">→</span></a>
                {event.priceFrame && <span style={{ fontSize: 14, color: BODY_INK, maxWidth: '40ch', lineHeight: 1.5 }}>{event.priceFrame}</span>}
              </div>
            </section>
          )}

          {event.description && (() => {
            const blocks = parseDescription(event.description)
            return (
              <section>
                <SectionHeading>About this session</SectionHeading>
                {blocks ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {blocks.map((b, i) => b.kind === 'list' ? (
                      <div key={i} style={{ background: CREAM, borderRadius: 20, padding: '20px 24px 22px' }}>
                        <h3 style={{ fontSize: 16.5, fontWeight: 800, color: INK, margin: '0 0 12px', fontFamily: DISPLAY }}>{b.title}</h3>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                          {b.items.map(item => (
                            <li key={item} style={{ display: 'flex', gap: 11, fontSize: 15, lineHeight: 1.55, color: INK }}>
                              <span style={{ color: PURPLE, fontWeight: 800, flex: 'none' }}>✓</span>{item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <LeadP key={i} text={b.text} />
                    ))}
                  </div>
                ) : (
                  <SafeHtml html={event.description} className="evt-rich" style={{ fontSize: 16.5, color: BODY_INK, lineHeight: 1.7 }} />
                )}
              </section>
            )
          })()}

          {event.agenda && event.agenda.length > 0 && (
            <section>
              <SectionHeading>{event.agendaHeading || 'How the session runs'}</SectionHeading>
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'rgba(124,58,237,.22)' }} />
                {event.agenda.map((item) => {
                  const speaker = event.speakers?.find(s => s.id === item.speakerId)
                  return (
                    <div key={item.id} style={{ display: 'flex', gap: 16, marginBottom: 24, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -22, top: 5, width: 10, height: 10, borderRadius: '50%', background: PURPLE, border: `2px solid ${PAPER}`, flexShrink: 0, zIndex: 1 }} />
                      <div style={{ flex: 1 }}>
                        {item.time && <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, letterSpacing: .8, marginBottom: 4, fontFamily: DISPLAY }}>{item.time}</div>}
                        <div style={{ fontSize: 16.5, fontWeight: 800, color: INK, marginBottom: 4, fontFamily: DISPLAY }}>{item.title}</div>
                        {item.description && <div style={{ fontSize: 14.5, color: BODY_INK, lineHeight: 1.6 }}>{item.description}</div>}
                        {speaker && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                            {speaker.photo
                              ? <img src={speaker.photo} alt={speaker.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 20%' }} />
                              : <div style={{ width: 24, height: 24, borderRadius: '50%', background: PURPLE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>{speaker.name.charAt(0)}</div>}
                            <span style={{ fontSize: 12.5, color: MUTED }}>{speaker.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {event.speakers && event.speakers.length > 0 && (
            <section>
              <SectionHeading>{event.speakers.length === 1 ? 'Your host' : 'Speakers'}</SectionHeading>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {event.speakers.map(s => (
                  <div key={s.id} style={{ background: CREAM, borderRadius: 20, padding: '24px 22px', textAlign: 'center' }}>
                    {s.photo ? (
                      <img src={s.photo} alt={s.name} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 20%', marginBottom: 12 }} />
                    ) : (
                      <div style={{ width: 72, height: 72, borderRadius: '50%', background: PURPLE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 auto 12px', fontFamily: DISPLAY }}>
                        {s.name.charAt(0)}
                      </div>
                    )}
                    <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginBottom: 4, fontFamily: DISPLAY }}>{s.name}</div>
                    <div style={{ fontSize: 13, color: PURPLE, fontWeight: 700, marginBottom: 10 }}>{s.title}</div>
                    <div style={{ fontSize: 14, color: BODY_INK, lineHeight: 1.6 }}>{s.bio}</div>
                    {(s.linkedin || s.instagram || s.website) && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 12 }}>
                        {safeUrl(s.linkedin) && <a href={safeUrl(s.linkedin)} target="_blank" rel="noopener noreferrer" style={{ color: PURPLE, textDecoration: 'none', fontSize: 16 }}><i className="ti ti-brand-linkedin" /></a>}
                        {s.instagram && <a href={`https://instagram.com/${s.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: PURPLE, textDecoration: 'none', fontSize: 16 }}><i className="ti ti-brand-instagram" /></a>}
                        {safeUrl(s.website) && <a href={safeUrl(s.website)} target="_blank" rel="noopener noreferrer" style={{ color: PURPLE, textDecoration: 'none', fontSize: 16 }}><i className="ti ti-world" /></a>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {event.faq && event.faq.length > 0 && (
            <section>
              <SectionHeading>Questions people ask</SectionHeading>
              <div style={{ background: CREAM, borderRadius: 20, padding: '6px 22px' }}>
                {event.faq.map(q => <FaqItem key={q.id} question={q.question} answer={q.answer} />)}
              </div>
            </section>
          )}

          <section>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, fontFamily: DISPLAY }}>Share this event</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { icon: 'ti-brand-twitter', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(event.title)}&url=${encodeURIComponent(`${BRAND.website}/events/${event.slug}`)}` },
                { icon: 'ti-brand-linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${BRAND.website}/events/${event.slug}`)}` },
                { icon: 'ti-link', href: '#', onClick: () => { void copyText(`${BRAND.website}/events/${event.slug}`) } },
              ].map(({ icon, href, onClick }) => (
                <a key={icon} href={href} onClick={onClick ? (e) => { e.preventDefault(); onClick() } : undefined} target={href !== '#' ? '_blank' : undefined} rel="noopener noreferrer"
                  style={{ width: 44, height: 44, borderRadius: 10, background: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PURPLE, fontSize: 16, textDecoration: 'none', cursor: 'pointer' }}>
                  <i className={`ti ${icon}`} />
                </a>
              ))}
            </div>
          </section>
        </div>

        <div id="register" className="evt-detail-side" style={{ position: 'sticky', top: 84, scrollMarginTop: 80, display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div style={{ background: CREAM, borderRadius: 20, padding: '20px 22px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 14px', fontFamily: DISPLAY }}>Event details</h3>
            {[
              event.date && { label: 'Date', value: fmtDate(event.date) },
              event.time && { label: 'Time', value: eventTimeRangesLine(event.date, event.time, event.endTime, event.timezone) || `${event.time}${event.endTime ? ` – ${event.endTime}` : ''} (${event.timezone})` },

              event.location && { label: event.format === 'online' ? 'Platform' : 'Location', value: event.location },
              event.capacity > 0 && { label: 'Capacity', value: `${event.capacity} spots` },
            ].filter(Boolean).map((item) => {
              const { label, value } = item as { label: string; value: string }
              return (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: .8, fontFamily: DISPLAY }}>{label}</div>
                  <div style={{ fontSize: 14.5, color: INK, marginTop: 2 }}>{value}</div>
                </div>
              )
            })}
          </div>

          <CountdownTicker date={event.date} time={event.time} timezone={event.timezone} />

          {!registrationOpen ? (

            <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 20, padding: '24px 22px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 10px', fontFamily: DISPLAY }}>Registration opens shortly</h3>
              <p style={{ fontSize: 14.5, color: BODY_INK, lineHeight: 1.6, margin: '0 0 16px' }}>
                Seats for this session are not open for booking on this page yet. Leave your email and you will get the link the moment they are, or reply to me directly and I will hold one for you.
              </p>
              <Link href="/events#notify" style={{ display: 'block', textAlign: 'center', background: PURPLE, border: 'none', borderRadius: 12, padding: '16px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', fontFamily: DISPLAY, boxShadow: '0 12px 30px -10px rgba(124,58,237,.6)' }}>
                Tell me when seats open
              </Link>
              <p style={{ fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 1.5, margin: '12px 0 0' }}>
                Or email <a href={`mailto:${BRAND.email}`} style={{ color: PURPLE, fontWeight: 700 }}>{BRAND.email}</a>
              </p>
            </div>
          ) : status === 'success' ? (
            <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 20, padding: '28px 22px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginBottom: 8, fontFamily: DISPLAY }}>You&apos;re registered!</div>
              <div style={{ fontSize: 14.5, color: BODY_INK, lineHeight: 1.6 }}>Taking you to your confirmation…</div>
            </div>
          ) : (
            <form
              onKeyDown={e => {

                const el = e.target as HTMLElement
                if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') e.preventDefault()
              }}
              onSubmit={submit} style={{ background: PAPER, border: `1.5px solid rgba(124,58,237,.35)`, borderRadius: 20, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 22px 50px -26px rgba(124,58,237,.4)' }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0, fontFamily: DISPLAY }}>
                {event.price === 0 ? 'Save your free seat' : `Register, ${event.currency} $${selected ? selected.price : event.price}`}
              </h3>
              {event.priceFrame && event.price > 0 && (
                <p style={{ fontSize: 13.5, color: BODY_INK, lineHeight: 1.5, margin: '-6px 0 0' }}>{event.priceFrame}</p>
              )}
              <Honeypot control={antiSpam} />
              <div className="os-form-row" style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={lStyle}>First name *</label>
                  <input required type="text" value={form.firstName} onChange={set('firstName')} placeholder="First name" style={iStyle} />
                </div>
                <div>
                  <label style={lStyle}>Last name *</label>
                  <input required type="text" value={form.lastName} onChange={set('lastName')} placeholder="Last name" style={iStyle} />
                </div>
              </div>
              <div>
                <label style={lStyle}>Email address *</label>
                <input required type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Phone (WhatsApp)</label>
                <PhoneInput value={form.phone} onChange={phone => setForm(f => ({ ...f, phone }))} inputStyle={iStyle} />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontWeight: 700, color: INK, fontSize: 14.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={bringing} onChange={e => setBringing(e.target.checked)} style={{ width: 20, height: 20, accentColor: PURPLE }} />
                  I am bringing someone
                </label>
                {bringing && (
                  <div className="os-form-row" style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
                    <div>
                      <label style={lStyle}>Their name</label>
                      <input type="text" value={guest.name} onChange={e => setGuest(g => ({ ...g, name: e.target.value }))} placeholder="Name" style={iStyle} />
                    </div>
                    <div>
                      <label style={lStyle}>Their email</label>
                      <input type="email" value={guest.email} onChange={e => setGuest(g => ({ ...g, email: e.target.value }))} placeholder="Their joining link goes here" style={iStyle} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label style={lStyle}>Do you have a business?</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 2 }}>
                  {[
                    { v: true, label: 'Yes, I have one' },
                    { v: false, label: 'Not yet, starting out' },
                  ].map(o => {
                    const on = hasBusiness === o.v
                    return (
                      <button
                        key={String(o.v)} type="button" onClick={() => setHasBusiness(o.v)} aria-pressed={on}
                        style={{
                          padding: '13px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 14.5, fontWeight: 700,
                          fontFamily: 'inherit', minHeight: 48, transition: 'all .18s ease',
                          border: on ? '1.5px solid transparent' : `1.5px solid ${LINE}`,
                          background: on ? PURPLE : CREAM,
                          color: on ? '#fff' : INK,
                        }}
                      >{o.label}</button>
                    )
                  })}
                </div>
              </div>

              {hasBusiness === true && (
                <div style={{ display: 'grid', gap: 14, padding: '16px 16px 4px', borderRadius: 14, background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.16)' }}>
                  <div>
                    <label style={lStyle}>What does your business do?</label>
                    <input type="text" value={form.businessDoes} onChange={set('businessDoes')} placeholder="In one line" style={iStyle} />
                  </div>
                  <div className="os-form-row" style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
                    <div>
                      <label style={lStyle}>Website</label>
                      <input type="text" value={form.website} onChange={set('website')} placeholder="yoursite.com" style={iStyle} />
                    </div>
                    <div>
                      <label style={lStyle}>Instagram</label>
                      <input type="text" value={form.instagram} onChange={set('instagram')} placeholder="@yourhandle" style={iStyle} />
                    </div>
                  </div>
                </div>
              )}

              <details className="evt-reasons" style={{ background: CREAM, borderRadius: 12, padding: '4px 14px' }}>
                <summary style={{ ...lStyle, marginBottom: 0, padding: '10px 0', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 }}>
                  <span>What are you here for?{reasons.length > 0 ? ` (${reasons.length} picked)` : ' (optional)'}</span>
                  <span aria-hidden="true" style={{ color: PURPLE, fontSize: 15 }}>▾</span>
                </summary>
                <div style={{ display: 'grid', gap: 2, padding: '2px 0 12px' }}>
                  {REASONS.map(r => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, fontWeight: 600, color: INK, minHeight: 38, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={reasons.includes(r)}
                        onChange={() => toggleReason(r)}
                        style={{ width: 17, height: 17, accentColor: PURPLE, flex: 'none' }}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </details>

              <div>
                <label style={lStyle}>Anything else?</label>
                <textarea value={form.notes} onChange={set('notes')} placeholder="Questions or special requests…" rows={3} style={{ ...iStyle, resize: 'vertical' }} />
              </div>
              {event.price > 0 && openTiers.length > 1 && (
                <div role="radiogroup" aria-label="Choose your ticket">
                  <label style={lStyle}>Your ticket</label>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {openTiers.map(t => {
                      const on = t.id === tierId
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setTierId(t.id)}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left',
                            padding: '13px 14px', borderRadius: 12, cursor: 'pointer',
                            background: on ? 'rgba(124,58,237,.06)' : PAPER,
                            border: on ? `1.5px solid ${PURPLE}` : `1.5px solid ${LINE}`,
                            fontFamily: 'inherit',
                          }}>
                          <span aria-hidden="true" style={{
                            marginTop: 2, width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
                            border: on ? `5px solid ${PURPLE}` : `2px solid ${LINE}`, background: PAPER,
                          }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                              <strong style={{ fontSize: 14.5, color: INK }}>{t.name}</strong>
                              <span style={{ fontSize: 15, fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>
                                {t.compareAt && (
                                  <s style={{ color: MUTED, fontWeight: 500, marginRight: 6 }}>${t.compareAt}</s>
                                )}
                                ${t.price}
                              </span>
                            </span>
                            <span style={{ display: 'block', fontSize: 13, color: BODY_INK, marginTop: 3, lineHeight: 1.5 }}>
                              {t.blurb}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div style={{ background: CREAM, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: .8, fontFamily: DISPLAY, marginBottom: 8 }}>You leave with</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 14, color: INK, lineHeight: 1.75 }}>
                  {(event.leaveWith?.length ? event.leaveWith : [
                    'Your first steps to launch or grow your AI powered business',
                    'The one AI skill, seen live, and how to start it this week',
                    'A community building alongside you',
                  ]).map(x => (
                    <li key={x} style={{ display: 'flex', gap: 10 }}><span style={{ color: PURPLE, fontWeight: 800, flex: 'none' }}>✓</span>{x}</li>
                  ))}
                </ul>
              </div>

              {event.capacity > 0 && seatsTaken >= Math.round(event.capacity * 0.25) && (() => {
                const pct = Math.min(100, Math.round((seatsTaken / event.capacity) * 100))
                const left = Math.max(0, event.capacity - seatsTaken)
                const hot = pct >= 80
                const tone = hot ? '#B91C1C' : GOLD_INK
                return (
                  <div style={{ background: CREAM, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: tone }}>
                        {pct}% full
                      </span>
                      <span style={{ fontSize: 13, color: BODY_INK }}>
                        {left} of {event.capacity} seats left
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${pct} percent full`}
                      style={{ height: 9, borderRadius: 999, background: 'rgba(24,26,42,.1)', overflow: 'hidden' }}
                    >
                      <div style={{
                        width: `${Math.max(3, pct)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: hot ? '#B91C1C' : PURPLE,
                        transition: 'width .5s cubic-bezier(.2,.8,.2,1)',
                      }} />
                    </div>
                    {hot && (
                      <div style={{ fontSize: 12.5, color: '#B91C1C', marginTop: 8, fontWeight: 700 }}>
                        Filling fast. Register before it closes.
                      </div>
                    )}
                  </div>
                )
              })()}

              {error && <div style={{ fontSize: 13.5, color: '#b91c1c', background: 'rgba(185,28,28,.06)', borderRadius: 8, padding: '10px 12px' }}>{error}</div>}
              <button type="submit" disabled={status === 'submitting'}
                style={{ background: PURPLE, border: 'none', borderRadius: 12, padding: '16px', fontSize: 16.5, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: status === 'submitting' ? 0.7 : 1, boxShadow: '0 12px 30px -10px rgba(124,58,237,.6)', fontFamily: DISPLAY, minHeight: 56 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = PURPLE_HI }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = PURPLE }}>
                {status === 'submitting' ? 'Registering…' : event.price === 0 ? (bringing ? 'Register us both, free' : 'Register now, free') : `Register and pay, $${(selected ? selected.price : event.price) * (bringing ? 2 : 1)}${bringing ? ' for 2' : ''}`}
              </button>
              <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>
                By registering you agree to receive event communications from {BRAND.name}.
              </div>
            </form>
          )}

          <div style={{ background: CREAM, borderRadius: 20, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: DISPLAY }}>Presented by</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginTop: 3, fontFamily: DISPLAY }}>{BRAND.owner}</div>
              <div style={{ fontSize: 13, color: PURPLE, fontWeight: 700, marginTop: 2 }}>{BRAND.name}</div>
            </div>
          </div>
        </div>
      </div>

      <section style={{ background: NAVY, padding: 'clamp(44px, 6vw, 64px) 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(24px, 3.6vw, 34px)', fontWeight: 800, fontFamily: DISPLAY, color: '#fff', letterSpacing: '-.02em', margin: '0 0 10px', textWrap: 'balance' }}>
          {event.closingLine || 'One hour. One skill. Your whole business.'}
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,.8)', margin: '0 0 24px' }}>
          {event.price === 0 ? 'Free, live' : `Live, $${event.price}`}{event.date ? `, ${fmtDate(event.date)}` : ''}. The replay goes to everyone who {event.price === 0 ? 'registers' : 'joins'}.
        </p>
        <a href="#register" className="evt-cta evt-cta-big">
          {event.price === 0 ? 'Save my free seat' : 'Save my seat'} <span aria-hidden="true">→</span>
        </a>
      </section>

      <div style={{ borderTop: `1px solid ${LINE}`, padding: '22px 24px', textAlign: 'center', fontSize: 13, color: MUTED }}>
        © {new Date().getFullYear()} {BRAND.name} · {BRAND.owner}
        {event.disclaimer && <div style={{ marginTop: 6, fontSize: 12, maxWidth: 640, marginInline: 'auto', lineHeight: 1.5 }}>{event.disclaimer}</div>}
      </div>

      <style>{`
        .evt h1, .evt h2, .evt h3 { font-family: ${DISPLAY}; }
        /* THE ACTION, with a designed hover: lift, brighter purple, deeper
           shadow. When hovering Save My Free Seat, it should
           actually show that it's been hovered over." */
        .evt-cta {
          display: inline-block; background: ${PURPLE}; color: #fff;
          font-weight: 700; font-size: 17.5px; border-radius: 12px;
          padding: 17px 36px; text-decoration: none; font-family: ${DISPLAY};
          box-shadow: 0 12px 30px -10px rgba(124,58,237,.6);
          transition: background .15s ease, transform .15s ease, box-shadow .15s ease;
        }
        .evt-cta:hover { background: ${PURPLE_HI}; transform: translateY(-2px); box-shadow: 0 18px 38px -10px rgba(124,58,237,.7); }
        .evt-cta-big { font-size: 19px; padding: 19px 44px; }
        @media (max-width: 560px) { .evt-cta { display: block; text-align: center; } }
        @media (prefers-reduced-motion: reduce) { .evt-cta, .evt-cta:hover { transition: none; transform: none; } }
        /* ── VERY LIGHT MOTION (very light animations) ────
           One rise-in on load, staggered copy → photo → content. Nothing on
           scroll, nothing looping, and all of it off under reduced motion. */
        @keyframes evtRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .evt-hero-copy { animation: evtRise .55s cubic-bezier(.2,.8,.2,1) both; }
        .evt-hero-photo { animation: evtRise .55s .1s cubic-bezier(.2,.8,.2,1) both; }
        .evt-detail-grid { animation: evtRise .55s .18s cubic-bezier(.2,.8,.2,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .evt-hero-copy, .evt-hero-photo, .evt-detail-grid { animation: none; }
        }
        /* The collapsed reasons picker: hide the native marker, ours is the ▾. */
        .evt-reasons summary::-webkit-details-marker { display: none; }
        @media (max-width: 700px) { .evt-team { grid-template-columns: 1fr !important; } }
        .evt-reasons[open] summary span[aria-hidden] { transform: rotate(180deg); display: inline-block; }
        /* ── HERO RESPONSIVENESS ──────────────────────────────────────────
           The two-column hero must collapse cleanly: copy first, then the
           photo at a hand-held width, never a squeezed pair of columns. */
        @media (max-width: 900px) {
          .evt-hero { grid-template-columns: 1fr !important; gap: 28px !important; }
          .evt-hero-photo { max-width: 340px; margin: 0 auto; width: 100%; }
        }
        @media (max-width: 560px) {
          .evt-hero-actions { flex-direction: column; align-items: stretch !important; }
          .evt-hero-actions a { text-align: center; display: block !important; }
          .evt-hero-actions span br { display: none; }
          .evt-hero-actions span { text-align: center; }
          /* Two-up form rows become one column before they pinch. */
          .evt .os-form-row { grid-template-columns: 1fr !important; }
        }
        /* ── Mobile hygiene ───────────────────────────────────────────────
           Inputs stay 16px+ so iOS never zooms on focus; every tap target
           holds 44px; nothing may overflow 320px. */
        @media (max-width: 640px) {
          .evt-detail-grid { padding: 26px 16px 32px !important; gap: 24px !important; }
          .evt-detail-grid, .evt-detail-grid * { max-width: 100%; }
          .evt-rich, .evt-rich * { overflow-wrap: anywhere; }
          .evt-detail-side input,
          .evt-detail-side textarea,
          .evt-detail-side select { font-size: 16px !important; }
          .evt-detail-side button, .evt-detail-side a { min-height: 44px; }
        }
        .evt-rich h3 { font-family: ${DISPLAY}; font-weight: 800; color: ${INK}; font-size: 18px; margin: 22px 0 10px; }
        .evt-rich p { margin: 0 0 18px; }
        /* The lead paragraph is the hook, so it reads a step larger and in ink. */
        .evt-rich p:first-of-type { font-size: 18px; color: ${INK}; }
        .evt-rich ul { margin: 0 0 16px; padding-left: 20px; }
        .evt-rich li { margin-bottom: 8px; }
        .evt-rich strong { color: ${INK}; }
        @media (max-width: 900px) {
          .evt-detail-grid { grid-template-columns: 1fr !important; }
          /* SIGN-UP FIRST ON MOBILE. The form used to sit 78% of the way down
             the page, so a phone reader saw everything except the one thing
             the page exists for. */
          .evt-detail-side { position: static !important; order: -1 !important; }
          .evt-detail-grid > * { min-width: 0; }
        }
      `}</style>
    </div>
  )
}
