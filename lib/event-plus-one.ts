export const MAX_PLUS_ONES = 1

export function plusOneMarker(hostTicketCode: string): string {
  return `[plus-one:${hostTicketCode}]`
}

export type PlusOneInput = { name: string; email: string }

export function readPlusOne(raw: unknown, hostEmail: string): PlusOneInput | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as { name?: unknown; email?: unknown }
  const name = typeof g.name === 'string' ? g.name.trim().slice(0, 120) : ''
  const email = typeof g.email === 'string' ? g.email.trim().toLowerCase().slice(0, 200) : ''
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  if (email === hostEmail.trim().toLowerCase()) return null
  return { name, email }
}

export function parseGuestTickets(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw.split(',').map(s => s.trim()).filter(s => /^TKT-[A-Z0-9]{6}$/.test(s)).slice(0, MAX_PLUS_ONES)
}
