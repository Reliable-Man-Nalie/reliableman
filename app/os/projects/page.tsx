'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { confirmAction } from '../ConfirmHost'
import { getDeals, getLeads, getInvoices } from '@/lib/crm-store'
import {
  type BusinessAccount, getAccounts, saveAccounts, setAccountsLocal,
  accountUid, deriveAccounts, dedupeAccounts, rowToAccount, inFeed, RETAINER_FLOOR,
} from '@/lib/business-accounts'
import { TEAM,
  type Task, type Status,
  loadTasks, saveTasks, pullTasks, taskUid, TaskModal, reorderTasks,
} from '../tasks/task-shared'
import {
  ListView, KanbanView, CalendarView, MatrixView,
  ViewToggle, FilterBar, applyFilters, EMPTY_FILTERS, groupTasks as sharedGroup,
  type Filters, type ViewKey,
  type TaskGroup,
} from '@/components/task-board/TaskViews'
import { DashboardView } from '@/components/task-board/DashboardView'
import ClientTaskOverview from '../tasks/ClientTaskOverview'
import type { LevelId } from '@/lib/business-areas'
import {
  loadColumns, saveColumns, pullColumns, columnUid,
  type TaskColumn, type ColumnKind,
} from '@/lib/task-system/columns'
import ClientPlanView, { type ClientPlan } from './ClientPlanView'
import AddClientModal, { type Candidate } from './AddClientModal'
import { BusinessModal, QuickCapture, type ContactSuggestion } from '../tasks/BusinessModal'
import { getClients } from '@/lib/people'

const VIEWS: { key: ViewKey; label: string }[] = [

  { key: 'overview', label: 'Board' },
  { key: 'plan', label: 'Plan' },
  { key: 'list',     label: 'List' },
  { key: 'kanban',   label: 'Kanban' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'matrix',   label: 'Priority' },
]

