export type FailedWrite = {
  key: string
  op: 'upsert' | 'delete'
  table: string

  payload: Record<string, unknown> | string
  reason: string
  at: number
}

const failed = new Map<string, FailedWrite>()
const listeners = new Set<() => void>()
let inFlight = 0

let snapshot: FailedWrite[] = []

function rebuild() {
  snapshot = [...failed.values()].sort((a, b) => a.at - b.at)
}

function emit() {
  rebuild()
  for (const l of listeners) l()
}

export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function recordWriteStart() { inFlight++ }
export function recordWriteEnd() { inFlight = Math.max(0, inFlight - 1) }

export function recordWriteFailure(f: Omit<FailedWrite, 'at'>) {
  failed.set(f.key, { ...f, at: Date.now() })
  emit()
}

export function recordWriteSuccess(key: string) {
  if (failed.delete(key)) emit()
}

export function failedWrites(): FailedWrite[] {
  return snapshot
}

export function hasUnsyncedWrites(): boolean {
  return failed.size > 0 || inFlight > 0
}

export function explainFailure(reason: string): string {
  if (reason.includes('401') || reason.toLowerCase().includes('unauthor')) {
    return 'Your admin session expired. Sign in again, then retry.'
  }
  if (reason.includes('500') || reason.toLowerCase().includes('config')) {
    return 'The server could not reach the database.'
  }
  if (reason.toLowerCase().includes('network') || reason.toLowerCase().includes('fetch')) {
    return 'No connection to the server.'
  }
  return reason
}
