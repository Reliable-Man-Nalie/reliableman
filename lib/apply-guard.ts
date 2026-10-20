export type GuardLevel = 'clean' | 'review' | 'spam'
export type GuardVerdict = { level: GuardLevel; reasons: string[] }

const VOWELS = 'aeiouy'

const DIGRAPH_HEADS = 'cstpgw'

const LEGAL_ONSETS = new Set([

  'bl', 'br', 'ch', 'cl', 'cr', 'dr', 'dw', 'fl', 'fr', 'gh', 'gl', 'gn', 'gr',
  'kl', 'kn', 'kr', 'kv', 'kw', 'ph', 'pl', 'pr', 'ps', 'pt', 'rh', 'sc', 'sh',
  'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sv', 'sw', 'th', 'tr', 'ts', 'tw', 'vl',
  'vr', 'wh', 'wr', 'zw',

  'bj', 'dj', 'dv', 'fj', 'gj', 'hj', 'hr', 'kj', 'lj', 'mj', 'nj', 'pj', 'sj',
  'sz', 'tj', 'vj', 'zj', 'cz', 'dz', 'rz', 'st', 'sr', 'sb', 'mn',

  'pf', 'zl', 'kh', 'shm',

  'zh', 'ng', 'ny', 'ts', 'tz', 'xh', 'xi', 'gw',
])

const MIN_VOWEL_RATIO = 0.2
const MAX_CONSONANT_RUN = 4

function wordLooksRandom(word: string): boolean {
  const w = word.replace(/[^a-z]/gi, '').toLowerCase()
  if (w.length < 5) return false

  const vowels = [...w].filter(c => VOWELS.includes(c)).length
  if (vowels / w.length < MIN_VOWEL_RATIO) return true

  let run = 0
  for (let i = 0; i < w.length; i++) {
    const ch = w[i]
    if (VOWELS.includes(ch)) { run = 0; continue }
    if (ch === 'h' && i > 0 && DIGRAPH_HEADS.includes(w[i - 1])) { run = 0; continue }
    if (++run >= MAX_CONSONANT_RUN) return true
  }

  for (let i = 1; i < w.length; i++) {
    if (w[i] === 'q' && w[i + 1] !== 'u') return true
  }

  if (/(hh|jj|qq|vv|xx|ww)/.test(w)) return true

  if (w.length >= 5 && !VOWELS.includes(w[0]) && !VOWELS.includes(w[1]) && !LEGAL_ONSETS.has(w.slice(0, 2))) {
    return true
  }

  return false
}

export function looksGenerated(fields: { name?: string; business?: string; email?: string }): GuardVerdict {
  const reasons: string[] = []

  const seen = new Set<string>()
  const flagOnce = (word: string): boolean => {
    const k = word.replace(/[^a-z]/gi, '').toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return wordLooksRandom(k)
  }

  const name = (fields.name ?? '').trim()
  const badNameWords = name.split(/\s+/).filter(flagOnce).length
  if (badNameWords === 1) reasons.push('the name reads as random text')
  if (badNameWords >= 2) reasons.push('both parts of the name read as random text')

  const business = (fields.business ?? '').replace(/\b(llc|ltd|inc|bv|nv|gmbh|sa|srl|corp)\b/gi, '').trim()
  const badBusinessWords = business ? business.split(/\s+/).filter(flagOnce).length : 0
  if (badBusinessWords > 0) reasons.push('the business name reads as random text')

  const local = (fields.email ?? '').split('@')[0] ?? ''
  const badEmail = flagOnce(local.replace(/[._\-+0-9]+/g, ' ').split(/\s+/)[0] ?? '') ? 1 : 0
  if (badEmail) reasons.push('the email address reads as random text')

  const score = badNameWords + badBusinessWords + badEmail
  if (score >= 2) return { level: 'spam', reasons }
  if (score === 1) return { level: 'review', reasons }
  return { level: 'clean', reasons }
}

export function looksLikeDirectPost(body: Record<string, unknown> | null | undefined): boolean {
  if (!body) return true
  const hasHoneypot = typeof body.hp === 'string'
  const hasTiming = body.elapsedMs !== undefined && body.elapsedMs !== null && Number.isFinite(Number(body.elapsedMs))
  return !hasHoneypot && !hasTiming
}

export const SPAM_TAG = 'Likely spam'

export function leadVerdict(
  fields: { name?: string; business?: string; email?: string },
  body?: Record<string, unknown> | null,
  opts?: { trustedSource?: boolean },
): GuardVerdict {
  const content = looksGenerated(fields)
  if (content.level === 'clean') return content

  if (!opts?.trustedSource && looksLikeDirectPost(body)) {
    return {
      level: 'spam',
      reasons: [...content.reasons, 'and it was posted straight at the API, not through any form on the site'],
    }
  }
  return content
}

export const BURST_WINDOW_MINUTES = 60

export const BURST_REVIEW_LIMIT = 6

export const BURST_HARD_LIMIT = 30

export function burstVerdict(recent: number): GuardVerdict {
  if (recent >= BURST_HARD_LIMIT) {
    return { level: 'spam', reasons: [`${recent} applications in ${BURST_WINDOW_MINUTES} minutes, past the hard ceiling`] }
  }
  if (recent >= BURST_REVIEW_LIMIT) {
    return { level: 'review', reasons: [`${recent} applications arrived in the last ${BURST_WINDOW_MINUTES} minutes`] }
  }
  return { level: 'clean', reasons: [] }
}

export function worst(...verdicts: GuardVerdict[]): GuardVerdict {
  const rank: Record<GuardLevel, number> = { clean: 0, review: 1, spam: 2 }
  const level = verdicts.reduce<GuardLevel>((a, v) => (rank[v.level] > rank[a] ? v.level : a), 'clean')
  return { level, reasons: verdicts.flatMap(v => v.reasons) }
}

export function isLikelySpam(row: {
  name?: string
  email?: string
  company?: string
  clientCompany?: string
  tags?: string[]
}): boolean {
  if (Array.isArray(row.tags) && row.tags.includes(SPAM_TAG)) return true
  return looksGenerated({
    name: row.name,
    business: row.company ?? row.clientCompany,
    email: row.email,
  }).level === 'spam'
}
