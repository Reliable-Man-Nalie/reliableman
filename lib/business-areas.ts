export type LevelId = 'niche' | 'offer' | 'system' | 'reach'

export interface Criterion {
  id: string
    label: string
}

export interface JourneyLevel {
  id: LevelId
  order: number
    heading: string
    name: string
    question: string
  summary: string
    criteria: Criterion[]
    gate: { metric: 'customers' | 'revenue' | 'none'; value: number; label: string }
    firstSteps: string[]
  color: string
  emoji: string
}

export const LEVELS: readonly JourneyLevel[] = [
  {
    id: 'niche', order: 1,
    heading: 'Audience',
    name: 'Who you serve',
    question: 'Who exactly am I here to serve?',
    summary: 'Everything downstream is guesswork until this is decided. A message written for everyone reaches no one.',
    criteria: [
      { id: 'n1', label: 'I can name the specific person I serve, not just an industry' },
      { id: 'n2', label: 'I know the problem they would pay to have solved' },
      { id: 'n3', label: 'I know where they already spend their attention' },
      { id: 'n4', label: 'I have spoken to at least five of them about it' },
    ],
    gate: { metric: 'none', value: 0, label: 'No sales needed yet. This level is about clarity.' },
    firstSteps: [
      'Write one sentence: I help [who] to [result] so they can [why it matters].',
      'List five people you know who fit it. Message them and ask what they are stuck on.',
      'Cross out every group you are keeping as a backup. Backups are how a niche stays vague.',
    ],
    color: '#b06fd6', emoji: '🎯',
  },
  {
    id: 'offer', order: 2,
    heading: 'Offer',
    name: 'What you sell',
    question: 'How do I say what I do so the right person wants it?',
    summary: 'You know who. Now the offer has to be understood in one read and be worth paying for.',
    criteria: [
      { id: 'o1', label: 'I can explain my offer in one sentence without hedging' },
      { id: 'o2', label: 'I know what it costs and I can say the price out loud' },
      { id: 'o3', label: 'I have made the offer to a real person, not just planned it' },
      { id: 'o4', label: 'Someone has paid for it' },
    ],
    gate: { metric: 'customers', value: 1, label: 'At least one paying customer for this offer.' },
    firstSteps: [
      'Write the offer as a promise with a price. No ranges, no "starting from".',
      'Make it to five people this week. Out loud, not in a document.',
      'Write down the exact words people use when they say no. That is your next revision.',
    ],
    color: '#e0683f', emoji: '🎤',
  },
  {
    id: 'system', order: 3,
    heading: 'Systems',
    name: 'How it runs',
    question: 'What do I run this on so it works without me holding it together?',
    summary: 'The offer sells. Now it needs somewhere to live, a way to take money, and a way to deliver twice as often without twice the work.',
    criteria: [
      { id: 's1', label: 'I have a page that explains and sells the offer on its own' },
      { id: 's2', label: 'Someone can pay me without me sending bank details by hand' },
      { id: 's3', label: 'I know what happens automatically after they pay' },
      { id: 's4', label: 'I have delivered the same way more than once' },
    ],
    gate: { metric: 'customers', value: 5, label: 'At least five paying customers, so the system has been tested by reality.' },
    firstSteps: [
      'Build the page. One offer, one promise, one button.',
      'Put a real payment link on it and buy from yourself to check the whole path.',
      'Write down every step you do by hand after a sale. That list is your automation queue.',
    ],
    color: '#6b78e8', emoji: '⚙️',
  },
  {
    id: 'reach', order: 4,
    heading: 'Growth',
    name: 'How more people find you',
    question: 'How do I get in front of far more of the right people?',
    summary: 'Only worth spending on once the offer converts and the system holds. Traffic on top of a leak is expensive.',
    criteria: [
      { id: 'r1', label: 'I know what one customer is worth to me' },
      { id: 'r2', label: 'I know where my best customers have come from so far' },
      { id: 'r3', label: 'I am publishing consistently, not occasionally' },
      { id: 'r4', label: 'I have spent money on reach and can say what it returned' },
    ],
    gate: { metric: 'customers', value: 15, label: 'At least fifteen paying customers, so there is a pattern to scale rather than a hope.' },
    firstSteps: [
      'Work out what a customer is worth over a year. That number sets what you can spend.',
      'Pick ONE channel and run it properly for 90 days before judging it.',
      'Track where every enquiry came from. Guessing is how ad budgets disappear.',
    ],
    color: '#1f8a5b', emoji: '🚀',
  },
] as const

