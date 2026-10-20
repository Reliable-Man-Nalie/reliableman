'use client'

import type { BusinessAccount } from '@/lib/business-accounts'

type Priority = 'urgent' | 'high' | 'medium' | 'low'
type Status = 'todo' | 'in_progress' | 'done'

export interface OverviewTask {
  id: string
  title: string
  description: string
  status: Status
  priority: Priority
  assignee: string
  dueDate: string
  createdAt: string
  accountId?: string
}

const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: 'var(--os-bad)',
  high: '#ea580c',
  medium: '#ca8a04',
  low: 'var(--os-text-faint)',
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function dueInfo(iso: string): { text: string; overdue: boolean } | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const diff = Math.floor((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  if (diff < 0) return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: true }
  if (diff === 0) return { text: 'Today', overdue: false }
  if (diff === 1) return { text: 'Tomorrow', overdue: false }
  return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false }
}

const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

function sortTasks(a: OverviewTask, b: OverviewTask) {
  const da = dueInfo(a.dueDate), db = dueInfo(b.dueDate)
  const oa = da?.overdue ? 0 : 1, ob = db?.overdue ? 0 : 1
  if (oa !== ob) return oa - ob
  const ta = a.dueDate || '9999-12-31', tb = b.dueDate || '9999-12-31'
  if (ta !== tb) return ta < tb ? -1 : 1
  return RANK[a.priority] - RANK[b.priority]
}

type ClientGroup = {
  key: string
  clientName: string
  clientEmail: string
  businesses: BusinessAccount[]
}

type Props = {
  tasks: OverviewTask[]
  accounts: BusinessAccount[]
  onEditTask: (t: OverviewTask) => void
  onToggleDone: (t: OverviewTask) => void
  onAddTask: (accountId?: string) => void
  onEditBusiness: (a: BusinessAccount) => void
}

export default function ClientTaskOverview({ tasks, accounts, onEditTask, onToggleDone, onAddTask, onEditBusiness }: Props) {

  const groups = new Map<string, ClientGroup>()
  for (const a of accounts) {
    const key = (a.clientEmail || a.clientName || 'unassigned').toLowerCase()
    const g = groups.get(key)
    if (g) {
      g.businesses.push(a)
      if (!g.clientName && a.clientName) g.clientName = a.clientName
    } else {
      groups.set(key, { key, clientName: a.clientName, clientEmail: a.clientEmail, businesses: [a] })
    }
  }

  const byAccount = new Map<string, OverviewTask[]>()
  for (const t of tasks) {
    if (!t.accountId) continue
    const list = byAccount.get(t.accountId) ?? []
    list.push(t)
    byAccount.set(t.accountId, list)
  }
  const internal = tasks.filter(t => !t.accountId || !accounts.some(a => a.id === t.accountId))

  const openCount = (g: ClientGroup) =>
    g.businesses.reduce((n, b) => n + (byAccount.get(b.id) ?? []).filter(t => t.status !== 'done').length, 0)
  const sorted = [...groups.values()].sort((a, b) => openCount(b) - openCount(a) || a.clientName.localeCompare(b.clientName))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sorted.map(g => (
        <ClientRow key={g.key} group={g} byAccount={byAccount}
          onEditTask={onEditTask} onToggleDone={onToggleDone} onAddTask={onAddTask} onEditBusiness={onEditBusiness} />
      ))}

      {internal.length > 0 && (
        <section className="os-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(160deg,#212A4D,#3b2a6d)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#f4efe6',
            }}>Internal</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--os-text)' }}>Internal</div>
              <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>Tasks with no business attached</div>
            </div>
            <button onClick={() => onAddTask()} className="os-btn os-btn-ghost os-btn-sm">+ Task</button>
          </div>
          <TaskList tasks={internal} onEditTask={onEditTask} onToggleDone={onToggleDone} />
        </section>
      )}

      {sorted.length === 0 && internal.length === 0 && (
        <div className="os-card" style={{ padding: '28px 24px', fontSize: 13.5, color: 'var(--os-text-faint)' }}>
          No businesses or tasks yet. Businesses appear here automatically when a lead
          fills in their business name on a form, or add one with “+ New business”.
        </div>
      )}
    </div>
  )
}

function ClientRow({ group, byAccount, onEditTask, onToggleDone, onAddTask, onEditBusiness }: {
  group: ClientGroup
  byAccount: Map<string, OverviewTask[]>
} & Omit<Props, 'tasks' | 'accounts'>) {
  const displayName = group.clientName || group.clientEmail || 'Unassigned'
  const totalOpen = group.businesses.reduce((n, b) => n + (byAccount.get(b.id) ?? []).filter(t => t.status !== 'done').length, 0)

  return (
    <section className="os-card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(160deg,#f7cf73,#eaa92e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#3a2600',
        }}>{initials(displayName)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 15.5, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>
            {group.businesses.length} business{group.businesses.length === 1 ? '' : 'es'} · {totalOpen} open task{totalOpen === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 14 }}>
        {group.businesses.map(b => {
          const all = byAccount.get(b.id) ?? []
          const open = all.filter(t => t.status !== 'done')
          const doneCount = all.length - open.length
          return (
            <div key={b.id} style={{ borderLeft: '3px solid var(--os-accent-soft, rgba(124,58,237,.25))', borderRadius: '3px 12px 12px 3px', background: 'var(--os-card-alt, rgba(124,58,237,.04))', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: open.length ? 6 : 0 }}>
                <button
                  onClick={() => onEditBusiness(b)}
                  title="Edit business"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5, color: 'var(--os-text)', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  🏢 {b.name}
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--os-text-faint)', flex: 1 }}>
                  {open.length === 0 ? 'nothing open' : `${open.length} open`}{doneCount > 0 ? ` · ${doneCount} done` : ''}
                </span>
                <button onClick={() => onAddTask(b.id)} className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '4px 10px', fontSize: 11.5 }}>+ Task</button>
              </div>
              <TaskList tasks={open} onEditTask={onEditTask} onToggleDone={onToggleDone} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TaskList({ tasks, onEditTask, onToggleDone }: {
  tasks: OverviewTask[]
  onEditTask: (t: OverviewTask) => void
  onToggleDone: (t: OverviewTask) => void
}) {
  const open = tasks.filter(t => t.status !== 'done').sort(sortTasks)
  if (open.length === 0) return null
  return (
    <div>
      {open.map(t => {
        const due = dueInfo(t.dueDate)
        return (
          <div
            key={t.id}
            className="os-action-row"
            onClick={() => onEditTask(t)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', margin: '0 -8px', borderRadius: 10, cursor: 'pointer', borderTop: '1px solid var(--os-line)' }}
          >
            <button
              onClick={e => { e.stopPropagation(); onToggleDone(t) }}
              title="Mark done"
              style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--os-line)', background: 'transparent', cursor: 'pointer', flexShrink: 0, padding: 0 }}
            />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[t.priority], flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title}
              {t.status === 'in_progress' && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: 'var(--os-accent)', textTransform: 'uppercase', letterSpacing: '.05em' }}>in progress</span>}
            </span>
            {t.assignee && (
              <span title={t.assignee} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--os-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
                {initials(t.assignee)}
              </span>
            )}
            {due && (
              <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: due.overdue ? 'var(--os-bad)' : 'var(--os-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                {due.overdue ? `${due.text} · late` : due.text}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
