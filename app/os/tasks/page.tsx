'use client'
import { BRAND } from '@/lib/brand'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { confirmAction } from '../ConfirmHost'
import { type BusinessAccount, getAccounts, setAccountsLocal, rowToAccount } from '@/lib/business-accounts'
import { TEAM,
  type Task, type Status,
  loadTasks, saveTasks, pullTasks, taskUid, TaskModal, isInternalTask, reorderTasks,
} from './task-shared'
import {
  ListView, KanbanView, CalendarView, MatrixView,
  ViewToggle, FilterBar, applyFilters, EMPTY_FILTERS, groupTasks,
  type Filters, type ViewKey,
  type TaskGroup,
} from '@/components/task-board/TaskViews'
import { DashboardView } from '@/components/task-board/DashboardView'
import { ObjectivesView } from '@/components/task-board/ObjectivesView'
import { type Objective, objectiveUid, progressFor, isGraduated, byObjectiveOrder, graduated } from '@/lib/objectives'
import { loadObjectives, saveObjectives, pullObjectives } from '@/lib/objectives-store'
import { AREAS, type LevelId } from '@/lib/business-areas'
import {
  loadColumns, saveColumns, pullColumns, columnUid,
  type TaskColumn, type ColumnKind,
} from '@/lib/task-system/columns'

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'objectives', label: 'Objectives' },
  { key: 'list',     label: 'List' },
  { key: 'areas',    label: 'Areas' },
  { key: 'kanban',   label: 'Kanban' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'matrix',   label: 'Priority' },

  { key: 'dashboard', label: 'Dashboard' },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [accounts, setAccounts] = useState<BusinessAccount[]>([])
  const [view, setView] = useState<ViewKey>('objectives')
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [modal, setModal] = useState<{ task?: Task; status?: Status; parentId?: string; area?: LevelId; dueDate?: string; objectiveId?: string } | null>(null)
  const [quick, setQuick] = useState('')

  const [columns, setColumns] = useState<TaskColumn[]>([])

  const tasksRef = useRef<Task[]>([])

  useEffect(() => {
    setTasks(loadTasks())
    setAccounts(getAccounts())
    setColumns(loadColumns())
    setObjectives(loadObjectives())
    tasksRef.current = loadTasks()
    pullTasks().then(rows => {
      if (rows) { tasksRef.current = rows; setTasks(rows) }
    })
    pullObjectives().then(rows => { if (rows) setObjectives(rows) })

    pullColumns().then(cols => { if (cols) setColumns(cols) })
    fetch('/api/accounts-sync')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data.accounts) || !data.accounts.length) return
        const rows = data.accounts.map(rowToAccount)
        setAccountsLocal(rows)
        setAccounts(rows)
      })
      .catch(() => {})
  }, [])

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

  function persist(updated: Task[], deletedIds: string[] = []) {
    tasksRef.current = updated
    saveTasks(updated, deletedIds)
    setTasks(updated)
  }

  function createTask(data: Omit<Task, 'id' | 'createdAt'>): Task {
    const t = { ...data, id: taskUid(), createdAt: new Date().toISOString() }
    persist([...tasks, t])
    return t
  }

  function persistObjectives(next: Objective[], deletedIds: string[] = []) {
    setObjectives(next)
    saveObjectives(next, deletedIds)
  }

  function createObjective(title: string, area?: LevelId) {
    persistObjectives([...objectives, {
      id: objectiveUid(), title: title.slice(0, 300), area,
      sortOrder: objectives.length, createdAt: new Date().toISOString(),
    }])
  }

  function updateObjective(o: Objective, patch: Partial<Objective>) {
    persistObjectives(objectives.map(x => (x.id === o.id ? { ...x, ...patch } : x)))
  }

  async function deleteObjective(o: Objective) {
    const linked = tasks.filter(t => t.objectiveId === o.id)
    if (!(await confirmAction({
      message: `Delete the objective "${o.title}"?`,
      detail: linked.length
        ? `Its ${linked.length} project${linked.length === 1 ? '' : 's'} stay on your board, just not under an objective.`
        : 'Nothing else changes.',
    }))) return
    if (linked.length) persist(tasks.map(t => (t.objectiveId === o.id ? { ...t, objectiveId: undefined } : t)))
    persistObjectives(objectives.filter(x => x.id !== o.id), [o.id])
  }

  function addProject(o: Objective, title: string) {
    createTask({
      title, description: '', status: 'todo', priority: 'medium',
      assignee: BRAND.owner, dueDate: o.dueDate ?? '', area: o.area,
      objectiveId: o.id, owner: 'me',
    })
  }

  function setStatus(t: Task, status: Status) {
    persist(tasks.map(x => x.id === t.id ? { ...x, status } : x))
  }

  async function deleteTask(t: Task): Promise<boolean> {
    const subIds = tasks.filter(x => x.parentId === t.id).map(x => x.id)
    if (!(await confirmAction({
      message: `Delete "${t.title}"?`,
      detail: subIds.length ? `Its ${subIds.length} subtask${subIds.length === 1 ? '' : 's'} go with it. This cannot be undone.` : 'This cannot be undone.',
    }))) return false
    const removeIds = new Set([t.id, ...subIds])
    persist(tasks.filter(x => !removeIds.has(x.id)), [...removeIds])
    return true
  }

  function quickAdd() {
    const title = quick.trim()
    if (!title) return
    createTask({ title, description: '', status: 'todo', priority: 'medium', assignee: BRAND.owner, dueDate: '' })
    setQuick('')
  }

  const internal = useMemo(() => tasks.filter(isInternalTask), [tasks])
  const shown = useMemo(
    () => applyFilters(internal, filters, columns),
    [internal, filters, columns],
  )

  const areaGroups: TaskGroup[] = useMemo(() => [
    ...AREAS.map(a => ({
      id: a.id, label: a.heading, sublabel: a.name, color: a.color,
      match: (t: Task) => t.area === a.id,
      preset: { area: a.id },
    })),
    {
      id: '__inbox', label: 'Inbox', sublabel: 'Unsorted', color: 'var(--os-text-faint)',
      match: (t: Task) => !t.area,
      preset: {},
    },
  ], [])

  const objectiveGroups: TaskGroup[] = useMemo(() => {
    const color = (o: Objective) => AREAS.find(a => a.id === o.area)?.color ?? 'var(--os-accent)'
    const sub = (o: Objective) => [
      AREAS.find(a => a.id === o.area)?.heading,
      o.dueDate ? `due ${new Date(`${o.dueDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '',
    ].filter(Boolean).join(' · ')
    const group = (o: Objective, done: boolean): TaskGroup => ({
      id: o.id, label: done ? `✓ ${o.title}` : o.title,
      sublabel: done ? 'Graduated' : sub(o) || undefined,
      color: done ? 'var(--os-good)' : color(o),
      match: (t: Task) => t.objectiveId === o.id,
      preset: { objectiveId: o.id },
      progress: progressFor(o.id, internal).pct,
    })
    const known = new Set(objectives.map(o => o.id))
    return [
      ...objectives.filter(o => !isGraduated(o)).sort(byObjectiveOrder).map(o => group(o, false)),
      {
        id: '__none', label: 'No objective', sublabel: 'Not under an objective yet', color: 'var(--os-text-faint)',

        match: (t: Task) => !t.objectiveId || !known.has(t.objectiveId),
        preset: {},
      },
      ...graduated(objectives).map(o => group(o, true)),
    ]
  }, [objectives, internal])
  const { majors, subsOf } = useMemo(() => groupTasks(internal), [internal])
  const open = internal.filter(t => t.status !== 'done').length
  const subCount = [...subsOf.values()].reduce((n, l) => n + l.length, 0)

  const viewProps = {
    tasks: shown,
    accounts,
    onEditTask: (t: Task) => setModal({ task: t }),

    onQuickAdd: (title: string, preset: { accountId?: string; parentId?: string; area?: LevelId; objectiveId?: string }) => {

      const o = preset.objectiveId ? objectives.find(x => x.id === preset.objectiveId) : undefined
      if (o) return addProject(o, title)
      createTask({
        title, description: '', status: 'todo', priority: 'medium',
        assignee: '', dueDate: '', parentId: preset.parentId, accountId: preset.accountId,
        area: preset.area,
      })
    },
    team: TEAM,
    columns,
    onAddColumn: addColumn,
    onRemoveColumn: removeColumn,
    onSetStatus: setStatus,

    onPatchTask: (t: Task, patch: Partial<Task>) =>
      persist(tasks.map(x => (x.id === t.id ? { ...x, ...patch } : x))),

    onReorder: (orderedIds: string[], movedId: string, extra?: Partial<Task>) =>
      persist(reorderTasks(tasks, orderedIds, movedId, extra)),
    onAddTask: (preset?: { parentId?: string; area?: LevelId; dueDate?: string; status?: Status }) => setModal(preset ?? {}),
    onDeleteTask: deleteTask,
  }

  return (
    <div className="os-board-page">

      <div className="os-page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="os-page-title">Internal Tasks</h1>
          <p className="os-page-sub">
            Launches, content, operations · {majors.length} major task{majors.length === 1 ? '' : 's'}
            {subCount > 0 ? `, ${subCount} subtask${subCount === 1 ? '' : 's'}` : ''} · {open} open ·{' '}
            <Link href="/os/projects" style={{ color: 'var(--os-accent)', fontWeight: 700, textDecoration: 'none' }}>
              client work lives in Projects →
            </Link>
          </p>
        </div>
      </div>

      <div className="os-board-controls" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <ViewToggle views={VIEWS} view={view} setView={setView} />
        {view !== 'objectives' && <FilterBar tasks={internal} accounts={accounts} filters={filters} setFilters={setFilters} showBusiness={false} columns={columns} />}
      </div>

      <div className="os-card os-capture-bar" style={{ display: 'flex', gap: 8, padding: '10px 12px', marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 15, flexShrink: 0 }} aria-hidden>⚡</span>
        <input
          value={quick}
          onChange={e => setQuick(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); quickAdd() } }}
          placeholder="Capture anything, press Enter"
          style={{ flex: 1, minWidth: 160, border: 'none', background: 'transparent', fontSize: 14, padding: '8px 4px', color: 'var(--os-text)', outline: 'none' }}
        />
        <button onClick={quickAdd} className="os-btn os-btn-primary os-btn-sm" style={{ padding: '8px 14px', fontSize: 12.5 }}>Add</button>
      </div>


      {view === 'objectives' ? (
        <ObjectivesView
          objectives={objectives} tasks={internal}
          onEditTask={viewProps.onEditTask} onSetStatus={setStatus}
          onAddProject={addProject} onCreateObjective={createObjective}
          onUpdateObjective={updateObjective} onDeleteObjective={deleteObjective}
        />
      ) : view === 'areas' ? <ListView {...viewProps} groups={areaGroups} allTasks={internal} showBusiness={false} />
        : view === 'list' ? <ListView {...viewProps} groups={objectiveGroups} allTasks={internal} showBusiness={false} stacked />
        : view === 'kanban' ? <KanbanView {...viewProps} />
        : view === 'calendar' ? <CalendarView {...viewProps} />
        : view === 'dashboard' ? <DashboardView tasks={shown} accounts={accounts} onEditTask={viewProps.onEditTask} groups={areaGroups} breakdownLabel="By area" />
        : <MatrixView tasks={shown} accounts={accounts} onEditTask={viewProps.onEditTask} />}

      {modal && (
        <TaskModal
          key={modal.task?.id ?? 'new'}   // a different task is a different form; opening a subtask from inside its parent must not keep the parent's fields
          task={modal.task}
          defaultStatus={modal.status}
          defaultParentId={modal.parentId}
          defaultArea={modal.area}
          defaultObjectiveId={modal.objectiveId}
          objectives={objectives}
          columns={columns}
          internalBoard
          defaultDueDate={modal.dueDate}
          accounts={accounts}
          majors={majors}
          subtasks={modal.task ? tasks.filter(x => x.parentId === modal.task!.id) : undefined}
          onOpenTask={t => setModal({ task: t })}
          onSetStatus={setStatus}
          onQuickAdd={viewProps.onQuickAdd}
          onClose={() => setModal(null)}
          onDelete={deleteTask}
          onSave={data => {
            if (modal.task) {
              const before = modal.task
              const after = { ...before, ...data }
              persist(tasks.map(t => t.id === before.id ? after : t))
            } else {
              createTask(data)
            }
          }}
        />
      )}
    </div>
  )
}
