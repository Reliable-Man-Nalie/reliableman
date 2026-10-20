'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BusinessAccount } from '@/lib/business-accounts'
import type { Task, Status } from '../tasks/task-shared'
import { AREAS, matchArea, areaLabel, type LevelId } from '@/lib/business-areas'

export type ClientPlan = {
  email: string
  name: string

  fromPortal?: boolean
  ninetyDay: { id: string; title: string; targetDate?: string } | null

  objectives: { id: string; title: string; area?: string; done: boolean }[]
  projects: { id: string; objectiveId: string; title: string; done: boolean }[]
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--os-bad)', high: '#ea580c', medium: '#ca8a04', low: 'var(--os-text-faint)',
}

function areaOf(o: { area?: string; title: string }): LevelId | null {
  const stored = (o.area ?? '') as LevelId
  if (stored && AREAS.some(a => a.id === stored)) return stored
  return matchArea(o.title)
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function dueInfo(iso: string): { text: string; overdue: boolean } | null {
  if (!iso) return null
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const diff = Math.floor((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  if (diff < 0) return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: true }
  if (diff === 0) return { text: 'Today', overdue: false }
  if (diff === 1) return { text: 'Tomorrow', overdue: false }
  return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false }
}

type Props = {
  accounts: BusinessAccount[]
  plans: Record<string, ClientPlan>
  tasks: Task[]
  loading: boolean
  onEditTask: (t: Task) => void
  onSetStatus: (t: Task, s: Status) => void
  onAddTask: (preset: { accountId?: string; projectId?: string; parentId?: string }) => void

  onQuickAdd: (title: string, preset: { accountId?: string; projectId?: string; parentId?: string }) => void

  onAddPlanRow?: (accountId: string, kind: 'ninety_day' | 'step' | 'project', title: string, parentId?: string, area?: LevelId) => Promise<string | null>

  onUpdatePlanRow?: (id: string, title: string) => Promise<void>
}

function InlineAdd({ label, onAdd }: { label: string; onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--os-accent)' }}
      >
        + {label}
      </button>
    )
  }
  const submit = () => { const t = text.trim(); if (t) { onAdd(t); setText(''); setOpen(false) } }
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } if (e.key === 'Escape') { setOpen(false); setText('') } }}
        placeholder={label}
        autoFocus
        style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--os-line)', fontSize: 13, color: 'var(--os-text)', background: 'var(--os-card)', outline: 'none' }}
      />
      <button onClick={submit} className="os-btn os-btn-primary os-btn-sm" style={{ padding: '6px 12px', fontSize: 12 }}>Add</button>
      <button onClick={() => { setOpen(false); setText('') }} className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '6px 10px', fontSize: 12 }}>Cancel</button>
    </div>
  )
}

