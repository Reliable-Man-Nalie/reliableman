'use client'

import { useState } from 'react'
import type { BusinessAccount } from '@/lib/business-accounts'
import { AREAS, type LevelId } from '@/lib/business-areas'
import { safeUrl, type TaskColumn } from '@/lib/task-system/columns'
import { DateField, todayLocalISO, nextMondayISO } from '@/components/os/DateField'
import { RichText } from '@/components/os/RichText'
import { SearchSelect } from '@/components/os/SearchSelect'
import { isGraduated, type Objective } from '@/lib/objectives'
import { googleCalendarBlockUrl } from '@/lib/calendar-links'
import { descriptionToText } from '@/lib/task-text'
import { BRAND } from '@/lib/brand'
import {
  recordWriteStart, recordWriteEnd, recordWriteFailure, recordWriteSuccess,
  failedWrites, hasUnsyncedWrites,
} from '@/lib/sync-status'

export type Priority = 'urgent' | 'high' | 'medium' | 'low'
export type Status = 'todo' | 'in_progress' | 'done'

export interface Task {
  id: string
  title: string
  description: string
  status: Status
  priority: Priority
  assignee: string
  dueDate: string
  createdAt: string

  accountId?: string

  area?: LevelId

  fields?: Record<string, string>

  relatedAccountId?: string

  parentId?: string

  projectId?: string

  owner?: 'me' | 'team' | 'client'

  sortOrder?: number

  objectiveId?: string
}

export function isInternalTask(t: Pick<Task, 'accountId' | 'projectId' | 'owner'>): boolean {
  if (t.accountId) return false
  if (t.projectId) return false
  return (t.owner ?? 'me') !== 'client'
}

export const TEAM = [
  'Me',
  'Appointment Setter',
  'Virtual Assistant',
  'Designer',
]

export function taskUid() {
  return 'task-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function assigneesOf(t: { assignee?: string }): string[] {
  return (t.assignee ?? '').split(',').map(x => x.trim()).filter(Boolean)
}
export function joinAssignees(names: string[]): string {
  return Array.from(new Set(names.map(n => n.trim()).filter(Boolean))).join(', ')
}

export function loadTasks(): Task[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('bos_tasks') ?? '[]') } catch { return [] }
}

export function saveTasks(tasks: Task[], deletedIds: string[] = []) {
  localStorage.setItem('bos_tasks', JSON.stringify(tasks))
  void syncToSupabase(tasks, deletedIds)
}

async function syncToSupabase(tasks: Task[], deletedIds: string[]) {
  const key = 'tasks:all'
  const rows = tasks.map(t => ({
    id: t.id, title: t.title, description: t.description,
    status: t.status, priority: t.priority, assignee: t.assignee,
    due_date: t.dueDate || null, created_at: t.createdAt,
    updated_at: new Date().toISOString(),
    account_id: t.accountId || null,
    parent_id: t.parentId || null,
    project_id: t.projectId || null,
    owner: t.owner ?? 'me',
    area: t.area || null,
    fields: t.fields ?? {},
    related_account_id: t.relatedAccountId || null,
    sort_order: typeof t.sortOrder === 'number' ? t.sortOrder : null,
    objective_id: t.objectiveId || null,
  }))
  recordWriteStart()
  try {
    const res = await fetch('/api/tasks-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: rows, deletedIds }),
    })
    const data = res.ok ? await res.json().catch(() => null) : null
    if (!res.ok || (data && data.ok === false)) {
      recordWriteFailure({
        key, op: 'upsert', table: 'tasks',
        payload: { id: 'all', count: rows.length },

        reason: String(data?.error ?? data?.detail ?? `${res.status} ${res.statusText}`.trim()),
      })
      return
    }
    recordWriteSuccess(key)
  } catch (err) {
    recordWriteFailure({
      key, op: 'upsert', table: 'tasks',
      payload: { id: 'all', count: rows.length },
      reason: err instanceof Error ? err.message : 'network error',
    })
  } finally {
    recordWriteEnd()
  }
}

export async function retryTaskSync(): Promise<boolean> {
  await syncToSupabase(loadTasks(), [])
  return !failedWrites().some(f => f.key === 'tasks:all')
}

