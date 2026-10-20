import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'

export const runtime = 'nodejs'

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { contacts, tags = [], source = 'csv-import' } = body as {
    contacts: Array<{ name?: string; email?: string; phone?: string; company?: string; notes?: string; status?: string; tags?: string[]; source?: string }>
    tags?: string[]
    source?: string
  }

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: 'no contacts' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ ok: false, error: 'no supabase config' }, { status: 500 })

  const now = new Date().toISOString()
  const rows = contacts
    .filter(c => c.name || c.email)
    .map(c => {
      const rowTags = [...(Array.isArray(c.tags) ? c.tags : []), ...tags].filter(Boolean)
      return {
        id: 'c-' + uid(),
        name: c.name || c.email || 'Unknown',
        email: c.email || '',
        phone: c.phone || null,
        company: c.company || null,
        source: c.source || source,
        status: c.status || 'new',
        notes: c.notes || null,
        created_at: now,
        tags: rowTags.length > 0 ? rowTags : null,
      }
    })

  if (rows.length === 0) return NextResponse.json({ ok: true, imported: 0 })

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const { error } = await sb.from('leads').insert(rows)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true, imported: rows.length })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