function TaskRow({ task, subtasks, accountId, projectId, onEditTask, onSetStatus, onQuickAdd }: {
  task: Task
  subtasks: Task[]
  accountId?: string
  projectId: string
  onEditTask: (t: Task) => void
  onSetStatus: (t: Task, s: Status) => void
  onQuickAdd: (title: string, preset: { accountId?: string; projectId?: string; parentId?: string }) => void
}) {
  const due = dueInfo(task.dueDate)
  const isClient = task.owner === 'client'
  const ownerLabel = isClient ? 'them' : task.owner === 'team' ? 'team' : 'me'
  const ownerTone = isClient
    ? { bg: 'var(--os-warn-soft)', fg: 'var(--os-warn)' }
    : task.owner === 'team'
      ? { bg: 'var(--os-good-soft)', fg: 'var(--os-good)' }
      : { bg: 'var(--os-chip, rgba(124,58,237,.12))', fg: 'var(--os-accent)' }
  const openSubs = subtasks.filter(s => s.status !== 'done').length

  return (
    <div style={{ borderTop: '1px solid var(--os-line)' }}>
      <div
        className="os-action-row"
        onClick={() => onEditTask(task)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', margin: '0 -8px', borderRadius: 8, cursor: 'pointer' }}
      >
        <button
          onClick={e => { e.stopPropagation(); onSetStatus(task, task.status === 'done' ? 'todo' : 'done') }}
          title="Mark done"
          style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid var(--os-line)', background: 'transparent', cursor: 'pointer', flexShrink: 0, padding: 0 }}
        />
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[task.priority] ?? 'var(--os-text-faint)', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </span>
        {subtasks.length > 0 && (
          <span title="Subtasks done" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--os-text-faint)', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {subtasks.length - openSubs}/{subtasks.length}
          </span>
        )}
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase',
          borderRadius: 999, padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap',
          background: ownerTone.bg, color: ownerTone.fg,
        }}>
          {ownerLabel}
        </span>
        {due && (
          <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, color: due.overdue ? 'var(--os-bad)' : 'var(--os-text-faint)' }}>
            {due.overdue ? `${due.text} · late` : due.text}
          </span>
        )}
      </div>

      {subtasks.map(sub => {
        const sd = dueInfo(sub.dueDate)
        const done = sub.status === 'done'
        return (
          <div
            key={sub.id}
            className="os-action-row"
            onClick={() => onEditTask(sub)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 30px', margin: '0 -8px', borderRadius: 8, cursor: 'pointer' }}
          >
            <button
              onClick={e => { e.stopPropagation(); onSetStatus(sub, done ? 'todo' : 'done') }}
              title="Mark done"
              style={{
                width: 12, height: 12, borderRadius: '50%', flexShrink: 0, padding: 0, cursor: 'pointer',
                border: `2px solid ${done ? 'var(--os-good)' : 'var(--os-line)'}`,
                background: done ? 'var(--os-good)' : 'transparent',
              }}
            />
            <span style={{
              flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600,
              color: done ? 'var(--os-text-faint)' : 'var(--os-text)',
              textDecoration: done ? 'line-through' : 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sub.title}
            </span>
            {sd && !done && (
              <span style={{ fontSize: 10.5, fontWeight: 700, flexShrink: 0, color: sd.overdue ? 'var(--os-bad)' : 'var(--os-text-faint)' }}>{sd.text}</span>
            )}
          </div>
        )
      })}

      <div style={{ paddingLeft: 30 }}>
        <InlineAdd
          label="Add a subtask"
          onAdd={title => onQuickAdd(title, { accountId, projectId, parentId: task.id })}
        />
      </div>
    </div>
  )
}

