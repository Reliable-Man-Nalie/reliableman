import { useSyncExternalStore } from 'react'

export const PORTAL_HOSTNAME = (process.env.NEXT_PUBLIC_PORTAL_HOSTNAME || '')

export function isPortalHostname(hostname: string | null | undefined): boolean {
  return !!PORTAL_HOSTNAME && (hostname ?? '').toLowerCase() === PORTAL_HOSTNAME
}

const never = () => () => {}

export function usePortalHost(): boolean {
  return useSyncExternalStore(never, () => isPortalHostname(window.location.hostname), () => false)
}

export function usePrivateSurface(pathname: string | null | undefined): boolean {
  const portal = usePortalHost()
  return portal || isPrivateSurface(pathname)
}

export const PRIVATE_SURFACES: readonly string[] = [
  '/os',             // the Command Center. /os/contacts/<email> carries a real address
  '/admin',          // reserved: the dashboard's name if it is ever moved
  '/login',          // the member gate
  '/intake',         // /intake/<token>
  '/proposal',       // /proposal/<token>, where the token is the signature authority
  '/quote',          // /quote/<token>
  '/invoice',        // a client's figures
  '/receipt',        // a client's figures
  '/i',              // the short-link alias for an invoice token
]

export function isPrivateSurface(pathname: string | null | undefined): boolean {
  if (!pathname) return false

  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return PRIVATE_SURFACES.some(s => p === s || p.startsWith(s + '/'))
}
