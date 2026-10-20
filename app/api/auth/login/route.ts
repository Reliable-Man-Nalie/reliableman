import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminPassword, verifyStaffPassword, createSessionToken, SESSION_COOKIE, sessionCookieDomain } from '@/lib/auth'
import { callerKey, checkThrottle, clearFailures, recordFailure, THROTTLED_MESSAGE } from '@/lib/login-throttle'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const key = callerKey(req.headers)
  const gate = checkThrottle(key)
  if (gate.blocked) {
    return NextResponse.json({ ok: false, error: THROTTLED_MESSAGE }, { status: 429, headers: { 'Retry-After': String(gate.retryAfterSeconds) } })
  }
  const { password } = await req.json().catch(() => ({}))
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ ok: false, error: 'missing password' }, { status: 400 })
  }
  const owner = verifyAdminPassword(password)
  const staff = verifyStaffPassword(password)
  const result = owner ?? staff
  await new Promise(r => setTimeout(r, 400))
  if (!result) {
    const after = recordFailure(key)
    return NextResponse.json(
      { ok: false, error: after.blocked ? THROTTLED_MESSAGE : 'not authorized' },
      after.blocked ? { status: 429, headers: { 'Retry-After': String(after.retryAfterSeconds) } } : { status: 401 },
    )
  }
  clearFailures(key)
  const token = await createSessionToken(result.email, result.role, !owner)
  const res = NextResponse.json({ ok: true, redirect: '/os' })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/', domain: sessionCookieDomain(req.headers.get('host')),
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
