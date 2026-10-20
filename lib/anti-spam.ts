const MIN_SUBMIT_MS = 1200

export interface SpamVerdict {
  spam: boolean
  reason?: 'honeypot' | 'too-fast'
}

export function detectSpam(body: Record<string, unknown> | null | undefined): SpamVerdict {
  if (!body) return { spam: false }

  const hp = body.hp
  if (typeof hp === 'string' && hp.trim() !== '') {
    return { spam: true, reason: 'honeypot' }
  }

  const raw = body.elapsedMs
  const elapsed = typeof raw === 'number' ? raw : Number(raw)
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_SUBMIT_MS) {
    return { spam: true, reason: 'too-fast' }
  }

  return { spam: false }
}

export const SPAM_REJECTION = {
  body: { error: 'Your submission could not be processed. Please try again.' },
  status: 400,
} as const
