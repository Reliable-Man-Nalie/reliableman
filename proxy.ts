import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, isAuthConfigured, SESSION_COOKIE } from '@/lib/auth'

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/os/login') return NextResponse.next()
  if (!isAuthConfigured()) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next()
    return NextResponse.redirect(new URL('/os/login', req.url))
  }
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.redirect(new URL('/os/login', req.url))
  return NextResponse.next()
}

export const config = { matcher: ['/os/:path*'] }
