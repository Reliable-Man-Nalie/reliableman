import type { LevelId } from './business-areas'

export interface Objective {
  id: string
  title: string

  keyResult?: string

  area?: LevelId

  dueDate?: string

  completedAt?: string
  sortOrder?: number
  createdAt: string
}

export interface ProgressTask {
  id: string
  status: string
  parentId?: string
  objectiveId?: string
}

export function objectiveOf(t: ProgressTask, byId: Map<string, ProgressTask>): string | undefined {
  if (t.objectiveId) return t.objectiveId
  if (t.parentId) return byId.get(t.parentId)?.objectiveId
  return undefined
}

export interface Progress {
  done: number
  total: number

  pct: number

  complete: boolean
}

export function progressFor(objectiveId: string, tasks: ProgressTask[]): Progress {
  const byId = new Map(tasks.map(t => [t.id, t]))
  let done = 0
  let total = 0
  for (const t of tasks) {
    if (objectiveOf(t, byId) !== objectiveId) continue
    total++
    if (t.status === 'done') done++
  }
  const pct = total ? Math.round((done / total) * 100) : 0
  return { done, total, pct, complete: total > 0 && done === total }
}

export function isGraduated(o: Pick<Objective, 'completedAt'>): boolean {
  return !!o.completedAt
}

export function byObjectiveOrder(a: Objective, b: Objective): number {
  const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER
  const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER
  if (sa !== sb) return sa - sb
  return a.createdAt.localeCompare(b.createdAt)
}

export function laneFor(objectives: Objective[], area: LevelId | undefined, oneAtATime = false): Objective[] {
  const active = objectives
    .filter(o => !isGraduated(o) && (o.area ?? undefined) === area)
    .sort(byObjectiveOrder)
  return oneAtATime ? active.slice(0, 1) : active
}

export function graduated(objectives: Objective[]): Objective[] {
  return objectives
    .filter(isGraduated)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
}

export function daysUntil(dueDate: string | undefined, now = new Date()): number | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null
  const [y, m, d] = dueDate.split('-').map(Number)
  const end = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

export function objectiveUid() {
  return 'obj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const AREA_IDS = new Set(['niche', 'offer', 'system', 'reach'])

export function objectiveToRow(o: Objective) {
  return {
    id: o.id,
    title: o.title,
    key_result: o.keyResult || null,
    area: o.area || null,
    due_date: o.dueDate || null,
    completed_at: o.completedAt || null,
    sort_order: typeof o.sortOrder === 'number' ? o.sortOrder : null,
    created_at: o.createdAt,
  }
}

export function rowToObjective(r: Record<string, unknown>): Objective {
  const area = typeof r.area === 'string' && AREA_IDS.has(r.area) ? (r.area as LevelId) : undefined
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    keyResult: (r.key_result as string) || undefined,
    area,
    dueDate: (r.due_date as string) || undefined,
    completedAt: (r.completed_at as string) || undefined,
    sortOrder: typeof r.sort_order === 'number' ? r.sort_order : undefined,
    createdAt: (r.created_at as string) || new Date(0).toISOString(),
  }
}
