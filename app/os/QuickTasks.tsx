'use client'
import { BRAND } from '@/lib/brand'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AREAS } from '@/lib/business-areas'
import { getAccounts, inFeed, type BusinessAccount } from '@/lib/business-accounts'
import { loadColumns, safeUrl, type TaskColumn } from '@/lib/task-system/columns'
import { descriptionToText } from '@/lib/task-text'
import {
  loadTasks, saveTasks, taskUid, isInternalTask, TEAM, assigneesOf, joinAssignees,
  type Task, type Status, type Priority,
} from './tasks/task-shared'

const STATUSES: { id: Status; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
]
const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
]

function rank(t: Task): number {
  const due = (t.dueDate || '').slice(0, 10)
  if (!due) return 3
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10)
  return due < today ? 0 : due === today ? 1 : 2
}

function dueLabel(iso: string): { text: string; overdue: boolean } | null {
  if (!iso) return null
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const days = Math.floor((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  return {
    text: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday'
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: days < 0,
  }
}

function Pill({ text, tone, title, children }: {
  text: React.ReactNode; tone?: string; title: string; children: React.ReactNode
}) {
  return (
    <span className="os-qt-pill" style={{ color: tone }} title={title}>
      {text}
      {children}
    </span>
  )
}

export default function QuickTasks() {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [accounts, setAccounts] = useState<BusinessAccount[]>([])
  const [columns, setColumns] = useState<TaskColumn[]>([])

  const [list, setList] = useState('')
  const [draft, setDraft] = useState('')
  const [area, setArea] = useState('')

  const [openId, setOpenId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(() => {
    setTasks(loadTasks())
    setAccounts(getAccounts().filter(inFeed))
    setColumns(loadColumns())
  }, [])

  const show = useCallback(() => { refresh(); setOpen(true) }, [refresh])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return

      if (openId) setOpenId(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, openId])

  const shown = useMemo(() => {
    const mine = list ? tasks.filter(t => t.accountId === list) : tasks.filter(isInternalTask)
    return mine
      .filter(t => t.status !== 'done' && !t.parentId)
      .sort((a, b) => rank(a) - rank(b) || (a.dueDate || 'z').localeCompare(b.dueDate || 'z'))
  }, [tasks, list])

  function persist(next: Task[]) { saveTasks(next); setTasks(next) }
  const patch = (t: Task, p: Partial<Task>) =>
    persist(tasks.map(x => x.id === t.id ? { ...x, ...p } : x))
  const remove = (t: Task) => { setOpenId(null); persist(tasks.filter(x => x.id !== t.id)) }

  function add() {
    const title = draft.trim()
    if (!title) return
    persist([...tasks, {
      id: taskUid(), title, description: '',
      status: 'todo' as Status, priority: 'medium' as Priority,
      assignee: list ? '' : BRAND.owner,
      dueDate: '', createdAt: new Date().toISOString(),
      accountId: list || undefined,
      area: (area || undefined) as Task['area'],
    }])
    setDraft('')
    inputRef.current?.focus()
  }

  const listName = list ? (accounts.find(a => a.id === list)?.name ?? 'Client') : 'My business'

  return (
    <>
      {!open && (
        <button onClick={show} className="os-qt-fab" aria-label="Add a task" title="Add a task">
          <span aria-hidden>+</span>
        </button>
      )}

      {open && (
        <>
          <div className="os-qt-scrim" onClick={() => setOpen(false)} />
          <aside className="os-qt-panel" role="dialog" aria-label="Tasks">
            <header className="os-qt-head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="os-qt-eyebrow">Tasks</div>
                <select
                  value={list}
                  onChange={e => { setList(e.target.value); setArea(''); setOpenId(null) }}
                  className="os-qt-listpick"
                  aria-label="Which list"
                >
                  <option value="">My business</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <button onClick={() => setOpen(false)} className="os-qt-x" aria-label="Close">✕</button>
            </header>

            <div className="os-qt-add">
              <span aria-hidden className="os-qt-add-icon">+</span>
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
                placeholder="Add a task"
                aria-label="Add a task"
              />
            </div>

            {!list && (
              <div className="os-qt-areas">
                <button onClick={() => setArea('')} className={area === '' ? 'on' : ''}>Inbox</button>
                {AREAS.map(a => (
                  <button key={a.id} onClick={() => setArea(a.id)} className={area === a.id ? 'on' : ''}>
                    {a.heading}
                  </button>
                ))}
              </div>
            )}

            <div className="os-qt-body">
              {shown.map(t => {
                const due = dueLabel(t.dueDate)
                const inArea = AREAS.find(a => a.id === t.area)
                const isOpen = openId === t.id
                const status = STATUSES.find(s => s.id === t.status)
                return (
                  <div key={t.id} className={`os-qt-item${isOpen ? ' open' : ''}`}>
                    <div className="os-qt-row">
                      <button
                        onClick={() => patch(t, { status: 'done' })}
                        className="os-qt-tick"
                        aria-label={`Mark ${t.title} done`}
                      ><span aria-hidden /></button>

                      <button
                        className="os-qt-open"
                        onClick={() => setOpenId(isOpen ? null : t.id)}
                        aria-expanded={isOpen}
                      >
                        <span className="os-qt-title">{t.title}</span>
                        {!isOpen && (due || inArea || t.status === 'in_progress') && (
                          <span className="os-qt-meta">
                            {due && <b style={{ color: due.overdue ? 'var(--os-bad)' : undefined }}>{due.text}</b>}
                            {t.status === 'in_progress' && <span>In progress</span>}
                            {inArea && <span>{inArea.heading}</span>}
                          </span>
                        )}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="os-qt-detail">
                        <input
                          className="os-qt-field os-qt-field-title"
                          defaultValue={t.title}
                          key={`ti-${t.id}`}
                          onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.title) patch(t, { title: v }) }}
                          aria-label="Title"
                        />
                        <textarea
                          className="os-qt-field"
                          defaultValue={descriptionToText(t.description)}
                          key={`de-${t.id}`}
                          placeholder="Add details"
                          rows={2}

                          onBlur={e => { if (e.target.value !== descriptionToText(t.description)) patch(t, { description: e.target.value }) }}
                          aria-label="Details"
                        />

                        <div className="os-qt-pills">
                          <Pill
                            title="Due date"
                            text={due ? due.text : 'Add date'}
                            tone={due?.overdue ? 'var(--os-bad)' : undefined}
                          >
                            <input
                              type="date" aria-label="Due date"
                              value={t.dueDate ? t.dueDate.slice(0, 10) : ''}
                              onChange={e => patch(t, { dueDate: e.target.value })}
                            />
                          </Pill>

                          <Pill title="Status" text={status?.label ?? 'To do'}>
                            <select
                              aria-label="Status" value={t.status}
                              onChange={e => patch(t, { status: e.target.value as Status })}
                            >
                              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                          </Pill>

                          <Pill title="Priority" text={PRIORITIES.find(p => p.id === t.priority)?.label ?? 'Medium'}>
                            <select
                              aria-label="Priority" value={t.priority}
                              onChange={e => patch(t, { priority: e.target.value as Priority })}
                            >
                              {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                          </Pill>

                          <Pill title="Assignee" text={assigneesOf(t).length ? assigneesOf(t).map(n => n.split(' ')[0]).join(' + ') : 'Nobody'}>
                            <select
                              aria-label="Assignee" value=""
                              onChange={e => {
                                const n = e.target.value
                                if (!n) { patch(t, { assignee: '' }); return }
                                const cur = assigneesOf(t)
                                patch(t, { assignee: joinAssignees(cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n]) })
                              }}
                            >
                              <option value="" disabled hidden>Toggle a person</option>
                              {TEAM.map(m => <option key={m} value={m}>{assigneesOf(t).includes(m) ? '✓ ' : ''}{m}</option>)}
                              {assigneesOf(t).length > 0 && <option value="">Nobody</option>}
                            </select>
                          </Pill>

                          {!list && (
                            <Pill title="Which of the four" text={inArea ? inArea.heading : 'Inbox'}>
                              <select
                                aria-label="Which of the four" value={t.area ?? ''}
                                onChange={e => patch(t, { area: (e.target.value || undefined) as Task['area'] })}
                              >
                                <option value="">Inbox</option>
                                {AREAS.map(a => <option key={a.id} value={a.id}>{a.heading}</option>)}
                              </select>
                            </Pill>
                          )}
                        </div>

                        {columns.map(c => {
                          const value = String(t.fields?.[c.id] ?? '')
                          const href = c.kind === 'url' ? safeUrl(value) : null
                          return (
                            <label key={c.id} className="os-qt-col">
                              <span>{c.name}</span>
                              {c.kind === 'longtext' ? (
                                <textarea
                                  className="os-qt-field" rows={2} defaultValue={value} key={`${t.id}-${c.id}`}
                                  onBlur={e => patch(t, { fields: { ...(t.fields ?? {}), [c.id]: e.target.value } })}
                                />
                              ) : (
                                <input
                                  className="os-qt-field"
                                  type={c.kind === 'number' ? 'number' : c.kind === 'date' ? 'date' : 'text'}
                                  defaultValue={value} key={`${t.id}-${c.id}`}
                                  placeholder="—"
                                  onBlur={e => patch(t, { fields: { ...(t.fields ?? {}), [c.id]: e.target.value.trim() } })}
                                />
                              )}
                              {href && (
                                <a href={href} target="_blank" rel="noopener noreferrer" className="os-qt-collink">Open ↗</a>
                              )}
                            </label>
                          )
                        })}

                        <div className="os-qt-detail-foot">
                          <button onClick={() => remove(t)} className="os-qt-del">Delete</button>
                          <button onClick={() => setOpenId(null)} className="os-qt-done">Done</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {shown.length === 0 && (
                <p className="os-qt-empty">
                  Nothing open in {listName}.<br />Write the next thing above.
                </p>
              )}
            </div>

            <footer className="os-qt-foot">
              <Link href={list ? '/os/projects' : '/os/tasks'} onClick={() => setOpen(false)}>
                Open the full board →
              </Link>
              <span>{shown.length} open</span>
            </footer>
          </aside>
        </>
      )}
    </>
  )
}
