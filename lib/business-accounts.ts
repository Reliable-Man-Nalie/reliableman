export interface BusinessAccount {
  id: string
  name: string
  clientName: string
  clientEmail: string
  createdAt: string

  source?: 'invoice' | 'manual' | 'derived'

  inProjectFeed?: boolean

  monthlyAmount?: number
  monthlyCurrency?: string
}

export const RETAINER_FLOOR = 400

export function isRetainerAmount(monthly?: number): boolean {
  return typeof monthly === 'number' && monthly >= RETAINER_FLOOR
}

export function inFeed(a: BusinessAccount): boolean {
  if (typeof a.inProjectFeed === 'boolean') return a.inProjectFeed
  return isRetainerAmount(a.monthlyAmount)
}

const KEY = 'bos_business_accounts'

export function accountUid(): string {
  return 'acct-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function getAccounts(): BusinessAccount[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveAccounts(accounts: BusinessAccount[], deletedIds: string[] = []): void {
  localStorage.setItem(KEY, JSON.stringify(accounts))
  syncAccounts(accounts, deletedIds).catch(() => {})
}

export function setAccountsLocal(accounts: BusinessAccount[]): void {
  localStorage.setItem(KEY, JSON.stringify(accounts))
}

async function syncAccounts(accounts: BusinessAccount[], deletedIds: string[]) {
  const rows = accounts.map(a => ({
    id: a.id, name: a.name,
    client_name: a.clientName, client_email: a.clientEmail,
    created_at: a.createdAt, updated_at: new Date().toISOString(),

    source: a.source ?? 'derived',
    in_project_feed: typeof a.inProjectFeed === 'boolean' ? a.inProjectFeed : null,
    monthly_amount: a.monthlyAmount ?? null,
    monthly_currency: a.monthlyCurrency ?? null,
  }))
  await fetch('/api/accounts-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accounts: rows, deletedIds }),
  })
}

type CompanySource = { company?: string | null; name: string; email: string }

export function deriveAccounts(
  existing: BusinessAccount[],
  sources: CompanySource[],
): { merged: BusinessAccount[]; added: BusinessAccount[] } {
  const known = new Set(existing.map(a => a.name.trim().toLowerCase()))
  const added: BusinessAccount[] = []
  for (const s of sources) {
    const name = (s.company ?? '').trim()
    if (!name || known.has(name.toLowerCase())) continue
    known.add(name.toLowerCase())
    added.push({
      id: accountUid(),
      name,
      clientName: s.name?.trim() ?? '',
      clientEmail: s.email?.trim().toLowerCase() ?? '',
      createdAt: new Date().toISOString(),
      source: 'invoice',
    })
  }
  return { merged: added.length ? [...existing, ...added] : existing, added }
}

export function dedupeAccounts(accounts: BusinessAccount[]): {
  merged: BusinessAccount[]
  removedIds: string[]
  remap: Map<string, string>
} {
  const byKey = new Map<string, BusinessAccount>()
  const remap = new Map<string, string>()
  const removedIds: string[] = []
  for (const a of accounts) {
    const key = `${a.name.trim().toLowerCase()}|${a.clientEmail.trim().toLowerCase()}`
    const kept = byKey.get(key)
    if (!kept) { byKey.set(key, a); continue }
    removedIds.push(a.id)
    remap.set(a.id, kept.id)
  }
  return { merged: [...byKey.values()], removedIds, remap }
}

export function rowToAccount(r: Record<string, unknown>): BusinessAccount {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    clientName: String(r.client_name ?? ''),
    clientEmail: String(r.client_email ?? ''),
    createdAt: String(r.created_at ?? ''),

    source: r.source === 'invoice' ? 'invoice' : r.source === 'manual' ? 'manual' : 'derived',
    inProjectFeed: typeof r.in_project_feed === 'boolean' ? r.in_project_feed : undefined,
    monthlyAmount: typeof r.monthly_amount === 'number' ? r.monthly_amount : undefined,
    monthlyCurrency: r.monthly_currency ? String(r.monthly_currency) : undefined,
  }
}
