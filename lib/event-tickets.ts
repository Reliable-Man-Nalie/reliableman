export interface EventTicketTier {
  id: 'early' | 'general' | 'vip'
  name: string

  price: number

  compareAt?: number
  blurb: string
  perks: string[]

  cap?: number

  closesOn?: string
  featured?: boolean
}

export const EXAMPLE_TIERS: EventTicketTier[] = [
  {
    id: 'early',
    name: 'Early bird',
    price: 39,
    compareAt: 50,
    blurb: 'The first seats, at the lowest price they will be.',
    perks: ['Full live session', 'Workbook and replay'],
    cap: 20,
    closesOn: '2026-08-24',
  },
  {
    id: 'general',
    name: 'General',
    price: 50,
    blurb: 'A seat in the room.',
    perks: ['Full live session', 'Workbook and replay'],
    featured: true,
  },
  {
    id: 'vip',
    name: 'VIP',
    price: 97,
    blurb: 'The room, plus 30 minutes with me afterwards.',
    perks: [
      'Everything in General',
      'A 30 minute group Q&A after the session',
      'Front-row seating',
      'Your question answered first',
    ],
    cap: 10,
  },
]

const TIERS_BY_EVENT: Record<string, EventTicketTier[]> = {}

export function ticketsFor(eventId: string): EventTicketTier[] {
  return TIERS_BY_EVENT[eventId] ?? []
}

export function getEventTicket(eventId: string, id: string): EventTicketTier | null {
  return ticketsFor(eventId).find(t => t.id === id) ?? null
}

export function isTicketOpen(t: EventTicketTier, today = new Date()): boolean {
  if (!t.closesOn) return true

  const end = new Date(`${t.closesOn}T23:59:59`)
  return today.getTime() <= end.getTime()
}

export function openTickets(eventId: string, today = new Date()): EventTicketTier[] {
  return ticketsFor(eventId).filter(t => isTicketOpen(t, today))
}
