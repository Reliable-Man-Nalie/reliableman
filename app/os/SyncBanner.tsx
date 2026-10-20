'use client'

import { useSyncExternalStore, useState } from 'react'
import { subscribeSync, failedWrites, explainFailure } from '@/lib/sync-status'
import { retryFailedWrites } from '@/lib/crm-store'
import { retryTaskSync } from './tasks/task-shared'
import { retryObjectivesSync } from '@/lib/objectives-store'
import { retryCompanyGoalSync } from '@/lib/company-goal'

const emptySnapshot: ReturnType<typeof failedWrites> = []

export default function SyncBanner() {
  const fails = useSyncExternalStore(
    subscribeSync,
    failedWrites,
    () => emptySnapshot,
  )
  const [retrying, setRetrying] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  if (fails.length === 0) return null

  const reason = explainFailure(fails[0].reason)

  async function retry() {
    setRetrying(true)
    setResult(null)

    const needsTasks = fails.some(f => f.key === 'tasks:all')

    const needsObjectives = fails.some(f => f.key === 'objectives:all')
    const needsGoal = fails.some(f => f.key === 'company-goal')
    const [left, tasksOk, objectivesOk, goalOk] = await Promise.all([
      retryFailedWrites(),
      needsTasks ? retryTaskSync() : Promise.resolve(true),
      needsObjectives ? retryObjectivesSync() : Promise.resolve(true),
      needsGoal ? retryCompanyGoalSync() : Promise.resolve(true),
    ])
    setRetrying(false)
    if (!tasksOk) { setResult('The task board still could not save.'); return }
    if (!objectivesOk) { setResult('The objectives still could not save.'); return }
    if (!goalOk) { setResult('The 90-day goal still could not save.'); return }

    if (left > 0) setResult(`${left} still could not save.`)
  }

  return (
    <div
      role="alert"

      className="os-sync-banner"
      style={{
        position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 400,
        maxWidth: 560, margin: '0 auto',

        background: 'linear-gradient(var(--os-bad-soft), var(--os-bad-soft)), var(--os-base-2, #fff)', border: '1.5px solid var(--os-bad)',
        borderRadius: 12, padding: '13px 16px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        boxShadow: '0 12px 32px rgba(0,0,0,.18)',
      }}
    >
      <span style={{ fontSize: 17, flexShrink: 0 }} aria-hidden>⚠️</span>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--os-bad)' }}>
          {fails.length === 1 ? '1 change did not save' : `${fails.length} changes did not save`}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--os-text)' }}>
          {result ?? reason} Your work is still on this screen.
        </div>
      </div>
      <button
        onClick={retry}
        disabled={retrying}
        className="os-btn os-btn-sm"
        style={{
          background: 'var(--os-bad)', color: '#fff', border: 'none',
          padding: '8px 16px', fontSize: 12.5, fontWeight: 700,
          borderRadius: 8, cursor: retrying ? 'default' : 'pointer',
          opacity: retrying ? 0.6 : 1, flexShrink: 0,
        }}
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}
