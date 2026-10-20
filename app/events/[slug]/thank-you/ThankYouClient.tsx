'use client'

import Link from 'next/link'
import { eventTimeRangesLine } from '@/lib/event-time'
import Image from 'next/image'
import type { BosEvent } from '@/lib/event-types'
import { AddToCalendar } from '@/components/AddToCalendar'
import { useEffect, useRef } from 'react'
import { trackEvent } from '@/components/MetaPixel'
import { BRAND } from '@/lib/brand'
import { registrationEventId } from '@/lib/registration-event-id'
import { EVENT_WHATSAPP_URL, isCommunityLinkSet, COMMUNITY_HEADING, COMMUNITY_BODY, COMMUNITY_CTA } from '@/lib/event-community'
import { NAVY, PURPLE, PAPER, CREAM, INK, BODY as BODY_INK, MUTED, LINE } from '@/lib/theme'

const DISPLAY = "var(--oh-display), 'Poppins', system-ui, sans-serif"
const TEXT = "var(--oh-body), 'Quicksand', system-ui, sans-serif"

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function ThankYouClient({ event, ticketCode }: { event: BosEvent; ticketCode: string }) {

  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackEvent('CompleteRegistration', {
      content_name: event?.title || 'The Only AI Skill You Need to Build Your Freedom Business',
      content_category: 'event',
      currency: 'USD',
      value: 0,
      status: true,
    }, ticketCode ? { eventID: registrationEventId(ticketCode) } : undefined)
    trackEvent('Lead', {
      content_name: event?.title || 'The Only AI Skill You Need to Build Your Freedom Business',
      content_category: 'event-registration',
    })
  }, [event?.title, ticketCode])

  const isOnline = event.format === 'online'

  const steps = [
    { title: 'Check your inbox, and your spam', text: 'A confirmation email with your joining link is on its way. If it is not in your inbox in a few minutes, look in spam or promotions. Marking it as not spam genuinely helps, it means the reminder before we go live reaches you too.' },
    { title: 'Save the date', text: 'Add the event to your calendar so you do not miss it.' },
    { title: 'Get a reminder', text: `We'll email you a reminder one hour before ${isOnline ? 'we go live' : 'doors open'}.` },
  ]

  const card: React.CSSProperties = { background: CREAM, borderRadius: 20, padding: '24px 26px', marginBottom: 18 }
  const kicker: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 10, fontFamily: DISPLAY }

  return (
    <div style={{ background: PAPER, fontFamily: TEXT, fontWeight: 600, color: INK, minHeight: '100vh' }}>
      <div style={{ background: PAPER, borderBottom: `1px solid ${LINE}`, textAlign: 'center', padding: '14px 20px' }}>
        <Image src={BRAND.logo} alt={BRAND.name} width={300} height={75} quality={90} style={{ height: 34, width: 'auto', display: 'inline-block' }} priority />
      </div>

      <section style={{ padding: '48px 24px 72px' }}>
        <div style={{ width: '100%', maxWidth: 600, margin: '0 auto' }}>

          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(22,163,74,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <span style={{ fontSize: 34, color: '#16a34a', fontWeight: 800 }}>✓</span>
            </div>
            <div style={{ ...kicker, color: '#16a34a' }}>You&apos;re registered</div>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 800, fontFamily: DISPLAY, lineHeight: 1.1, letterSpacing: '-.02em', margin: '0 0 12px', color: INK }}>
              See you at the session!
            </h1>
            <p style={{ fontSize: 16.5, color: BODY_INK, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
              Your spot for <strong style={{ color: INK }}>{event.title}</strong> is locked in.
            </p>
          </div>

          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
              {[
                event.date && { label: 'Date', value: fmtDate(event.date) },
                event.time && { label: 'Time', value: eventTimeRangesLine(event.date, event.time, event.endTime, event.timezone) || `${event.time}${event.endTime ? ` – ${event.endTime}` : ''} (${event.timezone})` },

                isOnline ? { label: 'Platform', value: 'Online via Google Meet' }
                  : event.locationName && { label: 'Location', value: event.locationName },
              ].filter(Boolean).map((item) => {
                const { label, value } = item as { label: string; value: string }
                return (
                  <div key={label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: .8, fontFamily: DISPLAY }}>{label}</div>
                    <div style={{ fontSize: 14.5, color: INK, marginTop: 3, lineHeight: 1.5 }}>{value}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 20, position: 'relative', zIndex: 300 }}>
              <AddToCalendar event={event} />
            </div>
          </div>

          {isCommunityLinkSet() && (
            <div style={{ ...card, background: 'rgba(37,211,102,.08)', border: '1px solid rgba(37,211,102,.3)' }}>
              <div style={{ ...kicker, color: '#15803D' }}>Do this now</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: INK, marginBottom: 10, fontFamily: DISPLAY, lineHeight: 1.25 }}>
                {COMMUNITY_HEADING}
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: BODY_INK, margin: '0 0 18px' }}>
                {COMMUNITY_BODY}
              </p>
              <a
                href={EVENT_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: '#25D366', color: '#042a14', fontWeight: 800, fontSize: 16,
                  padding: '15px 30px', borderRadius: 12, textDecoration: 'none', fontFamily: DISPLAY,
                }}
              >
                {COMMUNITY_CTA}
              </a>
            </div>
          )}

          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 16px', fontFamily: DISPLAY, color: INK }}>What happens next</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(124,58,237,.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: PURPLE, fontWeight: 800, fontSize: 14, fontFamily: DISPLAY }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 2, color: INK, fontFamily: DISPLAY }}>{s.title}</div>
                    <div style={{ fontSize: 13.5, color: BODY_INK, lineHeight: 1.6 }}>{s.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Link href={`/events/${event.slug}`} style={{ fontSize: 14.5, fontWeight: 700, color: PURPLE, textDecoration: 'none', borderBottom: '1px solid rgba(124,58,237,.35)' }}>
              Back to the event page
            </Link>
          </div>
        </div>
      </section>

      <div style={{ borderTop: `1px solid ${LINE}`, padding: '22px 24px', textAlign: 'center', fontSize: 13, color: MUTED }}>
        © {new Date().getFullYear()} {BRAND.name}
      </div>
    </div>
  )
}
