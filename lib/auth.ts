import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

export const SESSION_COOKIE = 'bos_session'

export type Role = 'admin'

const MIN_SECRET_LEN = 16

export const OWNER_LOGIN = 'owner'
export const STAFF_EMAIL = 'team'

export function sessionCookieDomain(_host: string | null | undefined): string | undefined {
  const d = (process.env.SESSION_COOKIE_DOMAIN || '').trim()
  return d || undefined
}

function rawSecret(): string | null {
  const s = process.env.AUTH_SECRET
  if (s && s.length >= MIN_SECRET_LEN) return s
  const p = process.env.OS_ADMIN_PASSWORD
  if (p && p.trim().length >= MIN_SECRET_LEN) return p.trim()
  if (process.env.NODE_ENV !== 'production') return 'dev-only-insecure-secret-change-me'
  return null
}

export function isAuthConfigured(): boolean {
  return rawSecret() !== null && !!process.env.OS_ADMIN_PASSWORD
}

function devBypass(): boolean {
  return process.env.NODE_ENV !== 'production' && !isAuthConfigured()
}

function secretKey(): Uint8Array | null {
  const s = rawSecret()
  return s ? new TextEncoder().encode(s) : null
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export function verifyAdminPassword(password: string): { email: string; role: Role } | null {
  const expected = (process.env.OS_ADMIN_PASSWORD || '').trim()
  const given = (password || '').trim()
  if (!expected || expected.length < MIN_SECRET_LEN || !given) return null
  if (!constantTimeEqual(given, expected)) return null
  return { email: OWNER_LOGIN, role: 'admin' }
}

export function verifyStaffPassword(password: string): { email: string; role: Role; staff: true } | null {
  const expected = (process.env.OS_STAFF_PASSWORD || '').trim()
  const given = (password || '').trim()
  if (!expected || expected.length < MIN_SECRET_LEN || !given) return null
  if (process.env.OS_ADMIN_PASSWORD && expected === process.env.OS_ADMIN_PASSWORD.trim()) return null
  if (!constantTimeEqual(given, expected)) return null
  return { email: STAFF_EMAIL, role: 'admin', staff: true }
}

export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  if (devBypass()) return true
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  return session?.role === 'admin'
}

export const isBoardRequest = isAdminRequest

export async function isOwnerRequest(req: NextRequest): Promise<boolean> {
  if (devBypass()) return true
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  return session?.role === 'admin' && !session.staff
}

export async function isViewerRequest(_req: NextRequest): Promise<boolean> {
  return false
}

export async function createSessionToken(email: string, role: Role, staff = false): Promise<string> {
  const key = secretKey()
  if (!key) throw new Error('AUTH_SECRET is not configured')
  return new SignJWT({ email, role, staff })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key)
}

export async function verifySessionToken(token: string | undefined): Promise<{ email: string; role: Role; staff?: boolean } | null> {
  if (!token) return null
  const key = secretKey()
  if (!key) return null
  try {
    const { payload } = await jwtVerify(token, key)
    const email = typeof payload.email === 'string' ? payload.email : ''
    if (!email || payload.role !== 'admin') return null

    if (payload.staff === true && !process.env.OS_STAFF_PASSWORD) return null
    return { email, role: 'admin', staff: payload.staff === true }
  } catch {
    return null
  }
}