export default function ProjectsPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [accounts, setAccounts] = useState<BusinessAccount[]>([])

  const [view, setView] = useState<ViewKey>('overview')
  const [plans, setPlans] = useState<Record<string, ClientPlan>>({})
  const [plansLoading, setPlansLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [taskModal, setTaskModal] = useState<{ task?: Task; status?: Status; accountId?: string; parentId?: string; projectId?: string; dueDate?: string } | null>(null)

  const [columns, setColumns] = useState<TaskColumn[]>([])
  const [bizModal, setBizModal] = useState<{ account?: BusinessAccount } | null>(null)
  const [contacts, setContacts] = useState<ContactSuggestion[]>([])

  const monthlyByCompany = useRef(new Map<string, { amount: number; currency: string }>())

  const [showAll, setShowAll] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  useEffect(() => {
    setTasks(loadTasks())
    setColumns(loadColumns())
    pullTasks().then(rows => { if (rows) setTasks(rows) })

    pullColumns().then(cols => { if (cols) setColumns(cols) })

    function loadFromCrm() {
      const deals = getDeals()
      const leads = getLeads()
      setContacts(dedupeContacts([
        ...deals.map(d => ({ name: d.clientName, email: d.clientEmail })),
        ...leads.map(l => ({ name: l.name, email: l.email })),
      ]))

      const seen = new Set<string>()
      const cand: Candidate[] = []
      const push = (c: Candidate) => {
        const key = `${(c.company || c.name).trim().toLowerCase()}|${c.email.trim().toLowerCase()}`
        if (!key.trim() || seen.has(key)) return
        seen.add(key); cand.push(c)
      }
      for (const p of getClients()) {
        push({ name: p.name, email: p.email, company: p.company, from: p.sources.includes('portal') ? 'client' : 'signed' })
      }
      setCandidates(cand)

      fetch('/api/os/learning-platform', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!d?.ok || !Array.isArray(d.roster)) return
          const extra: Candidate[] = []
          for (const p of d.roster as { email?: string; name?: string; company?: string; hasAccess?: boolean }[]) {
            if (!p.hasAccess) continue
            const key = `${(p.company || p.name || '').trim().toLowerCase()}|${(p.email ?? '').trim().toLowerCase()}`
            if (!key.trim() || seen.has(key)) continue
            seen.add(key)
            extra.push({ name: p.name ?? '', email: p.email ?? '', company: p.company ?? '', from: 'client' })
          }
          if (extra.length) setCandidates(prev => [...extra, ...prev])
        })
        .catch(() => { /* the picker still works from the directory alone */ })

      const live = getInvoices().filter(inv => inv.status !== 'draft')
      const sources = live.map(inv => ({ company: inv.clientCompany, name: inv.clientName, email: inv.clientEmail }))

      const monthly = new Map<string, { amount: number; currency: string }>()
      for (const inv of live) {
        if (!inv.recurring && !inv.recurringParentId) continue
        const company = (inv.clientCompany ?? '').trim().toLowerCase()
        if (!company) continue
        const total = (inv.lineItems ?? []).reduce((n, li) => n + (li.quantity ?? 1) * (li.price ?? 0), 0) + (inv.taxes ?? 0)
        const seenMonthly = monthly.get(company)
        if (!seenMonthly || total > seenMonthly.amount) monthly.set(company, { amount: total, currency: inv.currency })
      }
      monthlyByCompany.current = monthly

      setAccounts(reconcile(getAccounts(), sources))

      fetch('/api/accounts-sync')
        .then(r => r.json())
        .then(data => {
          if (!Array.isArray(data.accounts)) return
          const cloud = data.accounts.map(rowToAccount)
          setAccounts(reconcile(cloud.length ? cloud : getAccounts(), sources))
        })
        .catch(() => {})
    }

    loadFromCrm()
    window.addEventListener('bos:hydrated', loadFromCrm)
    return () => window.removeEventListener('bos:hydrated', loadFromCrm)
  }, [])

  function reconcile(existing: BusinessAccount[], sources: { company?: string | null; name: string; email: string }[]): BusinessAccount[] {
    const invoiceNames = new Set(sources.map(s => (s.company ?? '').trim().toLowerCase()).filter(Boolean))
    const tasked = new Set(loadTasks().map(t => t.accountId).filter(Boolean))

    const kept = existing.filter(a =>
      a.source === 'manual' ||
      invoiceNames.has(a.name.trim().toLowerCase()) ||
      tasked.has(a.id),
    )
    const pruned = existing.filter(a => !kept.includes(a)).map(a => a.id)

    const { merged: deduped, removedIds, remap } = dedupeAccounts(kept)
    if (remap.size > 0) {

      const fixed = loadTasks().map(t =>
        t.accountId && remap.has(t.accountId) ? { ...t, accountId: remap.get(t.accountId) } : t)
      saveTasks(fixed)
      setTasks(fixed)
    }

    const withMoney = deduped.map(a => {
      const m = monthlyByCompany.current.get(a.name.trim().toLowerCase())
      return m && (a.monthlyAmount !== m.amount || a.monthlyCurrency !== m.currency)
        ? { ...a, monthlyAmount: m.amount, monthlyCurrency: m.currency }
        : a
    })
    const { merged, added } = deriveAccounts(withMoney, sources)
    const gone = [...pruned, ...removedIds]
    if (added.length || gone.length) saveAccounts(merged, gone)
    else setAccountsLocal(merged)
    return merged
  }

  const loadPlans = useCallback(async () => {
    const feed = accounts.filter(inFeed)
    if (feed.length === 0) { setPlansLoading(false); return }
    const emails = [...new Set(feed.map(a => a.clientEmail).filter(Boolean))]
    const acctIds = feed.map(a => a.id)
    const map: Record<string, ClientPlan> = {}
    try {
      if (emails.length) {
        const d = await fetch('/api/os/client-objectives?emails=' + encodeURIComponent(emails.join(','))).then(r => r.json())
        for (const c of d?.clients ?? []) map[String(c.email).toLowerCase()] = c as ClientPlan
      }

      const p = await fetch('/api/os/client-plan?accountIds=' + encodeURIComponent(acctIds.join(','))).then(r => r.json())
      const byAcct = new Map<string, { id: string; kind: string; parentId: string; title: string; area?: string; status: string }[]>()
      for (const r of p?.rows ?? []) byAcct.set(r.accountId, [...(byAcct.get(r.accountId) ?? []), r])
      for (const a of feed) {
        const key = (a.clientEmail || '').toLowerCase()
        if (map[key]?.ninetyDay) continue          // the portal's plan wins
        const rows = byAcct.get(a.id) ?? []
        if (!rows.length && map[key]) continue
        const goal = rows.find(r => r.kind === 'ninety_day') ?? null
        const objectives = rows.filter(r => r.kind === 'step' && r.parentId === goal?.id)
        const objIds = new Set(objectives.map(o => o.id))
        map[key || a.id] = {
          email: key, name: a.clientName, fromPortal: false,
          ninetyDay: goal ? { id: goal.id, title: goal.title } : null,
          objectives: objectives.map(o => ({ id: o.id, title: o.title, area: o.area ?? '', done: o.status === 'done' })),
          projects: rows.filter(r => r.kind === 'project' && objIds.has(r.parentId))
            .map(r => ({ id: r.id, objectiveId: r.parentId, title: r.title, done: r.status === 'done' })),
        }
      }
      setPlans(map)
    } catch { /* the cards fall back to their empty state */ }
    setPlansLoading(false)
  }, [accounts])

  useEffect(() => { loadPlans() }, [loadPlans])

  async function addPlanRow(accountId: string, kind: 'ninety_day' | 'step' | 'project', title: string, parentId?: string, area?: LevelId): Promise<string | null> {
    const r = await fetch('/api/os/client-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, kind, title, parentId, area }),
    })
    if (!r.ok) return null
    const data = await r.json().catch(() => null)
    await loadPlans()
    return data?.row?.id ?? null
  }

  async function updatePlanRow(id: string, title: string) {
    const r = await fetch('/api/os/client-plan', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title }),
    })
    if (r.ok) await loadPlans()
  }

  function persistColumns(next: TaskColumn[], deletedIds: string[] = []) {
    setColumns(next)
    saveColumns(next, deletedIds)
  }
  function addColumn(name: string, kind: ColumnKind) {
    persistColumns([...columns, {
      id: columnUid(), name: name.slice(0, 60), kind,
      sortOrder: columns.length, createdAt: new Date().toISOString(),
    }])
  }

  function removeColumn(id: string) {
    persistColumns(columns.filter(c => c.id !== id), [id])
  }

  function persistTasks(updated: Task[], deletedIds: string[] = []) {
    saveTasks(updated, deletedIds)
    setTasks(updated)
  }

  function createTask(data: Omit<Task, 'id' | 'createdAt'>) {
    persistTasks([...tasks, { ...data, id: taskUid(), createdAt: new Date().toISOString() }])
  }

  function quickAdd(title: string, accountId: string | undefined) {

    createTask({ title, description: '', status: 'todo', priority: 'medium', assignee: '', dueDate: '', accountId, owner: 'client' })
  }

  function setStatus(t: Task, status: Status) {
    persistTasks(tasks.map(x => x.id === t.id ? { ...x, status } : x))
  }

  function toggleDone(t: Task) {
    setStatus(t, t.status === 'done' ? 'todo' : 'done')
  }

  async function deleteTask(t: Task): Promise<boolean> {
    const subIds = tasks.filter(x => x.parentId === t.id).map(x => x.id)
    if (!(await confirmAction({
      message: `Delete "${t.title}"?`,
      detail: subIds.length ? `Its ${subIds.length} subtask${subIds.length === 1 ? '' : 's'} go with it. This cannot be undone.` : 'This cannot be undone.',
    }))) return false
    const removeIds = new Set([t.id, ...subIds])
    persistTasks(tasks.filter(x => !removeIds.has(x.id)), [...removeIds])
    return true
  }

  function addClientToProjects(c: Candidate) {
    const name = (c.company || c.name).trim()
    if (!name) return
    const existing = accounts.find(a => a.name.trim().toLowerCase() === name.toLowerCase())
    if (existing) {
      saveAndSetAccounts(accounts.map(a => a.id === existing.id ? { ...a, inProjectFeed: true } : a))
      return
    }
    saveAndSetAccounts([...accounts, {
      id: accountUid(),
      name,
      clientName: c.name.trim(),
      clientEmail: c.email.trim().toLowerCase(),
      createdAt: new Date().toISOString(),

      source: 'manual',
      inProjectFeed: true,
    }])
  }

  function removeFromFeed(id: string) {
    saveAndSetAccounts(accounts.map(a => a.id === id ? { ...a, inProjectFeed: false } : a))
  }

  function saveBusiness(data: { name: string; clientName: string; clientEmail: string }) {
    if (bizModal?.account) {
      saveAndSetAccounts(accounts.map(a => a.id === bizModal.account!.id ? { ...a, ...data } : a))
    } else {
      saveAndSetAccounts([...accounts, { id: accountUid(), ...data, createdAt: new Date().toISOString(), source: 'manual' }])
    }
  }

  function deleteBusiness(id: string) {
    saveAndSetAccounts(accounts.filter(a => a.id !== id), [id])
  }

  function saveAndSetAccounts(updated: BusinessAccount[], deletedIds: string[] = []) {
    saveAccounts(updated, deletedIds)
    setAccounts(updated)
  }

  const feedAccounts = useMemo(
    () => showAll ? accounts : accounts.filter(inFeed),
    [accounts, showAll],
  )
  const excluded = accounts.length - accounts.filter(inFeed).length

  const feedIds = useMemo(() => new Set(feedAccounts.map(a => a.id)), [feedAccounts])

  const clientTasks = useMemo(
    () => tasks.filter(t => !!t.accountId && feedIds.has(t.accountId!)),
    [tasks, feedIds],
  )

  const businessGroups: TaskGroup[] = useMemo(
    () => feedAccounts.map(a => ({
      id: a.id,
      label: a.clientName || a.name,
      sublabel: a.clientName && a.name !== a.clientName ? a.name : undefined,
      color: 'var(--os-accent)',
      match: (t: Task) => t.accountId === a.id,
      preset: { accountId: a.id },
    })),
    [feedAccounts],
  )

  const planTasks = useMemo(
    () => tasks.filter(t =>
      (!!t.accountId && feedIds.has(t.accountId!)) || (!t.accountId && !!t.projectId),
    ),
    [tasks, feedIds],
  )
  const shown = useMemo(() => applyFilters(clientTasks, filters), [clientTasks, filters])
  const majors = useMemo(() => sharedGroup(clientTasks).majors, [clientTasks])
  const openCount = clientTasks.filter(t => t.status !== 'done').length

  const viewProps = {
    tasks: shown,
    accounts: feedAccounts,
    onEditTask: (t: Task) => setTaskModal({ task: t }),

    onQuickAdd: (title: string, preset: { accountId?: string; parentId?: string }) =>
      createTask({
        title, description: '', status: 'todo', priority: 'medium',
        assignee: '', dueDate: '', parentId: preset.parentId, accountId: preset.accountId,
      }),
    team: TEAM,
    columns,
    onAddColumn: addColumn,
    onRemoveColumn: removeColumn,
    onSetStatus: setStatus,

    onPatchTask: (t: Task, patch: Partial<Task>) =>
      persistTasks(tasks.map(x => (x.id === t.id ? { ...x, ...patch } : x))),

    onReorder: (orderedIds: string[], movedId: string, extra?: Partial<Task>) =>
      persistTasks(reorderTasks(tasks, orderedIds, movedId, extra)),
    onAddTask: (preset?: { accountId?: string; parentId?: string; projectId?: string; dueDate?: string; status?: Status }) => setTaskModal(preset ?? {}),
    onDeleteTask: deleteTask,
  }

  return (
    <div className="os-board-page">

      <div className="os-page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="os-page-title">Projects</h1>
          <p className="os-page-sub">
            {feedAccounts.length} client business{feedAccounts.length === 1 ? '' : 'es'} · {openCount} open task{openCount === 1 ? '' : 's'} ·{' '}
            <Link href="/os/tasks" style={{ color: 'var(--os-accent)', fontWeight: 700, textDecoration: 'none' }}>
              inner-business board →
            </Link>
          </p>
        </div>
        <div className="os-page-actions" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setAddOpen(true)} className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '9px 14px', fontSize: 13 }}>
            + Add client
          </button>
          <button onClick={() => setBizModal({})} className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '9px 14px', fontSize: 13 }}>
            + New business
          </button>
        </div>
      </div>

      <div className="os-board-controls" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <ViewToggle views={VIEWS} view={view} setView={setView} />
        <FilterBar tasks={clientTasks} accounts={feedAccounts} filters={filters} setFilters={setFilters} showBusiness={view !== 'overview'} />
        {excluded > 0 && (
          <button
            onClick={() => setShowAll(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--os-accent)' }}
            title={`Clients billing under ${RETAINER_FLOOR}/mo run their own projects in their portal and stay out of this feed.`}
          >
            {showAll ? 'Show one-to-one only' : `+ ${excluded} not in the feed`}
          </button>
        )}
      </div>

      <QuickCapture accounts={feedAccounts} onAdd={quickAdd} allowInternal={false} />

      {accounts.length === 0 ? (
        <div className="os-card" style={{ padding: '28px 24px', fontSize: 13.5, color: 'var(--os-text-faint)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--os-text)' }}>No clients in Projects yet.</strong><br />
          Use <strong>+ Add client</strong> to pick anyone you work with one to one, retainer
          or one-off project. They do not need a portal. Group members run their own
          projects in their portal and stay out of here on purpose.
        </div>
      ) : view === 'plan' ? (
        <ClientPlanView
          accounts={feedAccounts}
          plans={plans}
          tasks={planTasks}
          loading={plansLoading}
          onEditTask={t => setTaskModal({ task: t })}
          onSetStatus={setStatus}
          onAddTask={preset => setTaskModal(preset)}
          onQuickAdd={(title, preset) => createTask({
            title, description: '', status: 'todo', priority: 'medium',
            assignee: '', dueDate: '',
            accountId: preset.accountId, projectId: preset.projectId, parentId: preset.parentId,

            owner: 'client',
          })}
          onAddPlanRow={addPlanRow}
          onUpdatePlanRow={updatePlanRow}
        />
      ) : view === 'overview' ? (

        <ListView {...viewProps} groups={businessGroups} showBusiness={false} />
      ) : view === 'list' ? <ListView {...viewProps} />
        : view === 'kanban' ? <KanbanView {...viewProps} />
        : view === 'calendar' ? <CalendarView {...viewProps} />
        : view === 'dashboard' ? <DashboardView tasks={shown} accounts={feedAccounts} onEditTask={viewProps.onEditTask} groups={businessGroups} breakdownLabel="By business" />
        : <MatrixView tasks={shown} accounts={feedAccounts} onEditTask={viewProps.onEditTask} />}

      {taskModal && (
        <TaskModal
          key={taskModal.task?.id ?? 'new'}   // a different task is a different form; opening a subtask from inside its parent must not keep the parent's fields
          task={taskModal.task}
          defaultStatus={taskModal.status}
          defaultAccountId={taskModal.accountId}
          defaultParentId={taskModal.parentId}
          defaultProjectId={taskModal.projectId}
          columns={columns}
          defaultDueDate={taskModal.dueDate}
          defaultOwner="client"
          accounts={accounts}
          majors={majors}
          subtasks={taskModal.task ? tasks.filter(x => x.parentId === taskModal.task!.id) : undefined}
          onOpenTask={t => setTaskModal({ task: t })}
          onSetStatus={setStatus}
          onQuickAdd={viewProps.onQuickAdd}
          onClose={() => setTaskModal(null)}
          onDelete={deleteTask}
          onSave={data => {
            if (taskModal.task) persistTasks(tasks.map(t => t.id === taskModal.task!.id ? { ...t, ...data } : t))
            else createTask(data)
          }}
        />
      )}

      {addOpen && (
        <AddClientModal
          candidates={candidates}
          accounts={accounts}
          onClose={() => setAddOpen(false)}
          onAdd={addClientToProjects}
        />
      )}

      {bizModal && (
        <BusinessModal
          account={bizModal.account}
          contacts={contacts}
          onClose={() => setBizModal(null)}
          onSave={saveBusiness}
          onDelete={bizModal.account ? () => deleteBusiness(bizModal.account!.id) : undefined}
        />
      )}
    </div>
  )
}

function dedupeContacts(list: ContactSuggestion[]): ContactSuggestion[] {
  const seen = new Set<string>()
  const out: ContactSuggestion[] = []
  for (const c of list) {
    const email = (c.email ?? '').trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push({ name: c.name ?? '', email })
  }
  return out
}
