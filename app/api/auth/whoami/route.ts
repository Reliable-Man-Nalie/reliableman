import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth'
import { BRAND } from '@/lib/brand'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const staff = session.staff === true
  return NextResponse.json({
    ok: true,
    email: session.email,
    role: session.role,
    staff,
    editor: false,
    partner: false,
    viewer: false,
    label: staff ? 'Team' : BRAND.owner,
    sub: staff ? 'Team access' : 'Owner',
  })
}
