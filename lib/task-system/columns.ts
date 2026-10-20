import { recordWriteStart, recordWriteEnd, recordWriteFailure, recordWriteSuccess } from '@/lib/sync-status'

export type ColumnKind = 'text' | 'longtext' | 'url' | 'number' | 'date'

export const COLUMN_KINDS: { id: ColumnKind; label: string; hint: string }[] = [
  { id: 'text',     label: 'Text',      hint: 'A short line' },
  { id: 'longtext', label: 'Notes',     hint: 'A paragraph, drawer only' },
  { id: 'url',      label: 'Link',      hint: 'Opens in a new tab' },
  { id: 'number',   label: 'Number',    hint: 'Amounts, counts' },
  { id: 'date',     label: 'Date',      hint: 'A day' },
]

export interface TaskColumn {
  id: string
  name: string
  kind: ColumnKind
  sortOrder: number
  createdAt: string
}

const KEY = 'bos_task_columns'

export function columnUid() {
  return 'col-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function loadColumns(): TaskColumn[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? (raw as TaskColumn[]).sort((a, b) => a.sortOrder - b.sortOrder) : []
  } catch { return [] }
}

export function saveColumns(cols: TaskColumn[], deletedIds: string[] = []) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cols))
  void sync(cols, deletedIds)
}

export function safeUrl(raw: string): string | null {
  const v = (raw || '').trim()
  if (!v) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withScheme)
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : null
  } catch { return null }
}

async function sync(cols: TaskColumn[], deletedIds: string[]) {
  const key = 'task_columns:all'
  recordWriteStart()
  try {
    const res = await fetch('/api/task-columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columns: cols.map(c => ({
          id: c.id, name: c.name, kind: c.kind,
          sort_order: c.sortOrder, created_at: c.createdAt,
        })),
        deletedIds,
      }),
    })
    const data = res.ok ? await res.json().catch(() => null) : null
    if (!res.ok || (data && data.ok === false)) {
      recordWriteFailure({
        key, op: 'upsert', table: 'task_columns',
        payload: { id: 'all', count: cols.length },
        reason: String(data?.error ?? data?.detail ?? `${res.status} ${res.statusText}`.trim()),
      })
    } else {
      recordWriteSuccess(key)
    }
  } catch (e) {
    recordWriteFailure({
      key, op: 'upsert', table: 'task_columns',
      payload: { id: 'all', count: cols.length },
      reason: e instanceof Error ? e.message : 'network',
    })
  } finally { recordWriteEnd() }
}

export async function pullColumns(): Promise<TaskColumn[] | null> {
  try {
    const r = await fetch('/api/task-columns')
    if (!r.ok) return null
    const d = await r.json()
    if (!Array.isArray(d?.columns)) return null
    const cols: TaskColumn[] = d.columns.map((c: Record<string, unknown>) => ({
      id: String(c.id),
      name: String(c.name ?? ''),
      kind: (COLUMN_KINDS.some(k => k.id === c.kind) ? c.kind : 'text') as ColumnKind,
      sortOrder: Number(c.sort_order ?? 0),
      createdAt: String(c.created_at ?? new Date().toISOString()),
    })).sort((a: TaskColumn, b: TaskColumn) => a.sortOrder - b.sortOrder)
    if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cols))
    return cols
  } catch { return null }
}