export default function ClientPlanView({ accounts, plans, tasks, loading, onEditTask, onSetStatus, onAddTask, onQuickAdd, onAddPlanRow, onUpdatePlanRow }: Props) {

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const byClient = new Map<string, { name: string; email: string; businesses: BusinessAccount[] }>()
  for (const a of accounts) {
    const key = (a.clientEmail || a.clientName || 'unknown').toLowerCase()
    const g = byClient.get(key)
    if (g) g.businesses.push(a)
    else byClient.set(key, { name: a.clientName || a.clientEmail, email: a.clientEmail, businesses: [a] })
  }

  const groups = [...byClient.values()]
  if (groups.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(g => {
        const plan = plans[g.email.toLowerCase()]

        const acctId = g.businesses[0]?.id
        const authorable = !!onAddPlanRow && !!acctId && !plan?.fromPortal
        const bizIds = new Set(g.businesses.map(b => b.id))

        const planProjectIds = new Set((plan?.projects ?? []).map(pr => pr.id))
        const theirTasks = tasks.filter(t =>
          (t.accountId && bizIds.has(t.accountId)) ||
          (!!t.projectId && planProjectIds.has(t.projectId)),
        )
        const openCount = theirTasks.filter(t => t.status !== 'done').length
        const cardKey = g.email || g.name
        const isOpen = expanded.has(cardKey)

        return (
          <section key={cardKey} className="os-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(160deg,#f7cf73,#eaa92e)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13.5, fontWeight: 800, color: '#3a2600',
              }}>{initials(g.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 15.5, color: 'var(--os-text)' }}>
                  {g.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>
                  {g.businesses.map(b => b.name).join(' · ')} · {openCount} open
                </div>
              </div>
              {g.email && (
                <Link
                  href={`/os/contacts/${encodeURIComponent(g.email)}`}
                  className="os-btn os-btn-ghost os-btn-sm"
                  style={{ padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}
                  title="Open their contact page"
                >
                  Contact
                </Link>
              )}
              <button
                onClick={() => toggle(cardKey)}
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Collapse projects' : 'Expand projects'}
                title={isOpen ? 'Collapse projects' : 'Expand projects'}
                style={{
                  width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 13,
                }}
              >
                {isOpen ? '▼' : '▶'}
              </button>
            </div>

            {loading && !plan ? (
              <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>Loading their plan…</div>
            ) : !plan?.ninetyDay ? (
              <div style={{ fontSize: 13, color: 'var(--os-text-faint)', lineHeight: 1.6, background: 'var(--os-card-alt, rgba(124,58,237,.04))', borderRadius: 10, padding: '10px 12px' }}>
                {authorable ? (
                  <>
                    No 90-day goal yet. This client has no portal, so you set the plan here.
                    <InlineAdd label="Set the 90-day goal" onAdd={t => onAddPlanRow!(acctId!, 'ninety_day', t)} />
                  </>
                ) : (
                  <>No 90-day goal set yet. They set it in their portal, with you, and the objectives and projects hang off it.</>
                )}
              </div>
            ) : (
              <>
                <div style={{ background: 'var(--os-card-alt, rgba(124,58,237,.04))', borderLeft: '3px solid var(--os-accent)', borderRadius: '3px 10px 10px 3px', padding: '10px 13px', marginBottom: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--os-accent)', marginBottom: 3 }}>
                    90-day goal
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--os-text)', lineHeight: 1.4 }}>
                    {plan.ninetyDay.title}
                  </div>
                </div>

                {isOpen && (() => {
                  const byArea = new Map<LevelId, typeof plan.objectives>()
                  const unsorted: typeof plan.objectives = []
                  for (const o of plan.objectives) {
                    const a = areaOf(o)
                    if (!a) { unsorted.push(o); continue }
                    byArea.set(a, [...(byArea.get(a) ?? []), o])
                  }

                  const addProject = async (areaId: LevelId, title: string) => {
                    if (!onAddPlanRow || !acctId || !plan.ninetyDay) return

                    let objId = byArea.get(areaId)?.[0]?.id

                    if (!objId) objId = (await onAddPlanRow(acctId, 'step', areaLabel(areaId), plan.ninetyDay.id, areaId)) ?? undefined
                    if (objId) await onAddPlanRow(acctId, 'project', title, objId)
                  }

                  const setObjective = async (areaId: LevelId, title: string) => {
                    if (!onAddPlanRow || !acctId || !plan.ninetyDay) return
                    const existing = byArea.get(areaId)?.[0]
                    if (existing && onUpdatePlanRow) await onUpdatePlanRow(existing.id, title)
                    else await onAddPlanRow(acctId, 'step', title, plan.ninetyDay.id, areaId)
                  }

                  const renderProjects = (objs: typeof plan.objectives) =>
                    objs.flatMap(o => plan.projects.filter(pr => pr.objectiveId === o.id)).map(pr => {
                      const all = theirTasks.filter(t => t.projectId === pr.id && !t.parentId)
                      const open = all.filter(t => t.status !== 'done')
                      const theirs = open.filter(t => t.owner === 'client')
                      const ours = open.filter(t => t.owner !== 'client')
                      const team = ours.filter(t => t.owner === 'team').length
                      return (
                        <div key={pr.id} style={{ marginLeft: 4, paddingLeft: 14, borderLeft: '2px solid var(--os-line)', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--os-text)' }}>{pr.title}</span>
                            <span style={{ fontSize: 11, color: 'var(--os-text-faint)' }}>
                              {theirs.length} theirs · {ours.length - team} mine{team > 0 ? ` · ${team} team` : ''}
                            </span>
                          </div>

                          {open.length === 0 && (
                            <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)', padding: '3px 0' }}>Nothing open.</div>
                          )}

                          {[...ours, ...theirs].map(t => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              subtasks={theirTasks.filter(x => x.parentId === t.id)}
                              accountId={g.businesses[0]?.id}
                              projectId={pr.id}
                              onEditTask={onEditTask}
                              onSetStatus={onSetStatus}
                              onQuickAdd={onQuickAdd}
                            />
                          ))}

                          <InlineAdd
                            label="Add a task"
                            onAdd={title => onQuickAdd(title, { accountId: g.businesses[0]?.id, projectId: pr.id })}
                          />
                        </div>
                      )
                    })

                  return (
                    <>
                      {AREAS.map(L => {
                        const objs = byArea.get(L.id) ?? []
                        const projectCount = objs.reduce((n, o) => n + plan.projects.filter(pr => pr.objectiveId === o.id).length, 0)
                        return (
                          <div key={L.id} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: L.color, flexShrink: 0 }} />
                              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--os-text)' }}>{L.heading}</span>
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--os-text-faint)' }}>{L.name}</span>
                              <span style={{ fontSize: 11, color: 'var(--os-text-faint)' }}>
                                {projectCount === 0 ? 'no projects' : `${projectCount} project${projectCount === 1 ? '' : 's'}`}
                              </span>
                            </div>

                            {(() => {
                              const obj = objs[0] ?? null
                              const written = obj && obj.title.trim() !== areaLabel(L.id)
                              return (
                                <div style={{ marginLeft: 4, paddingLeft: 14, marginBottom: 7 }}>
                                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--os-text-faint)', marginBottom: 2 }}>
                                    Objective
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: written ? 700 : 500, color: written ? 'var(--os-text)' : 'var(--os-text-faint)', lineHeight: 1.45 }}>
                                    {written ? obj!.title : 'Not set yet. What has to be true here in 90 days?'}
                                  </div>
                                  {authorable && (
                                    <InlineAdd
                                      label={written ? 'Change the objective' : 'Set the objective'}
                                      onAdd={t => { void setObjective(L.id, t) }}
                                    />
                                  )}
                                </div>
                              )
                            })()}

                            {authorable && (
                              <div style={{ marginLeft: 4, paddingLeft: 14 }}>
                                <InlineAdd label="Add a project" onAdd={t => { void addProject(L.id, t) }} />
                              </div>
                            )}

                            {renderProjects(objs)}
                          </div>
                        )
                      })}

                      {unsorted.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--os-line)' }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--os-text-faint)', marginBottom: 6 }}>
                            Inbox
                          </div>
                          {unsorted.map(o => (
                            <div key={o.id} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--os-text)', marginBottom: 4 }}>{o.title}</div>
                              {renderProjects([o])}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </>
            )}

            {isOpen && (() => {
              const loose = theirTasks.filter(t => !t.projectId && t.status !== 'done' && !t.parentId)
              if (loose.length === 0) return null
              return (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--os-line)' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--os-text-faint)', marginBottom: 4 }}>
                    Not under an objective
                  </div>
                  {loose.map(t => {
                    const due = dueInfo(t.dueDate)
                    return (
                      <div key={t.id} className="os-action-row" onClick={() => onEditTask(t)}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', margin: '0 -8px', borderRadius: 8, cursor: 'pointer' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[t.priority] ?? 'var(--os-text-faint)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        {due && <span style={{ fontSize: 11.5, fontWeight: 700, flexShrink: 0, color: due.overdue ? 'var(--os-bad)' : 'var(--os-text-faint)' }}>{due.text}</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </section>
        )
      })}
    </div>
  )
}
