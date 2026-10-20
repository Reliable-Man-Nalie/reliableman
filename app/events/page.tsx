import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import EventCard, { type EventCardData } from '@/components/EventCard'
import type { BosEvent } from '@/lib/event-types'
import { BRAND } from '@/lib/brand'
import { PAPER, CREAM, INK, BODY, MUTED, PURPLE } from '@/lib/theme'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: `Events | ${BRAND.name}`,
  description: `Upcoming events from ${BRAND.name}.`,
}

function moneyLabel(price: number, currency: string): string {
  if (!price) return 'Free'
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : `${currency} `
  return `${sym}${price}`
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

async function getPublishedEvents(): Promise<EventCardData[]> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return []
    const sb = createClient(url, key)
    const { data } = await sb.from('events').select('*').eq('status', 'published')
    if (!data || !data.length) return []

    const today = new Date().toISOString().slice(0, 10)
    return data

      .map(r => {
        let blob: Partial<BosEvent> = {}
        if (typeof r.data === 'string' && r.data.trim()) {
          try { blob = JSON.parse(r.data) as Partial<BosEvent> } catch { /* columns carry it */ }
        } else if (r.data && typeof r.data === 'object') {
          blob = r.data as Partial<BosEvent>
        }
        const str = (v: unknown, fb = '') => (v === null || v === undefined || v === '' ? fb : String(v))
        return {
          ...blob,
          id: str(r.id, str(blob.id)),
          slug: str(r.slug, str(blob.slug)),
          title: str(r.title, str(blob.title)),
          tagline: str(r.tagline, str(blob.tagline)),
          date: str(r.date, str(blob.date)).slice(0, 10),
          time: str(r.time, str(blob.time)),
          timezone: str(r.timezone, str(blob.timezone)),
          format: str(r.format, str(blob.format) || 'online'),
          location: str(r.location, str(blob.location)),
          locationName: str(r.location_name, str(blob.locationName)),
          price: Number(r.price ?? blob.price ?? 0),
          currency: str(r.currency, str(blob.currency) || 'USD'),
        } as BosEvent
      })
      .filter((e): e is BosEvent => !!e && !!e.date)
      .filter(e => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => {
        const d = new Date(e.date + 'T00:00:00')
        const valid = !isNaN(d.getTime())
        const zone = (e.timezone || '').split('/')[1]?.replace('_', ' ') || ''
        const place = e.format === 'online' ? 'Online, live' : e.format === 'hybrid' ? 'Live + stream' : (e.locationName || e.location || 'In person')
        return {
          month: valid ? MONTHS[d.getMonth()] : '',
          day: valid ? String(d.getDate()).padStart(2, '0') : '',
          title: e.title,
          subtitle: (e.tagline || '').replace(/<[^>]+>/g, ''),
          desc: (e.description || '').replace(/<[^>]+>/g, '').slice(0, 320),
          dateLabel: valid ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : e.date,
          timeLabel: [e.time, zone].filter(Boolean).join(' '),
          place,
          ticket: moneyLabel(e.price, e.currency),
          cta: e.price > 0 ? 'Reserve a seat' : 'Join free',
          href: `/events/${e.slug}`,
        }
      })
  } catch {
    return []
  }
}

export default async function EventsPage() {
  const events = await getPublishedEvents()
  return (
    <main style={{ minHeight: '100vh', background: CREAM, color: INK, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 20px 72px' }}>
        <Link href={BRAND.website} style={{ fontSize: 14, fontWeight: 700, color: PURPLE, textDecoration: 'none' }}>&larr; {BRAND.name}</Link>
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, margin: '18px 0 8px', lineHeight: 1.15 }}>Upcoming events</h1>
        <p style={{ fontSize: 16, color: BODY, margin: '0 0 32px', maxWidth: '60ch', lineHeight: 1.6 }}>
          Pick an event and save your seat. You get a confirmation by email straight away.
        </p>
        {events.length === 0 ? (
          <div style={{ background: PAPER, borderRadius: 16, padding: '28px 24px', color: MUTED, fontSize: 15 }}>
            There is no event on the calendar right now. Check back soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {events.map(e => <EventCard key={e.href} event={e} tone="light" />)}
          </div>
        )}
      </section>
    </main>
  )
}
