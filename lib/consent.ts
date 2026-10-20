'use client'

import { useSyncExternalStore } from 'react'

export const CONSENT_POLICY_VERSION = '2026-07-26'

export const CONSENT_STORAGE_KEY = 'bos_cookie_consent'

export const CONSENT_CHANGED_EVENT = 'bos:consent-changed'

export const OPEN_CONSENT_EVENT = 'bos:open-cookie-settings'

export type OptionalConsentCategory = 'analytics' | 'marketing'

export interface ConsentCategories {

  necessary: true
  analytics: boolean
  marketing: boolean
}

export interface ConsentRecord {

  name: typeof CONSENT_STORAGE_KEY

  version: string

  decidedAt: string
  categories: ConsentCategories
}

export const ACCEPT_ALL: ConsentCategories = { necessary: true, analytics: true, marketing: true }
export const REJECT_ALL: ConsentCategories = { necessary: true, analytics: false, marketing: false }

let cachedRaw: string | null = null
let cachedRecord: ConsentRecord | null = null
let hasCache = false

function parseRecord(raw: string | null): ConsentRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>
    if (!parsed || typeof parsed !== 'object') return null

    if (parsed.version !== CONSENT_POLICY_VERSION) return null
    const c = parsed.categories
    if (!c || typeof c.analytics !== 'boolean' || typeof c.marketing !== 'boolean') return null
    return {
      name: CONSENT_STORAGE_KEY,
      version: CONSENT_POLICY_VERSION,
      decidedAt: typeof parsed.decidedAt === 'string' ? parsed.decidedAt : '',
      categories: { necessary: true, analytics: c.analytics, marketing: c.marketing },
    }
  } catch {
    return null
  }
}

export function readConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
  } catch {
    return null // private mode / storage blocked: treat as "not decided", nothing loads
  }
  if (!hasCache || raw !== cachedRaw) {
    cachedRaw = raw
    cachedRecord = parseRecord(raw)
    hasCache = true
  }
  return cachedRecord
}

function readConsentServer(): ConsentRecord | null {
  return null
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function useConsent(): ConsentRecord | null {
  return useSyncExternalStore(subscribe, readConsent, readConsentServer)
}

const neverChanges = () => () => {}

export function useIsHydrated(): boolean {
  return useSyncExternalStore(neverChanges, () => true, () => false)
}

export function useConsentGranted(category: OptionalConsentCategory): boolean {
  const record = useConsent()
  return record ? record.categories[category] === true : false
}

export function useConsentBannerVisible(): boolean {
  const hydrated = useIsHydrated()
  const record = useConsent()
  return hydrated && record === null
}

const CATEGORY_COOKIE_PREFIXES: Record<OptionalConsentCategory, readonly string[]> = {
  analytics: ['_ga', '_gid', '_gat', '_gcl', 'ph_', 'ph_phc'],
  marketing: ['_fbp', '_fbc'],
}

function clearCookiesFor(categories: readonly OptionalConsentCategory[]): void {
  if (typeof document === 'undefined' || categories.length === 0) return
  const prefixes = categories.flatMap(c => CATEGORY_COOKIE_PREFIXES[c])
  const host = window.location.hostname
  const domains = [undefined, host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`]
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (!name) continue
    if (!prefixes.some(p => name.startsWith(p))) continue
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ''}`
    }
  }
}

export function sweepDeniedCookies(record: ConsentRecord | null): void {
  const denied = (['analytics', 'marketing'] as const)
    .filter(c => record?.categories[c] !== true)
  clearCookiesFor(denied)
}

export function saveConsent(categories: ConsentCategories): void {
  if (typeof window === 'undefined') return
  const previous = readConsent()
  const record: ConsentRecord = {
    name: CONSENT_STORAGE_KEY,
    version: CONSENT_POLICY_VERSION,
    decidedAt: new Date().toISOString(),
    categories: { necessary: true, analytics: categories.analytics, marketing: categories.marketing },
  }
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record))
  } catch {

  }
  hasCache = false
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT))

  const withdrew =
    (previous?.categories.analytics === true && !record.categories.analytics) ||
    (previous?.categories.marketing === true && !record.categories.marketing)

  if (withdrew) {
    sweepDeniedCookies(record)
    window.location.reload()
  }
}

export function openCookieSettings(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))
}
