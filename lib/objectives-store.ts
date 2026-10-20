import {
  type Objective, objectiveToRow, rowToObjective,
} from './objectives'
import {
  recordWriteStart, recordWriteEnd, recordWriteFailure, recordWriteSuccess,
  hasUnsyncedWrites,
} from './sync-status'

const KEY = 'bos_objectives'

export function loadObjectives(): Objective[] {
  if (typeof window === 'undefined') return []
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(rows) ? rows : []
  } catch { return [] }
}

export function saveObjectives(objectives: Objective[], deletedIds: string[] = []) {
  try { localStorage.setItem(KEY, JSON.stringify(objectives)) } catch { /* private mode */ }
  void syncObjectives(objectives, deletedIds)
}

async function syncObjectives(objectives: Objective[], deletedIds: string[]) {
  const key = 'objectives:all'
  const rows = objectives.map(objectiveToRow)
  recordWriteStart()
  try {
    const res = await fetch('/api/os/objectives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectives: rows, deletedIds }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data || data.ok !== true) {
      recordWriteFailure({
        key, op: 'upsert', table: 'company_objectives',
        payload: { id: 'all', count: rows.length },
        reason: String(data?.error ?? `${res.status} ${res.statusText}`.trim()),
      })
      return
    }
    recordWriteSuccess(key)
  } catch (err) {
    recordWriteFailure({
      key, op: 'upsert', table: 'company_objectives',
      payload: { id: 'all', count: rows.length },
      reason: err instanceof Error ? err.message : 'network error',
    })
  } finally {
    recordWriteEnd()
  }
}

export async function pullObjectives(): Promise<Objective[] | null> {
  if (hasUnsyncedWrites()) return null
  try {
    const r = await fetch('/api/os/objectives')
    if (!r.ok) return null
    const data = await r.json()
    if (data?.ok !== true || !Array.isArray(data.objectives)) return null
    const rows = (data.objectives as Record<string, unknown>[]).map(rowToObjective)
    try { localStorage.setItem(KEY, JSON.stringify(rows)) } catch { /* private mode */ }
    return rows
  } catch { return null }
}

export async function retryObjectivesSync(): Promise<boolean> {
  await syncObjectives(loadObjectives(), [])
  const { failedWrites } = await import('./sync-status')
  return !failedWrites().some(f => f.key === 'objectives:all')
}
