export type ClientDeliveryStage =
  | 'Onboarding'
  | 'First call'
  | 'Coaching'
  | 'Setup'
  | 'Launch'
  | 'Retainer'
  | 'In group program'
  | 'Complete'

export const CLIENT_DELIVERY_STAGES: ClientDeliveryStage[] = [
  'Onboarding', 'First call', 'Coaching', 'Setup', 'Launch', 'Retainer', 'In group program', 'Complete',
]

export const CLIENT_DELIVERY_HINTS: Record<ClientDeliveryStage, string> = {
  'Onboarding': 'Signed. Getting their access, intake and paperwork in place.',
  'First call': 'The first session is booked or just happened.',
  'Coaching': 'Sessions are running. The core of the engagement.',
  'Setup': 'The systems they need are being put in place.',
  'Launch': 'It is live and they are using it.',
  'Retainer': 'Ongoing month to month.',
  'In group program': 'In the group program rather than one to one.',
  'Complete': 'The engagement finished.',
}

export function normalizeDeliveryStage(v?: string | null): ClientDeliveryStage {
  if (!v) return 'Onboarding'
  if ((CLIENT_DELIVERY_STAGES as string[]).includes(v)) return v as ClientDeliveryStage
  return 'Onboarding'
}

export interface ClientRecord {
  id: string
  dealId?: string
  name: string
  email: string
  phone?: string
  company?: string
  program: string
  status: 'active' | 'paused' | 'completed'
  deliveryStage?: ClientDeliveryStage
  startedAt: string
  coachNote?: string
  monthlyAmount?: number
  currency?: 'USD' | 'EUR' | 'AWG'
  photoUrl?: string
  planName?: string
  website?: string
  instagram?: string
  role?: string
  location?: string
  createdAt: string
}

const CLIENTS_KEY = 'bos_clients'

function uid(): string {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

function load(): ClientRecord[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(CLIENTS_KEY) ?? '[]') } catch { return [] }
}

function save(rows: ClientRecord[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(rows))
}

function write(op: 'upsert' | 'delete', payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  fetch('/api/os-write', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, table: 'clients', ...payload }),
  }).catch(() => {})
}

function toRow(c: ClientRecord): Record<string, unknown> {
  return {
    id: c.id, deal_id: c.dealId ?? null, name: c.name, email: c.email,
    phone: c.phone ?? null, company: c.company ?? null, program: c.program ?? null,
    status: c.status ?? 'active', delivery_stage: c.deliveryStage ?? null,
    started_at: c.startedAt ?? null, coach_note: c.coachNote ?? null,
    monthly_amount: c.monthlyAmount ?? null, currency: c.currency ?? null,
    photo_url: c.photoUrl ?? null, plan_name: c.planName ?? null,
    website: c.website ?? null, instagram: c.instagram ?? null,
    role: c.role ?? null, location: c.location ?? null,
    created_at: c.createdAt,
  }
}

function fromRow(r: Record<string, unknown>): ClientRecord {
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return {
    id: String(r.id), dealId: s(r.deal_id), name: s(r.name) ?? '', email: s(r.email) ?? '',
    phone: s(r.phone), company: s(r.company), program: s(r.program) ?? '',
    status: (s(r.status) as ClientRecord['status']) ?? 'active',
    deliveryStage: normalizeDeliveryStage(s(r.delivery_stage)),
    startedAt: s(r.started_at) ?? s(r.created_at) ?? new Date().toISOString(),
    coachNote: s(r.coach_note),
    monthlyAmount: typeof r.monthly_amount === 'number' ? r.monthly_amount : r.monthly_amount ? Number(r.monthly_amount) : undefined,
    currency: s(r.currency) as ClientRecord['currency'], photoUrl: s(r.photo_url), planName: s(r.plan_name),
    website: s(r.website), instagram: s(r.instagram), role: s(r.role), location: s(r.location),
    createdAt: s(r.created_at) ?? new Date().toISOString(),
  }
}

export function getClientRecords(): ClientRecord[] {
  return load()
}

export function getClientRecord(id: string): ClientRecord | null {
  return load().find(c => c.id === id) ?? null
}

export function createClientRecord(data: Omit<ClientRecord, 'id' | 'createdAt'>): ClientRecord {
  const client: ClientRecord = { ...data, id: 'cl-' + uid(), createdAt: new Date().toISOString() }
  save([...load(), client])
  write('upsert', { row: toRow(client) })
  return client
}

export function updateClientRecord(id: string, patch: Partial<ClientRecord>): void {
  const updated = load().map(c => (c.id === id ? { ...c, ...patch } : c))
  save(updated)
  const row = updated.find(c => c.id === id)
  if (row) write('upsert', { row: toRow(row) })
}

export function deleteClientRecord(id: string): void {
  save(load().filter(c => c.id !== id))
  write('delete', { id })
}

export async function hydrateClients(): Promise<ClientRecord[] | null> {
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch('/api/os-data?parts=clients', { cache: 'no-store' })
    const data = await res.json()
    if (!data?.ok || !Array.isArray(data.clients)) return null
    const rows = (data.clients as Record<string, unknown>[]).map(fromRow)
    save(rows)
    return rows
  } catch {
    return null
  }
}
