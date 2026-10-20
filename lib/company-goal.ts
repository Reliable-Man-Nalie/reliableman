export interface CompanyGoal {
  id: string
  title: string

  dueDate: string
  createdAt: string
}

const KEY = 'bos_company_goal'

export function daysLeft(dueDate: string): number | null {
  if (!dueDate) return null
  const [y, m, d] = dueDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const end = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

export function getCompanyGoal(): CompanyGoal | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const g = JSON.parse(raw) as CompanyGoal
    return g && typeof g.title === 'string' && g.title ? g : null
  } catch { return null }
}

export function setCompanyGoal(title: string, dueDate?: string): CompanyGoal | null {
  if (typeof window === 'undefined') return null
  const clean = title.trim()
  if (!clean) return null
  const existing = getCompanyGoal()
  const goal: CompanyGoal = {
    id: existing?.id ?? 'cg-' + Date.now().toString(36),
    title: clean,
    dueDate: dueDate || existing?.dueDate || new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  try { localStorage.setItem(KEY, JSON.stringify(goal)) } catch { /* private mode */ }
  void mirror(goal)
  return goal
}

export function clearCompanyGoal() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* private mode */ }
}

async function mirror(goal: CompanyGoal) {
  const key = 'company-goal'
  const { recordWriteStart, recordWriteEnd, recordWriteFailure, recordWriteSuccess } = await import('./sync-status')
  recordWriteStart()
  try {
    const res = await fetch('/api/os/objectives', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: { id: goal.id, title: goal.title, due_date: goal.dueDate, created_at: goal.createdAt } }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || data?.ok !== true) {
      recordWriteFailure({ key, op: 'upsert', table: 'company_goal', payload: { id: goal.id }, reason: String(data?.error ?? res.status) })
      return
    }
    recordWriteSuccess(key)
  } catch (err) {
    recordWriteFailure({ key, op: 'upsert', table: 'company_goal', payload: { id: goal.id }, reason: err instanceof Error ? err.message : 'network error' })
  } finally {
    recordWriteEnd()
  }
}

export async function retryCompanyGoalSync(): Promise<boolean> {
  const g = getCompanyGoal()
  if (!g) return true
  await mirror(g)
  const { failedWrites } = await import('./sync-status')
  return !failedWrites().some(f => f.key === 'company-goal')
}

export async function pullCompanyGoal(): Promise<CompanyGoal | null | undefined> {
  try {
    const { hasUnsyncedWrites } = await import('./sync-status')
    if (hasUnsyncedWrites()) return undefined
    const r = await fetch('/api/os/objectives')
    if (!r.ok) return undefined
    const data = await r.json()
    if (data?.ok !== true || data.goal === undefined) return undefined
    const row = data.goal as Record<string, unknown> | null
    if (!row) return getCompanyGoal()
    const goal: CompanyGoal = {
      id: String(row.id), title: String(row.title ?? ''),
      dueDate: String(row.due_date ?? ''), createdAt: String(row.created_at ?? ''),
    }
    if (!goal.title) return undefined
    try { localStorage.setItem(KEY, JSON.stringify(goal)) } catch { /* private mode */ }
    return goal
  } catch { return undefined }
}
