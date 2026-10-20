'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { type BusinessAccount, getAccounts } from '@/lib/business-accounts'

type Priority = 'urgent' | 'high' | 'medium' | 'low'
type Status = 'todo' | 'in_progress' | 'done'

interface Task {
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

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: 'var(--os-bad)',
  high: '#ea580c',
  medium: '#ca8a04',
  low: 'var(--os-text-faint)',
}

function loadTasks(): Task[] {
  try { return JSON.parse(localStorage.getItem('bos_tasks') ?? '[]') } catch { return [] }
}

function dueLabel(iso: string): { text: string; overdue: boolean } | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const diff = Math.floor((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  if (diff < 0) return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: true }
  if (diff === 0) return { text: 'Today', overdue: false }
  if (diff === 1) return { text: 'Tomorrow', overdue: false }
  return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false }
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || ''
}

export default function TasksOverview() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [accounts, setAccounts] = useState<BusinessAccount[]>([])

  useEffect(() => { setTasks(loadTasks()); setAccounts(getAccounts()) }, [])

  const todo = tasks.filter(t => t.status === 'todo').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const done = tasks.filter(t => t.status === 'done').length

  const open = tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => {
      const da = dueLabel(a.dueDate), db = dueLabel(b.dueDate)
      const oa = da?.overdue ? 0 : 1, ob = db?.overdue ? 0 : 1
      if (oa !== ob) return oa - ob
      const ta = a.dueDate || '9999-12-31', tb = b.dueDate || '9999-12-31'
      if (ta !== tb) return ta < tb ? -1 : 1
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    })

    .slice(0, 3)

  const chips: { label: string; count: number; color: string; soft: string }[] = [
    { label: 'To do', count: todo, color: 'var(--os-warn)', soft: 'var(--os-warn-soft)' },
    { label: 'In progress', count: inProgress, color: 'var(--os-accent)', soft: 'var(--os-accent-soft)' },
    { label: 'Done', count: done, color: 'var(--os-good)', soft: 'var(--os-good-soft)' },
  ]

  return (
    <section className="os-card" style={{ padding: '22px 24px', alignSelf: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <span className="os-card-title">Client tasks</span>
          <div style={{ fontSize: 13, color: 'var(--os-text-faint)', marginTop: 4 }}>
            {tasks.length === 0
              ? 'Nothing on the board yet.'
              : `${todo + inProgress} open, most pressing first.`}
          </div>
        </div>
        <Link href="/os/projects" className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '7px 15px', fontSize: 12.5, textDecoration: 'none' }}>
          Open projects
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: open.length ? 6 : 0, flexWrap: 'wrap' }}>
        {chips.map(c => (
          <span key={c.label} style={{
            background: c.soft, color: c.color, borderRadius: 999,
            padding: '3px 10px', fontSize: 11, fontWeight: 800,
          }}>
            {c.count} {c.label}
          </span>
        ))}
      </div>

      <div>
        {open.map(t => {
          const due = dueLabel(t.dueDate)
          const business = t.accountId ? accounts.find(a => a.id === t.accountId)?.name : undefined
          return (
            <Link
              key={t.id}
              href={business ? '/os/projects' : '/os/tasks'}
              className="os-action-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 12px', margin: '0 -12px',
                borderRadius: 12, textDecoration: 'none',
                borderTop: '1px solid var(--os-line)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[t.priority], flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </span>
                {(t.assignee || business) && (
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--os-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[business, firstName(t.assignee)].filter(Boolean).join(' · ')}{t.status === 'in_progress' ? ' · in progress' : ''}
                  </span>
                )}
              </span>
              {due && (
                <span style={{
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                  color: due.overdue ? 'var(--os-bad)' : 'var(--os-text-faint)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {due.overdue ? `${due.text} · late` : due.text}
                </span>
              )}
            </Link>
          )
        })}
        {tasks.length === 0 && (
          <div style={{ paddingTop: 8, fontSize: 12.5, color: 'var(--os-text-faint)' }}>
            Add the first task from the board and it shows up here.
          </div>
        )}
      </div>
    </section>
  )
}
