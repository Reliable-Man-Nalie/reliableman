import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { type?: string; token?: string; id?: string }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ ok: false })

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)
    const now = new Date().toISOString()

    if (body.type === 'proposal' && typeof body.token === 'string' && body.token) {
      await sb.from('proposals').update({ viewed_at: now }).eq('token', body.token).is('viewed_at', null)
    } else if (body.type === 'invoice' && typeof body.id === 'string' && body.id) {
      await sb.from('invoices').update({ viewed_at: now }).eq('id', body.id).is('viewed_at', null)
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
