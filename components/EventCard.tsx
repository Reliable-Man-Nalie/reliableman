import Link from 'next/link'
import Image from 'next/image'

export type EventCardData = {

  month: string

  day: string
  title: string
  subtitle: string
  desc: string
  dateLabel: string
  timeLabel: string
  place: string
  ticket: string

  cta: string

  href: string

  note?: string
}

type Props = {
  event: EventCardData

  tone?: 'light' | 'dark'

  image?: string

  priority?: boolean
}

const DEFAULT_IMAGE = '/event-default.png'
const SORA = "'Sora', sans-serif"
const MONO = "'Space Mono', monospace"

const PALETTE = {

  light: {
    surface: '#fff',
    border: '1px solid rgba(24,26,42,.12)',
    shadow: '0 24px 60px -30px rgba(24,26,42,.4)',
    hoverShadow: '0 30px 70px -30px rgba(24,26,42,.5)',
    ink: '#181A2A',
    accent: '#7C3AED',
    body: '#4C4F63',
    meta: '#6E7186',
    rule: 'rgba(24,26,42,.12)',
    badgeBg: 'rgba(255,255,255,.95)',
    badgeBorder: '1px solid rgba(24,26,42,.10)',
    badgeMonth: '#7C3AED',
    badgeDay: '#181A2A',
    focus: '#7C3AED',
  },
  dark: {
    surface: 'linear-gradient(160deg,#2a0a54,#12002a)',
    border: '1px solid rgba(247,207,115,.30)',
    shadow: '0 30px 80px rgba(0,0,0,.5), 0 0 70px rgba(247,207,115,.06)',
    hoverShadow: '0 38px 90px rgba(0,0,0,.58), 0 0 80px rgba(247,207,115,.12)',
    ink: '#f4efe6',
    accent: '#f7cf73',
    body: '#c6b4de',
    meta: '#a99cc0',
    rule: 'rgba(247,207,115,.16)',
    badgeBg: 'rgba(11,0,24,.78)',
    badgeBorder: '1px solid rgba(247,207,115,.34)',
    badgeMonth: '#f7cf73',
    badgeDay: '#f4efe6',
    focus: '#f7cf73',
  },
} as const

export default function EventCard({ event, tone = 'light', image, priority = false }: Props) {
  const c = PALETTE[tone]

  const meta = [
    { k: 'Date', v: event.dateLabel },
    { k: 'Time', v: event.timeLabel },
    { k: 'Where', v: event.place },
    { k: 'Ticket', v: event.ticket },
  ].filter(d => !!d.v)

  const metaKey: React.CSSProperties = {
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: '.02em',
    color: c.meta,
    marginBottom: 4,
  }

  return (
    <>
      <style>{`
        .evc-card { display:block; text-decoration:none; transition: transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s ease; }
        .evc-card:hover { transform: translateY(-3px); }
        .evc-card:focus-visible { outline: 2px solid ${c.focus}; outline-offset: 4px; }
        .evc-card:hover .evc-cta { transform: translateY(-1px); }
        .evc-cta { transition: transform .2s ease, box-shadow .2s ease; }
        .evc-card:hover .evc-shot img { transform: scale(1.03); }
        .evc-shot img { transition: transform .5s cubic-bezier(.16,1,.3,1); }
        @media (prefers-reduced-motion: reduce) {
          .evc-card, .evc-cta, .evc-shot img { transition: none !important; }
          .evc-card:hover { transform: none; }
          .evc-card:hover .evc-shot img { transform: none; }
        }
        /* The card carries its own mobile caps rather than borrowing the host
           page's, so it drops into a dark page and a light one identically. */
        @media (max-width: 767px) {
          .evc-body { padding: 26px 22px !important; }
          .evc-title { font-size: 23px !important; line-height: 1.15 !important; }
          .evc-cta { width: 100%; justify-content: center; }
        }
      `}</style>

      <Link
        href={event.href}
        className="evc-card"
        aria-label={`${event.title}. ${event.cta}`}
        style={{
          borderRadius: 26,
          overflow: 'hidden',
          background: c.surface,
          border: c.border,
          boxShadow: c.shadow,
        }}
      >
        <div className="evc-shot" style={{ position: 'relative', aspectRatio: '16/9', background: 'linear-gradient(165deg, rgba(255,255,255,.09), rgba(255,255,255,.02))', backdropFilter: 'blur(24px) saturate(165%)', WebkitBackdropFilter: 'blur(24px) saturate(165%)', overflow: 'hidden' }}>
          <Image
            src={image || DEFAULT_IMAGE}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 1023px) 92vw, 560px"
            style={{ objectFit: 'cover' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(200deg,rgba(11,0,24,.1),rgba(11,0,24,.55))' }} />

          <div style={{ position: 'absolute', left: 22, top: 22, textAlign: 'center', background: c.badgeBg, border: c.badgeBorder, borderRadius: 16, padding: '10px 16px', boxShadow: '0 10px 26px rgba(0,0,0,.24)' }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', color: c.badgeMonth }}>{event.month}</span>
            <span style={{ display: 'block', fontFamily: SORA, fontSize: 32, fontWeight: 900, lineHeight: 1, color: c.badgeDay, marginTop: 2 }}>{event.day}</span>
          </div>

          <span style={{ position: 'absolute', right: 20, bottom: 18, fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'rgba(24,26,42,.72)', backdropFilter: 'blur(4px)', padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.2)' }}>
            {event.place}
          </span>
        </div>

        <div className="evc-body" style={{ padding: '30px 32px 32px' }}>
          <h3 className="evc-title" style={{ fontFamily: SORA, fontWeight: 800, fontSize: 'clamp(20px,3vw,24px)', lineHeight: 1.1, letterSpacing: '-.025em', color: c.ink, margin: '0 0 6px', textWrap: 'balance' }}>
            {event.title}
          </h3>

          {event.subtitle && (
            <p style={{ fontFamily: SORA, fontWeight: 600, fontSize: 17, lineHeight: 1.4, color: c.accent, margin: '0 0 14px' }}>{event.subtitle}</p>
          )}

          {event.desc && (
            <p style={{ fontSize: 16, lineHeight: 1.7, color: c.body, margin: '0 0 22px' }}>{event.desc}</p>
          )}

          <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px', margin: '0 0 24px' }}>
            {meta.map(d => (
              <div key={d.k}>
                <dt style={metaKey}>{d.k}</dt>
                <dd style={{ margin: 0, fontFamily: SORA, fontWeight: 700, fontSize: 15, color: c.ink }}>{d.v}</dd>
              </div>
            ))}
          </dl>

          <span
            className="evc-cta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              background: tone === 'dark' ? 'linear-gradient(180deg,#f7cf73,#eaa92e)' : '#7C3AED',
              color: tone === 'dark' ? '#3a2600' : '#fff',
              borderRadius: tone === 'dark' ? 999 : 12,
              padding: '15px 30px',
              fontSize: 16,
              fontWeight: 800,
              fontFamily: SORA,
              boxShadow: tone === 'dark' ? '0 12px 30px rgba(234,169,46,.32)' : '0 14px 34px -12px rgba(124,58,237,.75)',
            }}
          >
            {event.cta} <span aria-hidden>→</span>
          </span>

          {event.note && <p style={{ fontSize: 13.5, color: c.meta, margin: '14px 0 0' }}>{event.note}</p>}
        </div>
      </Link>
    </>
  )
}