export async function pullTasks(): Promise<Task[] | null> {

  if (hasUnsyncedWrites()) return null
  try {
    const r = await fetch('/api/tasks-sync')
    if (!r.ok) return null
    const data = await r.json()
    if (!data.tasks?.length) return null
    const rows: Task[] = data.tasks.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      title: t.title as string,
      description: (t.description as string) ?? '',
      status: t.status as Status,
      priority: t.priority as Priority,
      assignee: (t.assignee as string) ?? '',
      dueDate: (t.due_date as string) ?? '',
      createdAt: t.created_at as string,
      accountId: (t.account_id as string) ?? undefined,
      parentId: (t.parent_id as string) ?? undefined,
      projectId: (t.project_id as string) ?? undefined,
      area: (t.area as LevelId) ?? undefined,
      fields: (t.fields as Record<string, string>) ?? undefined,
      relatedAccountId: (t.related_account_id as string) ?? undefined,
      sortOrder: typeof t.sort_order === 'number' ? t.sort_order : undefined,
      objectiveId: (t.objective_id as string) || undefined,
      owner: t.owner === 'client' ? 'client' : t.owner === 'team' ? 'team' : 'me',
    }))
    localStorage.setItem('bos_tasks', JSON.stringify(rows))
    return rows
  } catch { return null }
}

export function reorderTasks(tasks: Task[], orderedIds: string[], movedId: string, extra: Partial<Task> = {}): Task[] {
  const at = new Map(orderedIds.map((id, i) => [id, (i + 1) * 10]))
  return tasks.map(t => {
    const pos = at.get(t.id)
    if (pos === undefined) return t
    return t.id === movedId ? { ...t, ...extra, sortOrder: pos } : { ...t, sortOrder: pos }
  })
}

export const BLOCK_START_KEY = '__start'
export const BLOCK_MINS_KEY = '__mins'

const EMPTY_FORM = { title: '', description: '', status: 'todo' as Status, priority: 'medium' as Priority, assignee: '', dueDate: '', accountId: '', relatedAccountId: '', parentId: '', projectId: '', area: '' as '' | LevelId, fields: {} as Record<string, string>, owner: 'me' as NonNullable<Task['owner']>, objectiveId: '' }

export const OWNERS: { key: NonNullable<Task['owner']>; label: string }[] = [
  { key: 'me',  label: 'Me' },
  { key: 'team', label: 'My team' },
  { key: 'client', label: 'The client' },
]

function SubtaskPanel({ parent, subtasks, onOpenTask, onSetStatus, onQuickAdd }: {
  parent: Task; subtasks: Task[]
  onOpenTask?: (t: Task) => void
  onSetStatus?: (t: Task, status: Status) => void
  onQuickAdd?: (title: string, preset: { parentId: string; accountId?: string }) => void
}) {
  const [draft, setDraft] = useState('')
  const done = subtasks.filter(t => t.status === 'done').length
  const commit = () => { const v = draft.trim(); if (!v || !onQuickAdd) return; onQuickAdd(v, { parentId: parent.id, accountId: parent.accountId }); setDraft('') }
  const NEXT: Record<Status, Status> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
  return (
    <div style={{ border: '1.5px solid var(--os-line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--os-text-faint)' }}>
        Subtasks
        {subtasks.length > 0 && <span style={{ color: done === subtasks.length ? 'var(--os-good)' : 'var(--os-text)', letterSpacing: 0 }}>{done}/{subtasks.length}</span>}
      </div>
      {subtasks.map(t => {
        const isDone = t.status === 'done', going = t.status === 'in_progress'
        const due = t.dueDate ? new Date(t.dueDate.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--os-line)', padding: '2px 6px 2px 8px' }}>
            <button
              type="button"
              aria-label={isDone ? 'Mark to do' : going ? 'Mark done' : 'Mark in progress'}
              disabled={!onSetStatus}
              onClick={() => onSetStatus?.(t, NEXT[t.status])}
              style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              <span aria-hidden style={{
                width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 10, fontWeight: 900,
                border: `2px solid ${isDone ? 'var(--os-good)' : going ? 'var(--os-accent)' : 'var(--os-line-strong)'}`,
                background: isDone ? 'var(--os-good)' : 'transparent',
                boxShadow: going ? 'inset 0 0 0 4px var(--os-accent)' : 'none',
              }}>{isDone ? '✓' : ''}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenTask?.(t)}
              disabled={!onOpenTask}
              style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', background: 'none', border: 'none', cursor: onOpenTask ? 'pointer' : 'default', textAlign: 'left', color: 'var(--os-text)', font: 'inherit' }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--os-text-faint)' : 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              {due && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--os-text-faint)', flexShrink: 0 }}>{due}</span>}
              {onOpenTask && <span aria-hidden style={{ color: 'var(--os-text-faint)', fontSize: 12 }}>›</span>}
            </button>
          </div>
        )
      })}
      {onQuickAdd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--os-line)', padding: '0 8px 0 14px' }}>
          <span aria-hidden style={{ color: 'var(--os-text-faint)', width: 18, textAlign: 'center' }}>+</span>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
            onBlur={commit}
            placeholder="Add a subtask"
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--os-text)', fontSize: 13, padding: '10px 0', outline: 'none' }}
          />
        </div>
      )}
    </div>
  )
}