export function level(id: LevelId): JourneyLevel {
  const found = LEVELS.find(l => l.id === id)
  if (!found) throw new Error(`Unknown level: ${id}`)
  return found
}

export interface LevelProgress {
    checked: string[]
    customers?: number
  revenue?: number
    unlockedByCoach?: boolean
}

export interface LevelStatus {
  id: LevelId
    score: number
  criteriaMet: boolean
  gateMet: boolean
    passed: boolean
    blockers: string[]
}

const PASS_SCORE = 75

export function statusFor(l: JourneyLevel, p: LevelProgress | undefined): LevelStatus {
  const prog: LevelProgress = p ?? { checked: [] }
  const met = l.criteria.filter(c => prog.checked.includes(c.id)).length
  const score = l.criteria.length ? Math.round((met / l.criteria.length) * 100) : 0
  const criteriaMet = score >= PASS_SCORE

  const gateMet =
    l.gate.metric === 'none' ? true
    : l.gate.metric === 'customers' ? (prog.customers ?? 0) >= l.gate.value
    : (prog.revenue ?? 0) >= l.gate.value

  const blockers: string[] = []
  if (!criteriaMet) {
    const need = Math.ceil((PASS_SCORE / 100) * l.criteria.length) - met
    blockers.push(`Tick ${need} more of the statements below, honestly.`)
  }
  if (!gateMet) blockers.push(l.gate.label)

  const passed = prog.unlockedByCoach === true || (criteriaMet && gateMet)

  return { id: l.id, score, criteriaMet, gateMet, passed, blockers: passed ? [] : blockers }
}

export function currentLevel(progress: Record<string, LevelProgress> | undefined): JourneyLevel {
  for (const l of LEVELS) {
    if (!statusFor(l, progress?.[l.id]).passed) return l
  }
  return LEVELS[LEVELS.length - 1]
}

export const AREAS: readonly JourneyLevel[] = LEVELS

export function matchArea(title: string): LevelId | null {
  const t = (title || '').toLowerCase()
  if (!t.trim()) return null
  const table: [LevelId, string[]][] = [
    ['reach',  ['reach', 'advertis', 'adverten', 'publicidad', 'propaganda', 'reclame',
                'marketing', 'ads ', ' ads', 'anuncio', 'traffic',
                'social media', 'campaign', 'campaña', 'kampanja']],
    ['system', ['system', 'sistema', 'systeem', 'automat', 'funnel', 'website', 'web site',
                'dashboard', 'digital', 'order', 'financ', 'finansa', 'proces', 'workflow',
                'tech', 'crm', 'tabel']],
    ['offer',  ['offer', 'oferta', 'offerta', 'aanbod', 'aanbieding', 'pricing', 'price',
                'precio', 'prijs', 'package', 'pakket', 'paket']],
    ['niche',  ['niche', 'nicho', 'audienc', 'audience', 'publiek', 'doelgroep', 'target',
                'ideal client', 'avatar', 'positioning', 'posicion']],
  ]
  for (const [id, keys] of table) {
    if (keys.some(k => t.includes(k))) return id
  }
  return null
}

export function areaLabel(id: LevelId): string {
  const l = level(id)
  return `${l.heading} · ${l.name}`
}
