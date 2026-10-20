import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest, isViewerRequest } from '@/lib/auth'

export const runtime = 'nodejs'

const PART_SETS: Record<string, readonly string[]> = {
  crm: ['leads', 'deals', 'proposals', 'invoices'],
  events: ['events', 'eventAttendees'],

  finance: ['expenses', 'timeEntries'],
  clients: ['clients'],
}

const TABLES = {
  leads: { table: 'leads', order: 'created_at' },
  deals: { table: 'deals', order: 'created_at' },
  proposals: { table: 'proposals', order: 'created_at' },
  invoices: { table: 'invoices', order: 'created_at' },
  events: { table: 'events', order: 'date' },
  eventAttendees: { table: 'event_attendees', order: 'registered_at' },
  expenses: { table: 'business_expenses', order: 'created_at' },
  timeEntries: { table: 'finance_time_entries', order: 'date' },
  clients: { table: 'clients', order: 'created_at' },
} as const

type PartKey = keyof typeof TABLES
const ALL = Object.keys(TABLES) as PartKey[]

function requestedParts(raw: string | null): PartKey[] {
  if (!raw) return ALL
  const asked = new Set<string>()
  for (const token of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const set = PART_SETS[token]
    if (set) set.forEach(p => asked.add(p))
    else asked.add(token)
  }
  const picked = ALL.filter(p => asked.has(p))

  return picked.length ? picked : ALL
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ ok: false, error: 'no supabase config' })

  const parts = requestedParts(req.nextUrl.searchParams.get('parts'))
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const rows = await Promise.all(
      parts.map(p => sb.from(TABLES[p].table).select('*').order(TABLES[p].order, { ascending: false })),
    )

    const body: Record<string, unknown> = { ok: true }
    parts.forEach((p, i) => { body[p] = rows[i].data ?? [] })

    return NextResponse.json(body)
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) })
  }
}