export function TaskModal({ task, defaultStatus, defaultAccountId, defaultParentId, defaultProjectId, defaultArea, defaultDueDate, defaultOwner, defaultObjectiveId, objectives, columns = [], internalBoard = false, accounts, majors, subtasks, onOpenTask, onSetStatus, onQuickAdd, onClose, onSave, onDelete }: {
  task?: Task
  defaultStatus?: Status
  defaultAccountId?: string
  defaultParentId?: string

  defaultProjectId?: string

  defaultArea?: LevelId

  columns?: TaskColumn[]

  internalBoard?: boolean

  defaultDueDate?: string

  defaultObjectiveId?: string

  objectives?: Objective[]

  defaultOwner?: NonNullable<Task['owner']>
  accounts: BusinessAccount[]

  majors?: Task[]

  subtasks?: Task[]
  onOpenTask?: (t: Task) => void
  onSetStatus?: (t: Task, status: Status) => void
  onQuickAdd?: (title: string, preset: { parentId: string; accountId?: string }) => void
  onClose: () => void
  onSave: (data: Omit<Task, 'id' | 'createdAt'>) => void

  onDelete?: (task: Task) => Promise<boolean>
}) {
  const [movingToClient, setMovingToClient] = useState(false)

  const [showParent, setShowParent] = useState(false)

  const sortedAccounts = [...accounts].sort((a, b) => a.name.localeCompare(b.name))
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ...(task ? {
      title: task.title, description: task.description,
      status: task.status, priority: task.priority,
      assignee: task.assignee, dueDate: task.dueDate,
      accountId: task.accountId ?? '',
      relatedAccountId: task.relatedAccountId ?? '',
      parentId: task.parentId ?? '',
      projectId: task.projectId ?? '',
      area: task.area ?? '',
      fields: task.fields ?? {},
      owner: (task.owner) ?? 'me',
      objectiveId: task.objectiveId ?? '',
    } : { objectiveId: defaultObjectiveId ?? '', status: defaultStatus ?? 'todo', accountId: defaultAccountId ?? '', parentId: defaultParentId ?? '', projectId: defaultProjectId ?? '', area: defaultArea ?? '', dueDate: defaultDueDate ?? '', owner: defaultOwner ?? 'me' }),
  })

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const asTask = () => ({
    ...form,
    area: form.area ? (form.area as LevelId) : undefined,
    objectiveId: form.objectiveId && !form.parentId ? form.objectiveId : undefined,
  })

  const setField = (id: string, v: string) => setForm(f => ({ ...f, fields: { ...f.fields, [id]: v } }))

  const field: React.CSSProperties = {
    width: '100%', padding: '9px 10px', border: '1.5px solid var(--os-line)',
    borderRadius: 8, fontSize: 13, color: 'var(--os-text)', outline: 'none',
    background: 'var(--os-card)',
  }

  const label: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--os-text-faint)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5,
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    onSave(asTask())
    onClose()
  }

  async function handleDelete() {
    if (!task || !onDelete) return
    if (await onDelete(task)) onClose()
  }

  return (

    <div className="os-task-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--os-overlay, rgba(18,0,42,0.42))' }} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="os-task-drawer"
        style={{
          position: 'relative', height: '100%', width: '100%', maxWidth: 460,
          background: 'var(--os-base-2, var(--os-card))',
          backgroundImage: 'var(--os-card-image, none)',
          borderLeft: '1px solid var(--os-line)',
          padding: '26px 26px 40px', overflowY: 'auto',
          boxShadow: '-18px 0 48px rgba(0,0,0,0.22)',
        }}
      >
        <div className="os-task-drawer-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--os-text)' }}>{task ? 'Edit Task' : 'New Task'}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--os-text-faint)', lineHeight: 1, width: 44, height: 44, marginRight: -12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <textarea
            value={form.title}
            onChange={e => { set('title')(e); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px` }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit() } }}
            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }}
            placeholder="Task title…"
            required
            autoFocus
            rows={1}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--os-line)', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--os-text)', outline: 'none', resize: 'none', overflow: 'hidden', fontFamily: 'inherit', lineHeight: 1.4 }}
          />

          <RichText
            value={form.description}
            onChange={html => setForm(f => ({ ...f, description: html }))}
            placeholder="Description or notes (optional)…"
          />

          {task && !form.parentId && subtasks && (
            <SubtaskPanel
              parent={task} subtasks={subtasks}
              onOpenTask={onOpenTask} onSetStatus={onSetStatus} onQuickAdd={onQuickAdd}
            />
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={label}>Area of the business</label>
            <select value={form.area} onChange={set('area')} style={field}>
              <option value="">Not in one of the four yet</option>
              {AREAS.map(a => (
                <option key={a.id} value={a.id}>{a.heading} · {a.name}</option>
              ))}
            </select>
          </div>

          {accounts.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <label style={label}>
                About a client <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>(optional, stays on your board)</span>
              </label>
              <SearchSelect
                value={form.relatedAccountId}
                onChange={id => setForm(f => ({ ...f, relatedAccountId: id }))}
                emptyLabel="Nobody in particular"
                placeholder="Search a client…"
                items={sortedAccounts.map(a => ({ id: a.id, label: a.clientName || a.name, sub: a.clientName && a.name !== a.clientName ? a.name : undefined }))}
              />
            </div>
          )}

          {!(internalBoard && !form.accountId) && <div>
            <label style={label}>Business</label>
            {internalBoard && !form.accountId && !movingToClient ? (

              <div style={{ ...field, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--os-text)' }}>Internal</span>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setMovingToClient(true)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--os-accent)', whiteSpace: 'nowrap' }}
                >
                  Move to a client →
                </button>
              </div>
            ) : (
              <>
                <SearchSelect
                  value={form.accountId}
                  onChange={id => setForm(f => ({ ...f, accountId: id }))}
                  autoFocus={movingToClient}
                  emptyLabel="Internal"
                  placeholder="Search a business…"
                  items={sortedAccounts.map(a => ({ id: a.id, label: a.name, sub: a.clientName || undefined }))}
                />
                {internalBoard && (
                  <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--os-text-faint)', lineHeight: 1.45 }}>
                    Picking a client moves this task to <strong>Projects</strong>. It will leave this board.
                  </div>
                )}
              </>
            )}
          </div>}

          <div className="os-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label style={label}>Whose work</label>
              <select value={form.owner} onChange={set('owner')} style={field}>
                {OWNERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Assign To</label>
              <select
                value=""
                onChange={e => {
                  const n = e.target.value
                  if (!n) return
                  if (n === '__none') { setForm(f => ({ ...f, assignee: '' })); return }
                  setForm(f => { const cur = assigneesOf(f); return { ...f, assignee: joinAssignees(cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n]) } })
                }}
                style={field}
              >
                <option value="" disabled hidden>{assigneesOf(form).length ? assigneesOf(form).join(', ') : 'Unassigned'}</option>
                {TEAM.map(name => <option key={name} value={name}>{assigneesOf(form).includes(name) ? '✓ ' : '\u2003'}{name}</option>)}
                {assigneesOf(form).length > 0 && <option value="__none">Clear all</option>}
              </select>
            </div>
            <div>
              <label style={label}>Status</label>
              <select value={form.status} onChange={set('status')} style={field}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <label style={label}>Priority</label>
              <select value={form.priority} onChange={set('priority')} style={field}>
                <option value="urgent">🔴 Urgent</option>
                <option value="high">🟠 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">⚪ Low</option>
              </select>
            </div>
          </div>

          <div>
            <label style={label}>Due Date</label>
            <DateField
              value={form.dueDate}
              onChange={iso => setForm(f => ({ ...f, dueDate: iso }))}
              clearable
              compact
              quick={[
                { iso: todayLocalISO(), label: 'Today' },
                { iso: todayLocalISO(1), label: 'Tomorrow' },
                { iso: nextMondayISO(), label: 'Next wk' },
              ]}
            />
          </div>

          {majors && (form.parentId || showParent) ? (
            <div>
              <label style={label}>Part of</label>
              <select value={form.parentId} onChange={set('parentId')} style={field}>
                <option value="">— Major task —</option>
                {majors.filter(m => m.id !== task?.id).map(m => (

                  <option key={m.id} value={m.id}>{m.title.length > 60 ? m.title.slice(0, 60) + '…' : m.title}</option>
                ))}
              </select>
            </div>
          ) : majors ? (
            <button type="button" onClick={() => setShowParent(true)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--os-accent)', textAlign: 'left', alignSelf: 'flex-start' }}>
              + Make this part of another task
            </button>
          ) : null}

          {objectives && !form.parentId && (
            <div>
              <label style={label}>Objective</label>
              <select value={form.objectiveId} onChange={set('objectiveId')} style={field}>
                <option value="">— Not under an objective —</option>
                {objectives
                  .filter(o => !isGraduated(o) || o.id === form.objectiveId)
                  .map(o => (
                    <option key={o.id} value={o.id}>{o.title.length > 70 ? o.title.slice(0, 70) + '…' : o.title}</option>
                  ))}
              </select>
            </div>
          )}

          <CalendarBlock
            title={form.title}
            description={form.description}
            start={form.fields[BLOCK_START_KEY] ?? ''}
            minutes={Number(form.fields[BLOCK_MINS_KEY]) || 60}
            dueDate={form.dueDate}
            onChange={(start, mins) => setForm(f => ({
              ...f,
              fields: { ...f.fields, [BLOCK_START_KEY]: start, [BLOCK_MINS_KEY]: String(mins) },
            }))}
            label={label}
            field={field}
          />

          {columns.length > 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              {columns.map(c => (
                <div key={c.id}>
                  <label style={label}>
                    {c.name}
                  </label>
                  {c.kind === 'longtext' ? (
                    <textarea
                      value={form.fields[c.id] ?? ''}
                      onChange={e => setField(c.id, e.target.value)}
                      rows={4}
                      style={{ width: '100%', padding: '9px 10px', border: '1.5px solid var(--os-line)', borderRadius: 8, fontSize: 13, color: 'var(--os-text)', outline: 'none', background: 'var(--os-card)', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  ) : (
                    <>
                      <input
                        type={c.kind === 'number' ? 'number' : c.kind === 'date' ? 'date' : 'text'}
                        value={form.fields[c.id] ?? ''}
                        onChange={e => setField(c.id, e.target.value)}
                        placeholder={c.kind === 'url' ? 'https://' : ''}
                        style={field}
                      />
                      {c.kind === 'url' && safeUrl(form.fields[c.id] ?? '') && (
                        <a href={safeUrl(form.fields[c.id] ?? '')!} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-block', marginTop: 5, fontSize: 12, fontWeight: 600, color: 'var(--os-accent)' }}>
                          Open link ↗
                        </a>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="os-task-drawer-actions">
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px', background: 'var(--os-line)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--os-text-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" style={{ flex: 2, padding: '11px', background: 'var(--os-accent)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                {task ? 'Save Changes' : 'Create Task'}
              </button>
            </div>

            {task && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                style={{ display: 'block', margin: '4px auto 0', padding: '8px 10px', background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: 'var(--os-bad)', opacity: 0.85, cursor: 'pointer' }}
              >
                🗑 Delete task
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

const BLOCK_LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240]

function CalendarBlock({ title, description, start, minutes, dueDate, onChange, label, field }: {
  title: string
  description: string
  start: string
  minutes: number
  dueDate: string
  onChange: (start: string, minutes: number) => void
  label: React.CSSProperties
  field: React.CSSProperties
}) {
  const [open, setOpen] = useState(!!start)
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
  const url = start ? googleCalendarBlockUrl({
    title, start, minutes, timeZone: tz,
    details: [descriptionToText(description), `Planned in ${BRAND.name}`].filter(Boolean).join('\n\n'),
  }) : ''

  if (!open) {
    return (
      <button type="button" onClick={() => {
        setOpen(true)

        if (!start) onChange(`${dueDate || todayLocalISO(1)}T09:00`, minutes)
      }}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--os-accent)', textAlign: 'left', alignSelf: 'flex-start' }}>
        + Block time in Google Calendar
      </button>
    )
  }
  return (
    <div>
      <label style={label}>Time block in Google Calendar</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="datetime-local" value={start}
          onChange={e => onChange(e.target.value, minutes)}
          style={{ ...field, flex: '1 1 180px', width: 'auto' }} />
        <select value={minutes} onChange={e => onChange(start, Number(e.target.value))}
          style={{ ...field, flex: '0 0 110px', width: 'auto' }}>
          {BLOCK_LENGTHS.map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`}</option>)}
        </select>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="os-btn os-btn-sm"
          style={{ display: 'inline-flex', marginTop: 8, textDecoration: 'none' }}>
          Add to Google Calendar ↗
        </a>
      ) : (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--os-text-faint)' }}>Pick a start time{title.trim() ? '' : ' and give the task a title'} to get the calendar link.</p>
      )}
      {start && (
        <button type="button" onClick={() => { onChange('', minutes); setOpen(false) }}
          style={{ display: 'block', background: 'none', border: 'none', padding: 0, marginTop: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--os-text-faint)' }}>
          Remove the time block
        </button>
      )}
    </div>
  )
}
