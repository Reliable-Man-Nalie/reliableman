import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import ThankYouClient from './ThankYouClient'
import type { BosEvent } from '@/lib/event-types'

export const dynamic = 'force-dynamic'

function serverSupabase() {

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!)
}

async function getEvent(slug: string): Promise<BosEvent | null> {
  try {
    const supabase = serverSupabase()

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (error || !data) return null

    let parsed: Partial<BosEvent> = {}
    if (typeof data.data === 'string' && data.data.trim()) {
      try { parsed = JSON.parse(data.data) as Partial<BosEvent> } catch { /* columns carry it */ }
    } else if (data.data && typeof data.data === 'object') {
      parsed = data.data as Partial<BosEvent>
    }
    return {
      ...parsed,
      id: String(data.id ?? parsed.id ?? ''),
      slug: String(data.slug ?? parsed.slug ?? slug),
      title: String(data.title ?? parsed.title ?? 'Event'),
      format: String(data.format ?? parsed.format ?? 'online'),
      location: String(data.location ?? parsed.location ?? ''),

      locationName: String(data.location_name || parsed.locationName || ''),
      date: String(data.date || parsed.date),
      time: String(data.time || parsed.time),
      endTime: String(data.end_time || parsed.endTime || ''),
      timezone: String(data.timezone || parsed.timezone),
    } as BosEvent
  } catch {
    return null
  }
}

export const metadata: Metadata = {
  title: 'You are registered',
  robots: { index: false, follow: false },
}

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { slug } = await params
  const { t } = await searchParams

  const event = (await getEvent(slug))
  if (!event) notFound()

  return <ThankYouClient event={event} ticketCode={t ?? ''} />
}
