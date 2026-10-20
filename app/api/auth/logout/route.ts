import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionCookieDomain } from '@/lib/auth'

function clear(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/os/login', req.url))
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0, domain: sessionCookieDomain(req.headers.get('host')) })
  return res
}

export async function POST(req: NextRequest) { return clear(req) }
export async function GET(req: NextRequest) { return clear(req) }
