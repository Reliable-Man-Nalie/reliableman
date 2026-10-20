import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import EventPageClient from './EventPageClient'
import type { BosEvent } from '@/lib/event-types'
import { BRAND } from '@/lib/brand'
import FunnelView from '@/components/FunnelView'
import { eventFunnelId } from '@/lib/event-analytics'

export const dynamic = 'force-dynamic'

function serverSupabase() {

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!)
}

function rowToEvent(row: Record<string, unknown>): BosEvent {
  let blob: Partial<BosEvent> = {}
  if (typeof row.data === 'string' && row.data.trim()) {
    try { blob = JSON.parse(row.data) as Partial<BosEvent> } catch { /* extras only, never fatal */ }
  } else if (row.data && typeof row.data === 'object') {
    blob = row.data as Partial<BosEvent>
  }

  const s = (v: unknown, fallback = '') => (typeof v === 'string' && v.trim() ? v : fallback)
  const n = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

  return {
    ...blob,
    id: s(row.id, blob.id ?? ''),
    slug: s(row.slug, blob.slug ?? ''),
    status: s(row.status, blob.status ?? 'published'),
    title: s(row.title, blob.title ?? 'Event'),
    tagline: s(row.tagline, blob.tagline ?? ''),
    description: s(row.description, blob.description ?? ''),
    date: s(row.date, blob.date ?? '').slice(0, 10),
    time: s(row.time, blob.time ?? ''),
    endTime: s(row.end_time, blob.endTime ?? ''),
    timezone: s(row.timezone, blob.timezone ?? 'UTC'),
    format: s(row.format, blob.format ?? 'online'),
    location: s(row.location, blob.location ?? ''),
    locationName: s(row.location_name, blob.locationName ?? ''),
    capacity: n(row.capacity, blob.capacity ?? 0),
    price: n(row.price, blob.price ?? 0),
    currency: s(row.currency, blob.currency ?? 'USD'),
    coverImage: s(row.cover_image, blob.coverImage ?? ''),
    thumbnailImage: s(row.thumbnail_image, blob.thumbnailImage ?? ''),

    agenda: arr(row.agenda) ?? blob.agenda ?? [],
    faq: arr(row.faq) ?? blob.faq ?? [],
    speakers: arr(row.speakers) ?? blob.speakers ?? [],
  } as BosEvent
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arr(v: unknown): any[] | undefined {
  return Array.isArray(v) && v.length > 0 ? v : undefined
}

async function getPublishedEvent(slug: string): Promise<BosEvent | null> {
  try {
    const supabase = serverSupabase()
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)

      .in('status', process.env.VERCEL_ENV === 'production' ? ['published'] : ['published', 'draft'])
      .maybeSingle()

    if (error) {
      console.error(`[events] lookup failed for "${slug}": ${error.message}`)
      return null
    }
    if (!data) return null
    return rowToEvent(data as Record<string, unknown>)
  } catch (err) {
    console.error(`[events] lookup threw for "${slug}"`, err)
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const event = await getPublishedEvent(slug)
  if (!event) return { title: 'Event Not Found' }

  const title = event.seoTitle || event.title
  const description = event.seoDescription || event.description?.replace(/<[^>]+>/g, '').slice(0, 160)
  const url = `${BRAND.website}/events/${event.slug}`

  return {
    title: `${title} | ${BRAND.name}`,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: url },
  }
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublishedEvent(slug)
  if (!event) notFound()

  let seatsTaken = 0
  try {
    let q = serverSupabase()
      .from('event_attendees')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('status', 'registered')

    if (event.price > 0) q = q.eq('paid', true)
    const { count } = await q
    seatsTaken = count ?? 0
  } catch { /* no counter */ }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description?.replace(/<[^>]+>/g, '').slice(0, 200),
    startDate: event.date && event.time ? `${event.date}T${event.time}` : event.date,
    endDate: event.date && event.endTime ? `${event.date}T${event.endTime}` : undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: event.format === 'online'
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : event.format === 'hybrid'
      ? 'https://schema.org/MixedEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location: event.format === 'online'
      ? { '@type': 'VirtualLocation', url: event.location }
      : { '@type': 'Place', name: event.locationName || event.location, address: event.location },
    organizer: { '@type': 'Organization', name: BRAND.name, url: BRAND.website },
    image: event.coverImage || event.thumbnailImage,
    offers: { '@type': 'Offer', price: event.price, priceCurrency: event.currency || 'USD', availability: 'https://schema.org/InStock', url: `${BRAND.website}/events/${event.slug}` },
  }

  const jsonLdSafe = JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe }} />
      <FunnelView id={eventFunnelId(event.slug)} />
      <EventPageClient event={event} registrationOpen seatsTaken={seatsTaken} />
    </>
  )
}
