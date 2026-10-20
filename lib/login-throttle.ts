type Bucket = { count: number; first: number; blockedUntil: number }

const buckets = new Map<string, Bucket>()

const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 8
const BLOCK_MS = 15 * 60_000

function sweep(now: number) {
  if (buckets.size < 500) return
  for (const [k, b] of buckets) {
    if (now - b.first > WINDOW_MS && now > b.blockedUntil) buckets.delete(k)
  }
}

export function callerKey(headers: Headers): string {
  const xff = headers.get('x-forwarded-for') ?? ''
  const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : (headers.get('x-real-ip') ?? 'unknown')
}

export type ThrottleState = { blocked: boolean; retryAfterSeconds: number }

export function checkThrottle(key: string, now = Date.now()): ThrottleState {
  const b = buckets.get(key)
  if (!b) return { blocked: false, retryAfterSeconds: 0 }
  if (now < b.blockedUntil) {
    return { blocked: true, retryAfterSeconds: Math.ceil((b.blockedUntil - now) / 1000) }
  }
  return { blocked: false, retryAfterSeconds: 0 }
}

export function recordFailure(key: string, now = Date.now()): ThrottleState {
  sweep(now)
  const b = buckets.get(key)
  if (!b || now - b.first > WINDOW_MS) {
    buckets.set(key, { count: 1, first: now, blockedUntil: 0 })
    return { blocked: false, retryAfterSeconds: 0 }
  }
  b.count += 1
  if (b.count >= MAX_ATTEMPTS) {
    b.blockedUntil = now + BLOCK_MS
    return { blocked: true, retryAfterSeconds: Math.ceil(BLOCK_MS / 1000) }
  }
  return { blocked: false, retryAfterSeconds: 0 }
}

export function clearFailures(key: string) {
  buckets.delete(key)
}

export const THROTTLED_MESSAGE = 'Too many attempts. Wait a few minutes and try again.'
