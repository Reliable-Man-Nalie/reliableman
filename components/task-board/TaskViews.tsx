'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BoardTask as Task, type BoardGroup as BusinessAccount,
  type Priority, type Status, type BoardProps,
} from '@/lib/task-system/types'
import { AREAS, type LevelId } from '@/lib/business-areas'
import { assigneesOf, joinAssignees } from '@/app/os/tasks/task-shared'
import { descriptionToText } from '@/lib/task-text'
import { COLUMN_KINDS, safeUrl, type TaskColumn, type ColumnKind } from '@/lib/task-system/columns'
type ExternalEvent = { id: string; title: string; day: string; time: string; link?: string }

const FALLBACK_TEAM = ['Me']

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'var(--os-bad)' },
  high:   { label: 'High',   color: '#ea580c' },
  medium: { label: 'Medium', color: '#ca8a04' },
  low:    { label: 'Low',    color: 'var(--os-text-faint)' },
}

export const STATUS_META: { key: Status; label: string; dot: string }[] = [
  { key: 'todo',        label: 'To Do',       dot: 'var(--os-warn)' },
  { key: 'in_progress', label: 'In Progress',  dot: 'var(--os-accent)' },
  { key: 'done',        label: 'Done',         dot: 'var(--os-good)' },
]

const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const chipInk = (c: string) => `color-mix(in srgb, ${c} 82%, #000)`

const pillSelect: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  border: 'none', borderRadius: 6, padding: '4px 10px',
  fontSize: 11, fontWeight: 800, color: '#fff',
  textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'center',
  cursor: 'pointer', outline: 'none', minWidth: 72,
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

export function daysLeftLabel(iso: string): { text: string; tone: string } | null {
  const d = dueInfo(iso)
  if (!d) return null
  if (d.days < 0) return { text: `${Math.abs(d.days)}d over`, tone: 'var(--os-bad)' }
  if (d.days === 0) return { text: 'Today', tone: 'var(--os-warn)' }
  if (d.days === 1) return { text: '1 day', tone: 'var(--os-warn)' }
  return { text: `${d.days} days`, tone: 'var(--os-text-faint)' }
}

export function dueInfo(iso: string): { text: string; overdue: boolean; days: number } | null {
  if (!iso) return null
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const days = Math.floor((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  const text = days === 0 ? 'Today' : days === 1 ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { text, overdue: days < 0, days }
}

function byDueThenPriority(a: Task, b: Task) {
  const ta = a.dueDate || '9999-12-31', tb = b.dueDate || '9999-12-31'
  if (ta !== tb) return ta < tb ? -1 : 1
  return RANK[a.priority] - RANK[b.priority]
}

export function byBoardOrder(a: Task, b: Task) {
  const da = a.status === 'done' ? 1 : 0, db = b.status === 'done' ? 1 : 0
  if (da !== db) return da - db
  const oa = a.sortOrder ?? Number.POSITIVE_INFINITY, ob = b.sortOrder ?? Number.POSITIVE_INFINITY
  if (oa !== ob) return oa < ob ? -1 : 1
  return byDueThenPriority(a, b)
}

export function groupTasks(tasks: Task[]): { majors: Task[]; subsOf: Map<string, Task[]> } {
  const ids = new Set(tasks.map(t => t.id))
  const majors = tasks.filter(t => !t.parentId || !ids.has(t.parentId)).sort(byBoardOrder)
  const subsOf = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.parentId || !ids.has(t.parentId)) continue
    subsOf.set(t.parentId, [...(subsOf.get(t.parentId) ?? []), t].sort(byBoardOrder))
  }
  return { majors, subsOf }
}

export type ViewProps = BoardProps

const bizName = (accounts: BusinessAccount[], id?: string) =>
  id ? accounts.find(a => a.id === id)?.name : undefined

function StatusSelect({ task, onSetStatus }: { task: Task; onSetStatus: ViewProps['onSetStatus'] }) {
  const meta = STATUS_META.find(s => s.key === task.status)
  return (
    <select
      value={task.status}
      onClick={e => e.stopPropagation()}
      onChange={e => onSetStatus(task, e.target.value as Status)}
      style={{ ...pillSelect, background: chipInk(meta?.dot ?? 'var(--os-text-faint)') }}
    >
      {STATUS_META.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  )
}

function AssigneeDot({ name, size = 20 }: { name: string; size?: number }) {
  const names = assigneesOf({ assignee: name })
  if (names.length === 0) return null
  const step = Math.round(size * 0.68)
  return (
    <span title={names.join(', ')} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, paddingLeft: 0 }}>
      {names.map((n, i) => (
        <span key={n} style={{
          width: size, height: size, borderRadius: '50%', background: 'var(--os-accent)', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.round(size * 0.42), fontWeight: 800, flexShrink: 0,
          marginLeft: i === 0 ? 0 : step - size, boxShadow: i === 0 ? 'none' : '0 0 0 2px var(--os-base-2, #fff)',
          position: 'relative', zIndex: i,
        }}>
          {initials(n)}
        </span>
      ))}
    </span>
  )
}

function AssigneeMenu({ anchor, value, team, onChange, onClose }: {
  anchor: DOMRect; value: string; team: string[]; onChange: (v: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [onClose])
  const chosen = assigneesOf({ assignee: value })
  const width = 200
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8)
  const below = anchor.bottom + 6 + 44 * (team.length + 1) < window.innerHeight
  return (
    <div
      ref={ref}
      role="listbox"
      aria-multiselectable
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', left, width, zIndex: 250,
        ...(below ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 }),
        background: 'var(--os-base-2, #fff)', backgroundImage: 'var(--os-card-image, none)',
        border: '1px solid var(--os-line)', borderRadius: 12, padding: 6,
        boxShadow: '0 18px 44px -14px rgba(0,0,0,.35)',
      }}
    >
      {team.map(n => {
        const on = chosen.includes(n)
        return (
          <button
            key={n} type="button" role="option" aria-selected={on}
            onClick={() => onChange(joinAssignees(on ? chosen.filter(x => x !== n) : [...chosen, n]))}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              padding: '8px 8px', borderRadius: 8, border: 'none', background: on ? 'var(--os-chip)' : 'transparent',
              color: 'var(--os-text)', fontSize: 13, fontWeight: on ? 700 : 600, cursor: 'pointer',
            }}
          >
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: on ? 'var(--os-accent)' : 'var(--os-line)', color: on ? '#fff' : 'var(--os-text-muted)', display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{initials(n)}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
            <span aria-hidden style={{ color: on ? 'var(--os-accent)' : 'transparent', fontWeight: 900 }}>✓</span>
          </button>
        )
      })}
      {chosen.length > 0 && (
        <button type="button" onClick={() => onChange('')} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px', borderRadius: 8, border: 'none', borderTop: '1px solid var(--os-line)', background: 'transparent', color: 'var(--os-text-faint)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Clear
        </button>
      )}
    </div>
  )
}

const cellSelect: React.CSSProperties = {
  border: '1px solid transparent', background: 'transparent', color: 'var(--os-text)',
  fontSize: 12.5, fontWeight: 600, borderRadius: 6, padding: '3px 5px',
  cursor: 'pointer', maxWidth: 150,
}

function InlineAssignee({ task, onPatch, team }: { task: Task; onPatch?: ViewProps['onPatchTask']; team?: string[] }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const name = task.assignee ?? ''
  const avatar = name
    ? <AssigneeDot name={name} size={26} />
    : <span aria-hidden style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px dashed var(--os-line-strong)', display: 'inline-block' }} />
  if (!onPatch) return <span style={{ display: 'inline-flex' }} title={name || 'Unassigned'}>{avatar}</span>
  return (
    <>
      <button
        type="button"
        aria-label={name ? `Assigned to ${name}. Change` : 'Assign'}
        title={name || 'Unassigned'}
        onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget.getBoundingClientRect()) }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, height: 34, padding: '0 4px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8 }}
      >
        {avatar}
      </button>
      {anchor && (
        <AssigneeMenu
          anchor={anchor} value={name} team={team ?? FALLBACK_TEAM}
          onChange={v => onPatch(task, { assignee: v })}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  )
}

function InlinePriority({ task, onPatch }: { task: Task; onPatch?: ViewProps['onPatchTask'] }) {
  const meta = PRIORITY_META[task.priority]
  if (!onPatch) return <span style={{ ...pillSelect, display: 'inline-block', background: chipInk(meta.color) }}>{meta.label}</span>
  return (
    <select
      value={task.priority}
      onClick={e => e.stopPropagation()}
      onChange={e => onPatch(task, { priority: e.target.value as Priority })}
      style={{ ...pillSelect, background: chipInk(meta.color) }}
    >
      {(Object.keys(PRIORITY_META) as Priority[]).map(k => <option key={k} value={k}>{PRIORITY_META[k].label}</option>)}
    </select>
  )
}

function InlineBusiness({ task, accounts, onPatch }: { task: Task; accounts: BusinessAccount[]; onPatch?: ViewProps['onPatchTask'] }) {
  const name = bizName(accounts, task.accountId)
  if (!onPatch) return <>{name ?? <span style={{ color: 'var(--os-text-faint)' }}>Internal</span>}</>
  return (
    <select
      value={task.accountId ?? ''}
      onClick={e => e.stopPropagation()}

      onChange={e => onPatch(task, { accountId: e.target.value || undefined })}
      style={{ ...cellSelect, color: name ? 'var(--os-text)' : 'var(--os-text-faint)' }}
    >
      <option value="">Internal</option>
      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  )
}

function InlineDue({ task, onPatch }: { task: Task; onPatch?: ViewProps['onPatchTask'] }) {
  if (!onPatch) return <DueChip iso={task.dueDate} />
  const due = dueInfo(task.dueDate)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
      <input
        type="date"
        value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
        onChange={e => onPatch(task, { dueDate: e.target.value })}
        style={{

          ...cellSelect, width: 112, fontSize: 12,
          color: due ? (due.overdue ? 'var(--os-bad)' : 'var(--os-text)') : 'var(--os-text-faint)',
          fontWeight: due?.overdue ? 800 : 600,
        }}
      />
    </span>
  )
}

function DueChip({ iso }: { iso: string }) {
  const due = dueInfo(iso)
  if (!due) return <span style={{ color: 'var(--os-text-faint)', fontSize: 12 }}>—</span>
  return (
    <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: due.overdue ? 'var(--os-bad)' : 'var(--os-text)' }}>
      {due.overdue ? `⚠ ${due.text}` : due.text}
    </span>
  )
}

function InlineField({ task, col, onPatch }: { task: Task; col: TaskColumn; onPatch?: ViewProps['onPatchTask'] }) {
  const value = task.fields?.[col.id] ?? ''
  const commit = (v: string) => {
    if (v === value || !onPatch) return
    onPatch(task, { fields: { ...(task.fields ?? {}), [col.id]: v } })
  }

  if (col.kind === 'url' && value && onPatch) {
    const href = safeUrl(value)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 220 }}>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ color: 'var(--os-accent)', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {href.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        ) : (

          <span style={{ fontSize: 12.5, color: 'var(--os-text-faint)' }}>{value}</span>
        )}
        <button onClick={() => commit('')} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 11, padding: 0 }}>×</button>
      </span>
    )
  }

  if (col.kind === 'longtext') {
    return (
      <span title={value} style={{ display: 'inline-block', maxWidth: 200, fontSize: 12.5, color: value ? 'var(--os-text)' : 'var(--os-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || '—'}
      </span>
    )
  }

  if (!onPatch) return <span style={{ fontSize: 12.5 }}>{value || '—'}</span>

  return (
    <input
      defaultValue={value}
      key={value}
      type={col.kind === 'number' ? 'number' : col.kind === 'date' ? 'date' : 'text'}
      onClick={e => e.stopPropagation()}
      onBlur={e => commit(e.target.value.trim())}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="—"
      style={{ width: col.kind === 'date' ? 130 : 110, border: '1px solid transparent', background: 'transparent', color: 'var(--os-text)', fontSize: 12.5, padding: '3px 5px', borderRadius: 6, outline: 'none' }}
    />
  )
}

function AddColumn({ onAdd }: { onAdd: (name: string, kind: ColumnKind) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ColumnKind>('text')
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Add a column"
        style={{ background: 'none', border: '1px dashed var(--os-line-strong)', borderRadius: 7, cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 14, lineHeight: 1, padding: '3px 9px' }}>
        +
      </button>
    )
  }
  const submit = () => { const n = name.trim(); if (n) { onAdd(n, kind); setName(''); setKind('text'); setOpen(false) } }
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      <input value={name} autoFocus placeholder="Column name"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setName('') } }}
        style={{ width: 120, padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--os-line)', fontSize: 12, color: 'var(--os-text)', background: 'var(--os-card)', outline: 'none', textTransform: 'none', letterSpacing: 0 }} />
      <select value={kind} onChange={e => setKind(e.target.value as ColumnKind)}
        style={{ padding: '5px 6px', borderRadius: 6, border: '1.5px solid var(--os-line)', fontSize: 12, color: 'var(--os-text)', background: 'var(--os-card)', textTransform: 'none', letterSpacing: 0 }}>
        {COLUMN_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
      </select>
      <button onClick={submit} className="os-btn os-btn-primary os-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }}>Add</button>
    </span>
  )
}

function ColumnHead({ col, onRemove }: { col: TaskColumn; onRemove?: (id: string) => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {col.name}
      {onRemove && (
        <button
          onClick={() => { if (armed) onRemove(col.id); else setArmed(true) }}
          onBlur={() => setArmed(false)}
          title={armed ? 'Press again to remove this column' : 'Remove this column'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, textTransform: 'none', letterSpacing: 0, color: armed ? 'var(--os-bad)' : 'var(--os-text-faint)', fontWeight: armed ? 800 : 400 }}
        >
          {armed ? 'remove?' : '×'}
        </button>
      )}
    </span>
  )
}

export type TaskGroup = {
  id: string
  label: string
  sublabel?: string
  color: string

  match: (t: Task) => boolean

  preset?: { area?: LevelId; accountId?: string; objectiveId?: string }

  progress?: number
}

const COL_WIDTH_KEY = 'bos_task_col_widths'
const MIN_COL = 90

function useColumnWidths(): [Record<string, number>, (id: string, w: number) => void] {
  const [widths, setWidths] = useState<Record<string, number>>({})
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COL_WIDTH_KEY)
      if (raw) setWidths(JSON.parse(raw) as Record<string, number>)
    } catch { /* private mode: the defaults are fine */ }
  }, [])
  const set = useCallback((id: string, w: number) => {
    setWidths(prev => {
      const next = { ...prev, [id]: Math.max(MIN_COL, Math.round(w)) }
      try { window.localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])
  return [widths, set]
}

const COL_ORDER_KEY = 'bos_task_col_order'

function useColumnOrder(known: string[]): [string[], (from: string, to: string) => void] {
  const [saved, setSaved] = useState<string[] | null>(null)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COL_ORDER_KEY)
      if (raw) setSaved(JSON.parse(raw) as string[])
    } catch { /* private mode: the defaults are fine */ }
  }, [])
  const order = [...(saved ?? []).filter(id => known.includes(id)), ...known.filter(id => !(saved ?? []).includes(id))]
  const move = useCallback((from: string, to: string) => {
    setSaved(() => {
      const cur = [...order]
      const i = cur.indexOf(from), j = cur.indexOf(to)
      if (i < 0 || j < 0 || i === j) return cur
      cur.splice(i, 1)
      cur.splice(j, 0, from)
      try { window.localStorage.setItem(COL_ORDER_KEY, JSON.stringify(cur)) } catch { /* ignore */ }
      return cur
    })
  }, [order]) // eslint-disable-line react-hooks/exhaustive-deps
  return [order, move]
}

type Sort = { id: string; dir: 'asc' | 'desc' } | null

function sortKey(id: string, t: Task, columns: TaskColumn[]): string | number {
  switch (id) {
    case 'task': return t.title.toLowerCase()
    case 'assignee': return (t.assignee ?? '').toLowerCase() || '\uffff'
    case 'priority': return RANK[t.priority]
    case 'due': case 'left': return t.dueDate || '9999-12-31'
    case 'status': return STATUS_META.findIndex(m => m.key === t.status)
    case 'business': return (t.accountId ?? '').toLowerCase()
    default: {
      const col = columns.find(c => c.id === id)
      const v = String(t.fields?.[id] ?? '')
      if (!col) return v
      if (col.kind === 'number') return v === '' ? Number.POSITIVE_INFINITY : Number(v)
      return v.toLowerCase() || '\uffff'
    }
  }
}

function sortTasks(list: Task[], sort: Sort, columns: TaskColumn[]): Task[] {
  if (!sort) return list
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const ka = sortKey(sort.id, a, columns), kb = sortKey(sort.id, b, columns)
    if (ka === kb) return byBoardOrder(a, b)
    return (ka < kb ? -1 : 1) * sign
  })
}

function ColResize({ onDrag }: { onDrag: (startX: number, startW: number, x: number) => void }) {
  return (
    <span
      className="os-col-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize this column"
      onPointerDown={e => {
        e.preventDefault()
        e.stopPropagation()
        const th = (e.currentTarget.parentElement as HTMLElement)
        const startW = th.getBoundingClientRect().width
        const startX = e.clientX
        const move = (ev: PointerEvent) => onDrag(startX, startW, ev.clientX)
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
        }

        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
    />
  )
}

export type BoardViewProps = ViewProps & {
  groups?: TaskGroup[]; allTasks?: Task[]; showBusiness?: boolean

  stacked?: boolean
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return narrow
}

export function ListView(props: BoardViewProps) {
  return useIsNarrow() ? <MobileBoard {...props} /> : <TableBoard {...props} />
}

function TableBoard({ tasks, accounts, onEditTask, onSetStatus, onAddTask, onPatchTask, onDeleteTask, team, onQuickAdd, onReorder, columns = [], onAddColumn, onRemoveColumn, groups, allTasks, showBusiness = true, stacked = false }: BoardViewProps) {
  const [colWidths, setColWidth] = useColumnWidths()

  const [sort, setSort] = useState<Sort>(null)
  const [dragCol, setDragCol] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const toggleSort = (id: string) => setSort(cur => cur?.id !== id ? { id, dir: 'asc' } : cur.dir === 'asc' ? { id, dir: 'desc' } : null)

  const th = (id: string, label: React.ReactNode, fallback: number, extra: React.CSSProperties = {}) => {
    const w = colWidths[id] ?? fallback
    const sortable = id !== 'actions'
    const movable = id !== 'task' && id !== 'actions'
    const on = sort?.id === id
    return (
      <th
        key={id}
        draggable={movable}
        onDragStart={e => { if (!movable) return; setDragCol(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', `col:${id}`) }}
        onDragEnd={() => { setDragCol(null); setOverCol(null) }}
        onDragOver={e => { if (dragCol && movable && dragCol !== id) { e.preventDefault(); if (overCol !== id) setOverCol(id) } }}
        onDrop={e => { if (dragCol && movable && dragCol !== id) { e.preventDefault(); moveCol(dragCol, id) } setDragCol(null); setOverCol(null) }}
        style={{
          ...head, width: w, minWidth: w, ...(id === 'task' ? {} : { position: 'relative' }), ...extra,
          cursor: movable ? 'grab' : undefined,
          opacity: dragCol === id ? 0.4 : 1,
          boxShadow: overCol === id ? 'inset 3px 0 0 var(--os-accent)' : 'none',
        }}
      >
        {sortable ? (
          <button
            type="button"
            onClick={() => toggleSort(id)}
            title={on ? (sort!.dir === 'asc' ? 'Sorted up. Click for down' : 'Sorted down. Click to clear') : 'Sort by this column'}
            style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: on ? 'var(--os-accent)' : 'inherit', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
          >
            {label}
            <span aria-hidden style={{ fontSize: 9, opacity: on ? 1 : 0.35 }}>{on ? (sort!.dir === 'asc' ? '▲' : '▼') : '▲▼'}</span>
          </button>
        ) : label}
        <ColResize onDrag={(startX, startW, x) => setColWidth(id, startW + (x - startX))} />
      </th>
    )
  }

  const cols = (showBusiness ? 8 : 7) + columns.length
  const { majors: majorsRaw, subsOf: subsRaw } = groupTasks(tasks)

  const knownCols = [...(showBusiness ? ['business'] : []), 'assignee', 'priority', 'due', 'left', 'status', ...columns.map(c => c.id)]
  const [colOrder, moveCol] = useColumnOrder(knownCols)
  const majors = sortTasks(majorsRaw, sort, columns)
  const subsOf = new Map([...subsRaw].map(([k, v]) => [k, sortTasks(v, sort, columns)]))
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [drafting, setDrafting] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const [groupDraft, setGroupDraft] = useState<Record<string, string>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<string | null>(null)

  function commitDraft(parent: Task, keepGoing: boolean) {
    const title = draft.trim()
    if (title && onQuickAdd) onQuickAdd(title, { parentId: parent.id, accountId: parent.accountId })
    setDraft('')

    if (!keepGoing) setDrafting(null)
  }

  function draftRowFor(m: Task): React.ReactNode {
    if (drafting !== m.id) return undefined
    return (
      <tr key={`${m.id}-draft`} style={{ background: 'var(--os-card-alt, rgba(124,58,237,.03))' }}>
        <td style={{ ...cell, paddingLeft: 40 }} colSpan={cols}>
          <span className="os-span-stick" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, left: 40 }}>
            <span aria-hidden style={{ width: 12, height: 12, borderLeft: '1.5px solid var(--os-line-strong)', borderBottom: '1.5px solid var(--os-line-strong)', borderBottomLeftRadius: 4, marginLeft: -18, marginTop: -6, flexShrink: 0 }} />
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitDraft(m, true) }
                if (e.key === 'Escape') { setDraft(''); setDrafting(null) }
              }}
              onBlur={() => commitDraft(m, false)}
              placeholder="Type a subtask, Enter for the next one"
              style={{ flex: 1, minWidth: 0, border: '1px solid var(--os-line)', background: 'var(--os-card)', color: 'var(--os-text)', borderRadius: 6, padding: '5px 9px', fontSize: 13, outline: 'none' }}
            />
          </span>
        </td>
      </tr>
    )
  }

  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const cellBase: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--os-line)', fontSize: 13, color: 'var(--os-text)', verticalAlign: 'middle' }
  const cell = cellBase
  const head: React.CSSProperties = { ...cell, fontSize: 10.5, fontWeight: 800, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap', textAlign: 'left' }

  const [overRow, setOverRow] = useState<{ id: string; where: 'before' | 'after' } | null>(null)
  const dragged = dragId ? (allTasks ?? tasks).find(x => x.id === dragId) ?? null : null
  const isSub = (x: Task) => !!x.parentId && (allTasks ?? tasks).some(y => y.id === x.parentId)
  const canLand = (target: Task) => {
    if (!dragged || !onReorder || dragged.id === target.id) return false
    const a = isSub(dragged), b = isSub(target)
    return a === b && (!a || dragged.parentId === target.parentId)
  }
  const siblingsOf = (t: Task): Task[] => {
    if (isSub(t)) return subsOf.get(t.parentId!) ?? []
    const g = groups?.find(x => x.match(t))
    return g ? majors.filter(g.match) : majors
  }
  const dropOnRow = (target: Task, where: 'before' | 'after') => {
    if (!dragged || !onReorder) return
    const list = siblingsOf(target).map(x => x.id).filter(id => id !== dragged.id)
    const at = list.indexOf(target.id)
    if (at < 0) return
    list.splice(where === 'before' ? at : at + 1, 0, dragged.id)
    const from = groups?.find(x => x.match(dragged)), to = groups?.find(x => x.match(target))
    const extra = !isSub(dragged) && groups && to && to !== from ? groupPatch(groups, to) : undefined
    onReorder(list, dragged.id, extra)
  }

  function Row({ t, sub }: { t: Task; sub: boolean }) {
    const subs = subsOf.get(t.id) ?? []
    const doneSubs = subs.filter(s => s.status === 'done').length
    const done = t.status === 'done'
    const hint = overRow?.id === t.id ? overRow.where : null

    const cell: React.CSSProperties = hint === 'before' ? { ...cellBase, boxShadow: 'inset 0 3px 0 var(--os-accent)' }
      : hint === 'after' ? { ...cellBase, boxShadow: 'inset 0 -3px 0 var(--os-accent)' } : cellBase
    return (

      <tr
        className={sub ? 'os-subrow' : undefined}

        onClick={() => onEditTask(t)}
        draggable={(!!groups && !sub && !!onPatchTask) || !!onReorder}
        onDragStart={e => { setDragId(t.id); e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => { setDragId(null); setOverGroup(null); setOverRow(null) }}
        onDragOver={e => {
          if (!canLand(t)) return
          e.preventDefault()
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          const where = e.clientY < r.top + r.height / 2 ? 'before' : 'after'
          if (overRow?.id !== t.id || overRow.where !== where) setOverRow({ id: t.id, where })
          if (groups) setOverGroup(null)
        }}
        onDrop={e => {
          if (!overRow || overRow.id !== t.id || !canLand(t)) return
          e.preventDefault()
          e.stopPropagation()   // the group's own drop handler must not ALSO file it at the end
          const where = overRow.where
          setDragId(null); setOverGroup(null); setOverRow(null)
          dropOnRow(t, where)
        }}
        style={{
          opacity: dragId === t.id ? 0.4 : done ? 0.55 : 1,
          background: sub ? 'var(--os-card-alt, rgba(124,58,237,.03))' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <td style={{ ...cell, fontWeight: sub ? 400 : 700, paddingLeft: sub ? 40 : 10, maxWidth: colWidths.task ?? 300 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {sub && (
              <span aria-hidden style={{ width: 12, height: 12, borderLeft: '1.5px solid var(--os-line-strong)', borderBottom: '1.5px solid var(--os-line-strong)', borderBottomLeftRadius: 4, marginLeft: -18, marginTop: -6, flexShrink: 0 }} />
            )}
            {!sub && subs.length > 0 && (
              <button onClick={e => { e.stopPropagation(); toggle(t.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 11, padding: 0, width: 14, flexShrink: 0 }}>
                {collapsed.has(t.id) ? '▶' : '▼'}
              </button>
            )}
            {!sub && subs.length === 0 && <span style={{ width: 14, flexShrink: 0 }} />}
            {!sub && onQuickAdd && (
              <button
                onClick={e => { e.stopPropagation(); setDrafting(t.id); setDraft(''); setCollapsed(prev => { const n = new Set(prev); n.delete(t.id); return n }) }}
                title="Add a subtask"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 15, lineHeight: 1, padding: 0, width: 15, flexShrink: 0 }}
              >
                +
              </button>
            )}
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_META[t.priority].color, flexShrink: 0 }} />
            {onPatchTask ? (

              <input
                defaultValue={t.title}
                key={t.title}
                onClick={e => e.stopPropagation()}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.title) onPatchTask(t, { title: v }) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                style={{ flex: 1, minWidth: 0, border: '1px solid transparent', background: 'transparent', color: 'var(--os-text)', fontSize: 13, fontWeight: 'inherit', padding: '3px 5px', borderRadius: 6, textDecoration: done ? 'line-through' : 'none', outline: 'none' }}
              />
            ) : (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</span>
            )}
            {!sub && subs.length > 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: doneSubs === subs.length ? 'var(--os-good)' : 'var(--os-text-faint)', background: 'var(--os-line)', borderRadius: 999, padding: '1px 7px', flexShrink: 0 }}>
                {doneSubs}/{subs.length}
              </span>
            )}
          </span>
        </td>
        {colOrder.map(id => {
          const td = { ...cell, whiteSpace: 'nowrap' as const }
          switch (id) {
            case 'business': return <td key={id} style={td}><InlineBusiness task={t} accounts={accounts} onPatch={onPatchTask} /></td>
            case 'assignee': return <td key={id} style={{ ...td, textAlign: 'center' }} onClick={e => e.stopPropagation()}><InlineAssignee task={t} onPatch={onPatchTask} team={team} /></td>
            case 'priority': return <td key={id} style={td}><InlinePriority task={t} onPatch={onPatchTask} /></td>
            case 'due': return <td key={id} style={td}><InlineDue task={t} onPatch={onPatchTask} /></td>
            case 'left': {
              const left = daysLeftLabel(t.dueDate)
              return (
                <td key={id} style={td}>
                  {left && t.status !== 'done'
                    ? <span style={{ fontSize: 12, fontWeight: 800, color: left.tone }}>{left.text}</span>
                    : <span style={{ color: 'var(--os-text-faint)', fontSize: 12 }}>—</span>}
                </td>
              )
            }
            case 'status': return <td key={id} style={td} onClick={e => e.stopPropagation()}><StatusSelect task={t} onSetStatus={onSetStatus} /></td>
            default: {
              const c = columns.find(x => x.id === id)
              return c ? (
                <td key={id} style={td} onClick={e => e.stopPropagation()}>
                  <InlineField task={t} col={c} onPatch={onPatchTask} />
                </td>
              ) : null
            }
          }
        })}
        <td style={{ ...cell, whiteSpace: 'nowrap', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {!sub && !onQuickAdd && (
              <button onClick={() => onAddTask({ parentId: t.id, accountId: t.accountId })} title="Add subtask" className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '3px 9px', fontSize: 11 }}>
                + Sub
              </button>
            )}
            {onDeleteTask && (
              <button onClick={() => onDeleteTask(t)} title="Delete task" className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '3px 8px', fontSize: 13, lineHeight: 1, color: 'var(--os-bad)' }}>
                <i className="ti ti-trash" />
              </button>
            )}
            <button onClick={() => onEditTask(t)} title="Open task details" className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '3px 8px', fontSize: 13, lineHeight: 1 }}>
              <i className="ti ti-layout-sidebar-right-expand" />
            </button>
          </span>
        </td>
      </tr>
    )
  }

  const groupTitle = (g: TaskGroup, total: number, openCount: number, over: boolean) => (

    <span className="os-span-stick" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
      <span style={{
        fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800,
        fontSize: stacked ? 16 : 14, color: stacked ? g.color : 'var(--os-text)',
      }}>{g.label}</span>
      {g.sublabel && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-text-faint)' }}>{g.sublabel}</span>}
      <span style={{ fontSize: 11.5, color: 'var(--os-text-faint)' }}>
        {over ? 'Drop here' : total === 0 ? 'nothing yet' : `${openCount} open${total !== openCount ? ` · ${total - openCount} done` : ''}`}
      </span>
      {g.progress !== undefined && <GroupBar pct={g.progress} color={g.color} />}
    </span>
  )

  const summaryFor = (id: string, all: Task[]): React.ReactNode => {
    if (id === 'status') return <SplitBar parts={STATUS_META.map(m => ({ label: m.label, color: m.dot, n: all.filter(t => t.status === m.key).length }))} />
    if (id === 'priority') return <SplitBar parts={(Object.keys(PRIORITY_META) as Priority[]).map(k => ({ label: PRIORITY_META[k].label, color: PRIORITY_META[k].color, n: all.filter(t => t.priority === k).length }))} />
    if (id === 'due') {
      const dates = all.map(t => t.dueDate).filter((d): d is string => !!d).sort()
      if (!dates.length) return null
      const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const first = f(dates[0]), last = f(dates[dates.length - 1])
      return <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--os-text-faint)', whiteSpace: 'nowrap' }}>{first === last ? first : `${first} – ${last}`}</span>
    }
    if (id === 'assignee') {
      const people = [...new Set(all.flatMap(t => assigneesOf(t)))]
      return people.length ? <span style={{ display: 'flex', justifyContent: 'center' }}><AssigneeDot name={people.join(', ')} /></span> : null
    }
    return null
  }
  const labelFor = (id: string): string => {
    switch (id) {
      case 'business': return 'Business'
      case 'assignee': return 'Assignee'
      case 'priority': return 'Priority'
      case 'due': return 'Due'
      case 'left': return 'Left'
      case 'status': return 'Status'
      default: return columns.find(c => c.id === id)?.name ?? ''
    }
  }

  return (

    <div className="os-card os-scroll-x" style={{ padding: '4px 8px', overflowX: 'auto' }}>
      <table className={stacked ? 'os-task-table os-task-table-stacked' : 'os-task-table'} style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          {stacked && groups?.[0] && (() => {
            const g0 = groups[0]
            const m0 = majors.filter(g0.match)
            return (
              <tr><td colSpan={cols} style={{ padding: '10px 10px 8px', background: 'var(--os-base-2, #fff)' }}>
                {groupTitle(g0, m0.length, m0.filter(t => t.status !== 'done').length, overGroup === g0.id)}
              </td></tr>
            )
          })()}
          <tr>
            {th('task', 'Task', 300)}
            {colOrder.map(id => {
              switch (id) {
                case 'business': return th('business', 'Business', 130)
                case 'assignee': return th('assignee', 'Assignee', 96, { textAlign: 'center' })
                case 'priority': return th('priority', 'Priority', 110)
                case 'due': return th('due', 'Due', 124)
                case 'left': return th('left', 'Left', 92)
                case 'status': return th('status', 'Status', 124)
                default: {
                  const c = columns.find(x => x.id === id)
                  return c ? th(c.id, <ColumnHead col={c} onRemove={onRemoveColumn} />, c.kind === 'longtext' ? 200 : 140) : null
                }
              }
            })}
            <th style={{ ...head, textAlign: 'right' }}>{onAddColumn && <AddColumn onAdd={onAddColumn} />}</th>
          </tr>
        </thead>
        {(groups ?? []).map((g, gi) => {
          const gMajors = majors.filter(g.match)
          const gOpen = gMajors.filter(t => t.status !== 'done').length
          const isOver = overGroup === g.id
          const commitGroup = () => {
            const title = (groupDraft[g.id] ?? '').trim()
            if (!title || !onQuickAdd) return
            onQuickAdd(title, { ...(g.preset ?? {}) })
            setGroupDraft(d => ({ ...d, [g.id]: '' }))
          }
          return (
            <tbody
              key={g.id}
              onDragOver={e => { if (dragId && onPatchTask) { e.preventDefault(); setOverGroup(g.id) } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverGroup(null) }}
              onDrop={e => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain') || dragId
                setDragId(null); setOverGroup(null); setOverRow(null)
                const t = (allTasks ?? tasks).find(x => x.id === id)
                if (!t || !onPatchTask) return

                const patch = groupPatch(groups ?? [], g)
                const already = Object.keys(patch)
                  .every(k => (t as unknown as Record<string, unknown>)[k] === (patch as Record<string, unknown>)[k])
                if (!already) onPatchTask(t, patch)
              }}
              style={{ outline: isOver ? '2px dashed var(--os-accent)' : 'none', outlineOffset: -2, ['--os-group' as string]: g.color } as React.CSSProperties}
            >
              {!stacked && <tr>
                <td colSpan={cols} style={{
                  padding: '14px 10px 8px', borderBottom: '1px solid var(--os-line)',
                  background: 'var(--os-base-2, #fff)',
                }}>
                  {groupTitle(g, gMajors.length, gOpen, isOver)}
                </td>
              </tr>}
              {stacked && gi > 0 && <>
                <tr className="os-stack-gap"><td colSpan={cols} style={{ height: 34, padding: 0, border: 'none', background: 'transparent' }} /></tr>
                <tr><td colSpan={cols} style={{ padding: '4px 10px 8px', background: 'var(--os-base-2, #fff)', borderBottom: 'none' }}>
                  {groupTitle(g, gMajors.length, gOpen, isOver)}
                </td></tr>
                <tr className="os-stack-labels">
                  <td style={{ ...head, borderTop: '1px solid var(--os-line)' }}>Task</td>
                  {colOrder.map(id => (
                    <td key={id} style={{ ...head, borderTop: '1px solid var(--os-line)', textAlign: id === 'assignee' ? 'center' : 'left' }}>
                      {labelFor(id)}
                    </td>
                  ))}
                  <td style={{ ...head, borderTop: '1px solid var(--os-line)' }} />
                </tr>
              </>}

              {gMajors.map(m => (
                <FragmentRows
                  key={m.id}
                  major={m}
                  subs={collapsed.has(m.id) ? [] : (subsOf.get(m.id) ?? [])}
                  Row={Row}
                  draftRow={draftRowFor(m)}
                />
              ))}

              {onQuickAdd && <tr>
                <td colSpan={cols} style={{ ...cell, padding: '6px 10px 12px' }}>
                  <span className="os-span-stick" style={{ display: 'inline-block', width: 'min(100%, 420px)' }}>
                  <input
                    value={groupDraft[g.id] ?? ''}
                    onChange={e => setGroupDraft(d => ({ ...d, [g.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitGroup() } }}
                    onBlur={commitGroup}
                    placeholder={`+  Add to ${g.label}`}
                    style={{
                      width: '100%', maxWidth: 420, border: '1px solid transparent', background: 'transparent',
                      color: 'var(--os-text)', borderRadius: 6, padding: '6px 8px', fontSize: 13, outline: 'none',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--os-line)'; e.target.style.background = 'var(--os-card)' }}
                  />
                  </span>
                </td>
              </tr>}
              {stacked && (() => {
                const all = gMajors.flatMap(m => [m, ...(subsOf.get(m.id) ?? [])])
                if (!all.length) return null
                return (
                  <tr className="os-stack-summary">
                    <td style={{ ...cell, borderBottom: 'none' }} />
                    {colOrder.map(id => <td key={id} style={{ ...cell, borderBottom: 'none', padding: '6px 10px 10px' }}>{summaryFor(id, all)}</td>)}
                    <td style={{ ...cell, borderBottom: 'none' }} />
                  </tr>
                )
              })()}
            </tbody>
          )
        })}

        {!groups && <tbody>
          {majors.map(m => (
            <FragmentRows
              key={m.id}
              major={m}
              subs={collapsed.has(m.id) ? [] : (subsOf.get(m.id) ?? [])}
              Row={Row}
              draftRow={draftRowFor(m)}
            />
          ))}
          {majors.length === 0 && (
            <tr><td style={{ ...cell, color: 'var(--os-text-faint)' }} colSpan={cols}><span className="os-span-stick">Nothing here. Add the first task.</span></td></tr>
          )}
        </tbody>}
      </table>
    </div>
  )
}

function SplitBar({ parts }: { parts: { label: string; color: string; n: number }[] }) {
  const total = parts.reduce((n, p) => n + p.n, 0)
  if (!total) return null
  const shown = parts.filter(p => p.n > 0)
  return (
    <span title={shown.map(p => `${p.label}: ${p.n}`).join(' · ')}
      style={{ display: 'flex', height: 20, borderRadius: 5, overflow: 'hidden', minWidth: 90 }}>
      {shown.map(p => <span key={p.label} style={{ flex: p.n, background: chipInk(p.color) }} />)}
    </span>
  )
}

function GroupBar({ pct, color }: { pct: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} title={`${pct}% done`}>
      <span style={{ width: 90, height: 6, borderRadius: 99, background: 'var(--os-line)', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--os-good)' : color, borderRadius: 99 }} />
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: pct === 100 ? 'var(--os-good)' : 'var(--os-text-faint)' }}>{pct}%</span>
    </span>
  )
}

function FragmentRows({ major, subs, Row, draftRow }: {
  major: Task; subs: Task[]
  Row: (p: { t: Task; sub: boolean }) => React.ReactElement

  draftRow?: React.ReactNode
}) {
  return (
    <>
      <Row t={major} sub={false} />
      {subs.map(s => <Row key={s.id} t={s} sub={true} />)}
      {draftRow}
    </>
  )
}

const NEXT_STATUS: Record<Status, Status> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

function StatusCircle({ task, onSetStatus, small }: { task: Task; onSetStatus: ViewProps['onSetStatus']; small?: boolean }) {
  const done = task.status === 'done'
  const going = task.status === 'in_progress'
  const size = small ? 20 : 24
  const meta = STATUS_META.find(s => s.key === task.status)
  return (
    <button
      onClick={e => { e.stopPropagation(); onSetStatus(task, NEXT_STATUS[task.status]) }}
      aria-label={`${meta?.label ?? task.status}. Mark as ${STATUS_META.find(s => s.key === NEXT_STATUS[task.status])?.label}`}
      style={{

        flexShrink: 0, width: 44, height: 44, margin: small ? '-11px 0 -11px -12px' : '-10px 0 -10px -12px',
        display: 'grid', placeItems: 'center',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        aria-hidden
        style={{
          width: size, height: size, borderRadius: '50%',
          border: `2px solid ${done ? 'var(--os-good)' : going ? 'var(--os-accent)' : 'var(--os-line-strong)'}`,
          background: done ? 'var(--os-good)' : 'transparent',
          display: 'grid', placeItems: 'center',
          color: '#fff', fontSize: small ? 11 : 13, fontWeight: 900, lineHeight: 1,

          boxShadow: going ? `inset 0 0 0 ${size / 4}px var(--os-accent)` : 'none',
          transition: 'background .14s ease, border-color .14s ease',
        }}
      >
        {done ? '✓' : ''}
      </span>
    </button>
  )
}

function MetaSelect({ text, value, onChange, title, colour, children }: {
  text: string; value: string; onChange: (v: string) => void; title: string
  colour?: string; children: React.ReactNode
}) {
  return (
    <span
      onClick={e => e.stopPropagation()}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3,
        color: colour ?? 'var(--os-text-faint)', fontSize: 12, fontWeight: 700,
        maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {text}
      <span aria-hidden style={{ fontSize: 7, opacity: 0.6 }}>▼</span>
      <select
        aria-label={title} title={title} value={value} onChange={e => onChange(e.target.value)}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          opacity: 0, border: 'none', background: 'transparent',

          fontSize: 16, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
        }}
      >
        {children}
      </select>
    </span>
  )
}

function MobileAdd({ placeholder, onAdd, indent = 0 }: { placeholder: string; onAdd: (title: string) => void; indent?: number }) {
  const [value, setValue] = useState('')
  const commit = () => { const t = value.trim(); if (!t) return; onAdd(t); setValue('') }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `0 14px 0 ${14 + indent}px`, borderTop: '1px solid var(--os-line)' }}>
      <span aria-hidden style={{ fontSize: 17, color: 'var(--os-text-faint)', flexShrink: 0, width: 24, textAlign: 'center' }}>+</span>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        onBlur={commit}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0, border: 'none', background: 'transparent',
          color: 'var(--os-text)', fontSize: 16, padding: '15px 0', outline: 'none',
        }}
      />
    </div>
  )
}

function groupPatch(groups: TaskGroup[], target: TaskGroup): Partial<Task> {
  const patch: Record<string, unknown> = {}
  for (const g of groups) for (const k of Object.keys(g.preset ?? {})) patch[k] = undefined
  return { ...patch, ...(target.preset ?? {}) } as Partial<Task>
}

type RowMeta = { id: string; sub: boolean; parentId?: string; groupId?: string }

type RowDrag = {

  onGripDown: (e: React.PointerEvent, meta: RowMeta) => void
  register: (meta: RowMeta, el: HTMLElement | null) => void

  dragging: boolean

  hint: 'before' | 'after' | null
}

function MobileRow({
  t, sub, subs, expanded, onToggleSubs,
  accounts, columns, showBusiness, groups, groupId, drag,
  onEditTask, onSetStatus, onPatchTask, onQuickAdd, onAddTask,
}: {
  t: Task; sub: boolean; subs: Task[]; expanded: boolean; onToggleSubs: (id: string) => void
  accounts: BusinessAccount[]; columns: TaskColumn[]
  showBusiness: boolean; groups?: TaskGroup[]; groupId?: string
  drag?: Omit<RowDrag, 'dragging' | 'hint'> & { dragId: string | null; over: { id: string; where: 'before' | 'after' } | null }
} & Pick<ViewProps, 'onEditTask' | 'onSetStatus' | 'onPatchTask' | 'onAddTask'> & { onQuickAdd?: ViewProps['onQuickAdd'] }) {
  const meta: RowMeta = { id: t.id, sub, parentId: sub ? t.parentId : undefined, groupId }
  const dragging = drag?.dragId === t.id
  const hint = drag?.over?.id === t.id ? drag.over.where : null
  const done = t.status === 'done'
  const doneSubs = subs.filter(s => s.status === 'done').length
  const due = dueInfo(t.dueDate)
  const biz = bizName(accounts, t.accountId)
  const here = groups?.find(g => g.match(t))
  const note = descriptionToText(t.description)
  const filled = columns.filter(c => String(t.fields?.[c.id] ?? '').trim() !== '')
  const link = filled.map(c => c.kind === 'url' ? safeUrl(String(t.fields?.[c.id] ?? '')) : null).find(Boolean) ?? null

  const line: React.ReactNode[] = []

  const overdue = !!due?.overdue && !done
  if (due) line.push(
    <span key="due" style={{ color: overdue ? 'var(--os-bad)' : 'var(--os-text-faint)', fontWeight: overdue ? 800 : 700 }}>
      {overdue ? `⚠ ${due.text}` : due.text}
    </span>,
  )
  {

    const left = !done ? daysLeftLabel(t.dueDate) : null
    if (left && left.text !== due?.text && !(due?.days === 1)) line.push(<span key="left" style={{ color: left.tone, fontWeight: 800 }}>{left.text}</span>)
  }
  if (!sub && subs.length > 0) line.push(
    <span key="subs" style={{ color: doneSubs === subs.length ? 'var(--os-good)' : 'var(--os-text-faint)', fontWeight: 700 }}>
      {doneSubs}/{subs.length}
    </span>,
  )

  if (biz && showBusiness) line.push(<span key="biz" style={{ color: 'var(--os-accent)', fontWeight: 700 }}>{biz}</span>)

  if (t.assignee && !sub) line.push(<AssigneeDot key="who" name={t.assignee} />)
  if (link) line.push(
    <a key="link" href={link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      style={{ color: 'var(--os-accent)', fontWeight: 700, textDecoration: 'none' }}>Link ↗</a>,
  )

  if (!sub && groups && onPatchTask) line.push(
    <MetaSelect
      key="move" title="Move to" value={here?.id ?? ''}
      text={here ? here.label : 'Unsorted'}
      onChange={v => { const g = groups.find(x => x.id === v); if (g) onPatchTask(t, groupPatch(groups, g)) }}
    >
      {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
    </MetaSelect>,
  )
  if (!sub && !groups && showBusiness && onPatchTask) line.push(
    <MetaSelect
      key="biz-edit" title="Business" value={t.accountId ?? ''} text={biz ?? 'Internal'}
      onChange={v => onPatchTask(t, { accountId: v || undefined })}
    >
      <option value="">Internal</option>
      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </MetaSelect>,
  )

  return (
    <>
      <div
        ref={el => drag?.register(meta, el)}
        onClick={() => { if (!drag?.dragId) onEditTask(t) }}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: `13px ${drag ? 4 : 12}px 13px ${sub ? 46 : 14}px`,
          borderTop: '1px solid var(--os-line)',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          background: 'transparent',

          opacity: dragging ? 0.35 : 1,
          boxShadow: hint === 'before' ? 'inset 0 3px 0 var(--os-accent)' : hint === 'after' ? 'inset 0 -3px 0 var(--os-accent)' : 'none',
          transition: 'opacity .12s ease',
        }}
      >
        <StatusCircle task={t} onSetStatus={onSetStatus} small={sub} />

        <div style={{ flex: 1, minWidth: 0, paddingTop: sub ? 1 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {t.priority !== 'medium' && (
              <span aria-label={PRIORITY_META[t.priority].label} title={PRIORITY_META[t.priority].label}
                style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_META[t.priority].color, flexShrink: 0 }} />
            )}
            <span style={{
              flex: 1, minWidth: 0,
              fontSize: sub ? 14.5 : 15.5, fontWeight: sub ? 600 : 650,
              lineHeight: 1.35, color: done ? 'var(--os-text-faint)' : 'var(--os-text)',
              overflowWrap: 'anywhere', textDecoration: done ? 'line-through' : 'none',
            }}>
              {t.title}
            </span>
          </div>

          {note && (
            <p style={{
              margin: '3px 0 0', fontSize: 13, lineHeight: 1.4, color: 'var(--os-text-faint)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {note}
            </p>
          )}

          {line.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6, fontSize: 12 }}>
              {line}
            </div>
          )}
        </div>

        {sub && t.assignee && <span style={{ flexShrink: 0, marginTop: 2 }}><AssigneeDot name={t.assignee} /></span>}

        {!sub && (subs.length > 0 || !!onQuickAdd) && (
          <button
            onClick={e => { e.stopPropagation(); onToggleSubs(t.id) }}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide subtasks' : `Show subtasks${subs.length ? ` (${subs.length})` : ''}`}
            style={{
              flexShrink: 0, width: 40, height: 40, margin: '-8px -6px -8px 0',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--os-text-faint)', fontSize: 11,
              display: 'grid', placeItems: 'center', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}

        {drag && (
          <span
            role="button"
            aria-label="Drag to reorder"
            onPointerDown={e => drag.onGripDown(e, meta)}
            onClick={e => e.stopPropagation()}
            style={{
              flexShrink: 0, width: 36, height: 44, margin: '-10px 0 -10px -2px',
              display: 'grid', placeItems: 'center',
              color: 'var(--os-text-faint)', fontSize: 15, letterSpacing: -1, lineHeight: 1,
              cursor: 'grab', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            ⋮⋮
          </span>
        )}
      </div>

      {!sub && expanded && (
        <>
          {subs.map(s => (
            <MobileRow
              key={s.id} t={s} sub subs={[]} expanded={false} onToggleSubs={onToggleSubs}
              accounts={accounts} columns={columns} showBusiness={showBusiness} groups={groups}
              groupId={groupId} drag={drag}
              onEditTask={onEditTask} onSetStatus={onSetStatus} onPatchTask={onPatchTask}
              onQuickAdd={onQuickAdd} onAddTask={onAddTask}
            />
          ))}
          {onQuickAdd
            ? <MobileAdd indent={32} placeholder="Add a subtask" onAdd={title => onQuickAdd(title, { parentId: t.id, accountId: t.accountId })} />
            : (
              <div style={{ borderTop: '1px solid var(--os-line)', padding: '10px 14px 10px 46px' }}>
                <button onClick={() => onAddTask({ parentId: t.id, accountId: t.accountId })} className="os-btn os-btn-ghost os-btn-sm">+ Subtask</button>
              </div>
            )}
        </>
      )}
    </>
  )
}

function MobileSurface({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--os-base-2, #fff)',
      border: '1px solid var(--os-line)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

function useRowDrag(opts: {
  siblingsOf: (meta: RowMeta) => Task[]
  groups?: TaskGroup[]
  onReorder?: BoardViewProps['onReorder']
}) {
  const rows = useRef(new Map<string, { meta: RowMeta; el: HTMLElement }>())
  const state = useRef<{ meta: RowMeta; over: { id: string; where: 'before' | 'after' } | null; y: number; raf: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; where: 'before' | 'after' } | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null)

  const register = (meta: RowMeta, el: HTMLElement | null) => {
    if (el) rows.current.set(meta.id, { meta, el })
    else rows.current.delete(meta.id)
  }

  const canLandOn = (from: RowMeta, to: RowMeta) =>
    from.id !== to.id && from.sub === to.sub && (!from.sub || from.parentId === to.parentId)

  function hitTest(from: RowMeta, y: number): { id: string; where: 'before' | 'after' } | null {
    let best: { id: string; where: 'before' | 'after'; dist: number } | null = null
    for (const { meta, el } of rows.current.values()) {
      if (!canLandOn(from, meta)) continue
      const r = el.getBoundingClientRect()
      const mid = r.top + r.height / 2
      const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
      if (best && dist > best.dist) continue
      best = { id: meta.id, where: y < mid ? 'before' : 'after', dist }
    }
    return best
  }

  function onGripDown(e: React.PointerEvent, meta: RowMeta) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (!opts.onReorder) return
    e.preventDefault()
    e.stopPropagation()
    const title = opts.siblingsOf(meta).find(t => t.id === meta.id)?.title ?? ''
    state.current = { meta, over: null, y: e.clientY, raf: 0 }
    setDragId(meta.id)
    setGhost({ x: e.clientX, y: e.clientY, title })
    document.body.style.userSelect = 'none'

    const settle = (st: NonNullable<typeof state.current>) => {
      const hit = hitTest(st.meta, st.y)
      if (hit?.id !== st.over?.id || hit?.where !== st.over?.where) { st.over = hit; setOver(hit) }
    }

    const EDGE = 96, STEP = 14
    const tick = () => {
      const st = state.current
      if (!st) return
      const h = window.innerHeight
      if (st.y < EDGE) { window.scrollBy(0, -STEP * (1 - st.y / EDGE) - 2); settle(st) }
      else if (st.y > h - EDGE) { window.scrollBy(0, STEP * (1 - (h - st.y) / EDGE) + 2); settle(st) }
      st.raf = requestAnimationFrame(tick)
    }
    state.current.raf = requestAnimationFrame(tick)

    const move = (ev: PointerEvent) => {
      const st = state.current
      if (!st) return
      st.y = ev.clientY
      settle(st)
      setGhost({ x: ev.clientX, y: ev.clientY, title })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.userSelect = ''
      const st = state.current
      state.current = null
      if (st) cancelAnimationFrame(st.raf)
      setDragId(null); setOver(null); setGhost(null)
      if (!st?.over || !opts.onReorder) return

      const target = rows.current.get(st.over.id)?.meta
      if (!target) return
      const list = opts.siblingsOf(target).map(t => t.id).filter(id => id !== st.meta.id)
      const at = list.indexOf(st.over.id)
      if (at < 0) return
      list.splice(st.over.where === 'before' ? at : at + 1, 0, st.meta.id)
      const movedGroups = !st.meta.sub && opts.groups && target.groupId && target.groupId !== st.meta.groupId
      const g = movedGroups ? opts.groups!.find(x => x.id === target.groupId) : undefined
      opts.onReorder(list, st.meta.id, g ? groupPatch(opts.groups!, g) : undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return { onGripDown, register, dragId, over, ghost }
}

function DragGhost({ ghost }: { ghost: { x: number; y: number; title: string } | null }) {
  if (!ghost) return null
  return (
    <div aria-hidden style={{
      position: 'fixed', left: 16, right: 16, top: ghost.y - 24, zIndex: 300, pointerEvents: 'none',
      padding: '12px 14px', borderRadius: 12,
      background: 'var(--os-base-2, #fff)', color: 'var(--os-text)',
      border: '1px solid var(--os-accent)', boxShadow: '0 14px 34px -12px rgba(0,0,0,.35)',
      fontSize: 15, fontWeight: 650, lineHeight: 1.3,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      transform: 'scale(1.02)',
    }}>
      {ghost.title}
    </div>
  )
}

function MobileBoard({
  tasks, accounts, onEditTask, onSetStatus, onAddTask, onPatchTask,
  onQuickAdd, onReorder, columns = [], groups, showBusiness = true,
}: BoardViewProps) {
  const { majors, subsOf } = groupTasks(tasks)
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set())
  const [shut, setShut] = useState<Set<string>>(new Set())

  const siblingsOf = (meta: RowMeta): Task[] => {
    if (meta.sub) return meta.parentId ? (subsOf.get(meta.parentId) ?? []) : []
    if (!groups) return majors
    const g = groups.find(x => x.id === meta.groupId)
    return g ? majors.filter(g.match) : majors
  }
  const rowDrag = useRowDrag({ siblingsOf, groups, onReorder })
  const drag = onReorder ? { onGripDown: rowDrag.onGripDown, register: rowDrag.register, dragId: rowDrag.dragId, over: rowDrag.over } : undefined

  const toggleSubs = (id: string) => setOpenSubs(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleGroup = (id: string) => setShut(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const row = (m: Task, groupId?: string) => (
    <MobileRow
      key={m.id} t={m} sub={false} subs={subsOf.get(m.id) ?? []}
      expanded={openSubs.has(m.id)} onToggleSubs={toggleSubs}
      accounts={accounts} columns={columns}
      showBusiness={showBusiness} groups={groups} groupId={groupId} drag={drag}
      onEditTask={onEditTask} onSetStatus={onSetStatus} onPatchTask={onPatchTask}
      onQuickAdd={onQuickAdd} onAddTask={onAddTask}
    />
  )

  if (!groups) {
    return (
      <MobileSurface>
        {majors.map(m => row(m))}
        {majors.length === 0 && (
          <p style={{ margin: 0, padding: '20px 14px', fontSize: 13.5, color: 'var(--os-text-faint)' }}>Nothing here yet.</p>
        )}
        {onQuickAdd && <MobileAdd placeholder="Add a task" onAdd={title => onQuickAdd(title, {})} />}
        <DragGhost ghost={rowDrag.ghost} />
      </MobileSurface>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <DragGhost ghost={rowDrag.ghost} />
      {groups.map(g => {
        const mine = majors.filter(g.match)
        const open = mine.filter(t => t.status !== 'done').length
        const closed = shut.has(g.id)
        return (
          <MobileSurface key={g.id}>
            <button
              onClick={() => toggleGroup(g.id)}
              aria-expanded={!closed}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                background: 'transparent', border: 'none', textAlign: 'left',
                padding: '12px 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span aria-hidden style={{ fontSize: 10, color: 'var(--os-text-faint)', width: 12, flexShrink: 0 }}>
                {closed ? '▶' : '▼'}
              </span>
              {g.progress !== undefined ? (

                <span style={{ display: 'grid', gap: 6, flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: g.color, flexShrink: 0, alignSelf: 'center' }} />
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--os-text)', lineHeight: 1.3 }}>{g.label}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingLeft: 17 }}>
                    <GroupBar pct={g.progress} color={g.color} />
                    <span style={{ fontSize: 11.5, color: 'var(--os-text-faint)' }}>
                      {open} open{g.sublabel ? ` · ${g.sublabel}` : ''}
                    </span>
                  </span>
                </span>
              ) : (<>
              <span style={{
                background: chipInk(g.color), color: '#fff',
                borderRadius: 999, padding: '6px 12px',
                fontSize: 11.5, fontWeight: 800, letterSpacing: '.04em',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '62%',
              }}>
                {g.label}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--os-text-faint)' }}>{open}</span>
              <span style={{ flex: 1 }} />
              {g.sublabel && (
                <span className="os-group-sublabel" style={{ fontSize: 11.5, color: 'var(--os-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                  {g.sublabel}
                </span>
              )}
              </>)}
            </button>

            {!closed && (
              <>
                {mine.map(m => row(m, g.id))}
                {onQuickAdd && (
                  <MobileAdd placeholder={`Add to ${g.label}`} onAdd={title => onQuickAdd(title, { ...(g.preset ?? {}) })} />
                )}
                {!onQuickAdd && mine.length === 0 && (
                  <p style={{ margin: 0, padding: '14px', borderTop: '1px solid var(--os-line)', fontSize: 13, color: 'var(--os-text-faint)' }}>Nothing here yet.</p>
                )}
              </>
            )}
          </MobileSurface>
        )
      })}
    </div>
  )
}

function ColumnAdd({ label, onAdd }: { label: string; onAdd: (title: string) => void }) {
  const [value, setValue] = useState('')
  const commit = () => { const t = value.trim(); if (!t) return; onAdd(t); setValue('') }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9,
      border: '1px dashed var(--os-line-strong)', borderRadius: 12, padding: '0 11px',
    }}>
      <span aria-hidden style={{ color: 'var(--os-text-faint)', fontSize: 16, flexShrink: 0 }}>+</span>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        onBlur={commit}
        placeholder={`Add to ${label}`}
        aria-label={`Add a task to ${label}`}
        style={{
          flex: 1, minWidth: 0, border: 'none', background: 'transparent',
          color: 'var(--os-text)', fontSize: 16, padding: '12px 0', outline: 'none',
        }}
      />
    </div>
  )
}

function KanbanCard({ t, subs, biz, onEditTask, onDeleteTask, onSetStatus, dragging, onGripDown }: {
  t: Task
  subs: Task[]
  biz: string | undefined
  onEditTask: (t: Task) => void
  onDeleteTask?: (t: Task) => void
  onSetStatus: ViewProps['onSetStatus']
  dragging: boolean
  onGripDown: (e: React.PointerEvent, t: Task) => void
}) {
  const doneSubs = subs.filter(s => s.status === 'done').length
  const due = dueInfo(t.dueDate)
  return (
    <div
      onClick={() => onEditTask(t)}
      style={{

        background: 'var(--os-base-2, var(--os-card))', border: '1px solid var(--os-line)',
        borderLeft: `3px solid ${PRIORITY_META[t.priority].color}`, borderRadius: 14,
        padding: '14px 4px 14px 10px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        opacity: dragging ? 0.35 : 1, display: 'flex', gap: 2, alignItems: 'flex-start',
      }}
    >
      <StatusCircle task={t} onSetStatus={onSetStatus} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--os-text)', lineHeight: 1.4, marginBottom: 5, overflowWrap: 'anywhere' }}>{t.title}</div>
        {biz && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-accent)', marginBottom: 4 }}>🏢 {biz}</div>}
        {subs.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ height: 4, borderRadius: 4, background: 'var(--os-line)', overflow: 'hidden', marginBottom: 3 }}>
              <div style={{ height: '100%', width: `${Math.round((doneSubs / subs.length) * 100)}%`, background: doneSubs === subs.length ? 'var(--os-good)' : 'var(--os-accent)', borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--os-text-faint)' }}>{doneSubs}/{subs.length} subtasks</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AssigneeDot name={t.assignee} />
          {due && <span style={{ fontSize: 11, fontWeight: 700, color: due.overdue ? 'var(--os-bad)' : 'var(--os-text-faint)' }}>{due.overdue ? `⚠ ${due.text}` : due.text}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        {onDeleteTask && (
          <button
            onClick={e => { e.stopPropagation(); onDeleteTask(t) }}
            title="Delete task"
            style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 13 }}
          >
            <i className="ti ti-trash" />
          </button>
        )}
        <span
          onPointerDown={e => onGripDown(e, t)}
          onClick={e => e.stopPropagation()}
          title="Drag to change stage"
          style={{
            width: 30, height: 30, display: 'grid', placeItems: 'center',
            color: 'var(--os-text-faint)', fontSize: 15, cursor: 'grab', touchAction: 'none',
          }}
        >
          <i className="ti ti-grip-vertical" />
        </span>
      </div>
    </div>
  )
}

export function KanbanView({ tasks, accounts, onEditTask, onSetStatus, onAddTask, onDeleteTask, onQuickAdd }: ViewProps) {
  const { majors, subsOf } = groupTasks(tasks)
  const columnRefs = useRef<Partial<Record<Status, HTMLDivElement>>>({})
  const dragState = useRef<{ id: string; fromStatus: Status; moved: boolean; overStatus: Status | null } | null>(null)
  const suppressNextClick = useRef(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStatus, setOverStatus] = useState<Status | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null)

  function gripDown(e: React.PointerEvent, t: Task) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    const startX = e.clientX, startY = e.clientY
    dragState.current = { id: t.id, fromStatus: t.status, moved: false, overStatus: null }

    function hitTest(x: number, y: number): Status | null {
      for (const key of Object.keys(columnRefs.current) as Status[]) {
        const el = columnRefs.current[key]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key
      }
      return null
    }

    function move(ev: PointerEvent) {
      const state = dragState.current
      if (!state) return
      if (!state.moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        state.moved = true
        setDragId(state.id)
      }
      if (!state.moved) return
      const hit = hitTest(ev.clientX, ev.clientY)
      state.overStatus = hit
      setOverStatus(hit)
      setGhost({ x: ev.clientX, y: ev.clientY, title: t.title })
    }

    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const state = dragState.current
      dragState.current = null
      setDragId(null)
      setOverStatus(null)
      setGhost(null)
      if (!state?.moved) return
      suppressNextClick.current = true
      if (state.overStatus && state.overStatus !== state.fromStatus) {
        onSetStatus(t, state.overStatus)
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const editIfNotDragging = (t: Task) => {
    if (suppressNextClick.current) { suppressNextClick.current = false; return }
    onEditTask(t)
  }

  return (
    <div className="os-collapse os-kanban" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, alignItems: 'start', position: 'relative' }}>
      {STATUS_META.map(col => {
        const colTasks = majors.filter(t => t.status === col.key)
        const isDropTarget = overStatus === col.key
        return (
          <div
            key={col.key}
            className="os-kanban-col"
            ref={el => { columnRefs.current[col.key] = el ?? undefined }}
            style={{
              borderRadius: 12, padding: 6, transition: 'background .1s, box-shadow .1s',
              background: isDropTarget ? 'var(--os-accent-soft, rgba(124,58,237,.08))' : 'transparent',
              boxShadow: isDropTarget ? 'inset 0 0 0 2px var(--os-accent)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--os-text)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{col.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--os-line)', color: 'var(--os-text-faint)', borderRadius: 100, padding: '1px 7px' }}>{colTasks.length}</span>
              <span style={{ flex: 1 }} />
              {!onQuickAdd && (
                <button onClick={() => onAddTask({ status: col.key })} title={`Add to ${col.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 17, lineHeight: 1 }}>+</button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {colTasks.map(t => (
                <KanbanCard
                  key={t.id} t={t} subs={subsOf.get(t.id) ?? []} biz={bizName(accounts, t.accountId)}
                  onEditTask={editIfNotDragging} onDeleteTask={onDeleteTask} onSetStatus={onSetStatus} dragging={dragId === t.id} onGripDown={gripDown}
                />
              ))}
              {onQuickAdd
                ? <ColumnAdd label={col.label} onAdd={title => onQuickAdd(title, { status: col.key })} />
                : colTasks.length === 0 && (
                  <div onClick={() => onAddTask({ status: col.key })} style={{ border: '2px dashed var(--os-line)', borderRadius: 10, padding: '16px 12px', textAlign: 'center', color: 'var(--os-text-faint)', fontSize: 12, cursor: 'pointer' }}>
                    + Add a task
                  </div>
                )}
            </div>
          </div>
        )
      })}
      {ghost && (
        <div style={{
          position: 'fixed', left: ghost.x + 12, top: ghost.y + 12, zIndex: 400, pointerEvents: 'none',
          background: 'var(--os-base-2)', border: '1px solid var(--os-accent)', borderRadius: 8,
          padding: '7px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--os-text)',
          boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ghost.title}
        </div>
      )}
    </div>
  )
}

type CalendarProps = Omit<ViewProps, 'onSetStatus'> & { external?: ExternalEvent[]; note?: React.ReactNode }

export function CalendarView({ note, ...props }: CalendarProps) {
  const narrow = useIsNarrow()
  return (
    <>
      {note}
      {narrow ? <AgendaView {...props} /> : <MonthGrid {...props} />}
    </>
  )
}

function calDay(t: Task): string {
  return (t.fields?.__start || t.dueDate || '').slice(0, 10)
}

function calTime(t: Task): string {
  return t.fields?.__start ? t.fields.__start.slice(11, 16) : ''
}

function byCalTime(a: Task, b: Task): number {
  const ta = calTime(a), tb = calTime(b)
  if (ta && tb) return ta.localeCompare(tb)
  if (ta || tb) return ta ? -1 : 1
  return byDueThenPriority(a, b)
}
function eventsByDay(external: ExternalEvent[] | undefined): Map<string, ExternalEvent[]> {
  const m = new Map<string, ExternalEvent[]>()
  for (const e of external ?? []) m.set(e.day, [...(m.get(e.day) ?? []), e])
  for (const list of m.values()) list.sort((a, b) => a.time.localeCompare(b.time))
  return m
}

function ExternalChip({ e, compact }: { e: ExternalEvent; compact?: boolean }) {
  const label = `${e.time ? e.time + ' ' : ''}${e.title}`
  const style: React.CSSProperties = compact
    ? { display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--os-text-muted, var(--os-text-faint))', border: '1px dashed var(--os-line-strong, var(--os-line))', borderRadius: 5, padding: '2px 5px', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }
    : { display: 'flex', alignItems: 'center', gap: 10, width: '100%', fontSize: 14, fontWeight: 600, color: 'var(--os-text-muted, var(--os-text-faint))', border: '1px dashed var(--os-line-strong, var(--os-line))', borderRadius: 12, padding: '11px 12px', textDecoration: 'none', overflowWrap: 'anywhere' }
  const body = compact ? label : <><span aria-hidden>📅</span><span style={{ flex: 1, minWidth: 0 }}>{label}</span></>
  return e.link
    ? <a href={e.link} target="_blank" rel="noopener noreferrer" title={`${label} · in Google Calendar`} onClick={ev => ev.stopPropagation()} style={style}>{body}</a>
    : <span title={label} style={style}>{body}</span>
}

function AgendaRow({ t, accounts, onEditTask }: { t: Task; accounts: BusinessAccount[]; onEditTask: ViewProps['onEditTask'] }) {
  const biz = bizName(accounts, t.accountId)
  const done = t.status === 'done'
  return (
    <button
      onClick={() => onEditTask(t)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: 'var(--os-base-2, #fff)', border: '1px solid var(--os-line)',
        borderLeft: `4px solid ${PRIORITY_META[t.priority].color}`, borderRadius: 12,
        padding: '13px 12px', cursor: 'pointer', opacity: done ? 0.6 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--os-text)',
        lineHeight: 1.35, overflowWrap: 'anywhere', textDecoration: done ? 'line-through' : 'none',
      }}>
        {calTime(t) && <span style={{ fontWeight: 800, color: 'var(--os-accent)', marginRight: 6 }}>{calTime(t)}</span>}
        {t.title}
        {biz && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--os-accent)', marginTop: 3 }}>{biz}</span>}
      </span>
      <AssigneeDot name={t.assignee} />
    </button>
  )
}

function AgendaView({ tasks, accounts, onEditTask, onAddTask, external }: Omit<CalendarProps, 'note'>) {
  const now = new Date()
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const open = tasks.filter(t => t.status !== 'done')

  const overdue = open.filter(t => calDay(t) && calDay(t) < today).sort(byDueThenPriority)
  const undated = open.filter(t => !calDay(t))

  const ahead = new Map<string, Task[]>()
  for (const t of tasks) {
    const key = calDay(t)
    if (!key || key < today) continue
    ahead.set(key, [...(ahead.get(key) ?? []), t])
  }
  const evDays = eventsByDay(external)
  const days = [...new Set([...ahead.keys(), ...[...evDays.keys()].filter(d => d >= today)])].sort()

  const heading = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    const info = dueInfo(iso)
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    return info && (info.days === 0 || info.days === 1) ? `${info.text} · ${weekday}` : weekday
  }

  const shared = { accounts, onEditTask, onAddTask }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {overdue.length > 0 && <AgendaSection {...shared} label="Overdue" colour="var(--os-bad)" items={overdue} />}
      {days.map(iso => (
        <AgendaSection key={iso} {...shared} label={heading(iso)} colour={iso === today ? 'var(--os-accent)' : 'var(--os-line-strong)'} iso={iso} items={(ahead.get(iso) ?? []).sort(byCalTime)} events={evDays.get(iso)} />
      ))}
      {overdue.length === 0 && days.length === 0 && (
        <p style={{ fontSize: 13.5, color: 'var(--os-text-faint)', padding: '18px 2px' }}>Nothing is dated. Set a due date and it lands here.</p>
      )}
      {undated.length > 0 && (
        <AgendaSection {...shared} label="No date yet" colour="var(--os-text-faint)" items={undated.sort(byDueThenPriority)} />
      )}
    </div>
  )
}

function AgendaSection({ label, colour, iso, items, events, accounts, onEditTask, onAddTask }: {
  label: string; colour: string; iso?: string; items: Task[]; events?: ExternalEvent[]
  accounts: BusinessAccount[]
} & Pick<ViewProps, 'onEditTask' | 'onAddTask'>) {
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: colour, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontSize: 13.5, fontWeight: 800, color: 'var(--os-text)' }}>{label}</span>
        <span style={{ fontSize: 11.5, color: 'var(--os-text-faint)' }}>{items.length}</span>
        <span style={{ flex: 1 }} />
        {iso && (
          <button onClick={() => onAddTask({ dueDate: iso })} aria-label={`Add a task due ${label}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', fontSize: 19, lineHeight: 1, padding: '4px 6px' }}>＋</button>
        )}
      </div>
      {items.map(t => <AgendaRow key={t.id} t={t} accounts={accounts} onEditTask={onEditTask} />)}
      {(events ?? []).map(e => <ExternalChip key={e.id} e={e} />)}
    </section>
  )
}

function MonthGrid({ tasks, accounts, onEditTask, onAddTask, external }: Omit<CalendarProps, 'note'>) {
  const [offset, setOffset] = useState(0)
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const startPad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

  const byDay = new Map<string, Task[]>()
  for (const t of tasks) {
    const key = calDay(t)
    if (!key) continue
    byDay.set(key, [...(byDay.get(key) ?? []), t])
  }
  for (const list of byDay.values()) list.sort(byCalTime)
  const evDays = eventsByDay(external)
  const undated = tasks.filter(t => !calDay(t) && t.status !== 'done')

  const cells: (string | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button onClick={() => setOffset(o => o - 1)} className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '5px 11px' }}>←</button>
        <span style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--os-text)', minWidth: 160 }}>{label}</span>
        <button onClick={() => setOffset(o => o + 1)} className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '5px 11px' }}>→</button>
        {offset !== 0 && <button onClick={() => setOffset(0)} className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '5px 11px', fontSize: 12 }}>Today</button>}
      </div>

      <div className="os-card" style={{ padding: 10, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, minWidth: 700 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '4px 6px' }}>{d}</div>
          ))}
          {cells.map((iso, i) => (
            <div
              key={i}
              onClick={iso ? () => onAddTask({ dueDate: iso }) : undefined}
              style={{
                minHeight: 84, borderRadius: 8, padding: '5px 6px',
                background: iso === todayIso ? 'var(--os-accent-soft, rgba(124,58,237,.08))' : iso ? 'var(--os-card-alt, rgba(0,0,0,.015))' : 'transparent',
                border: iso === todayIso ? '1.5px solid var(--os-accent)' : '1px solid var(--os-line)',
                cursor: iso ? 'pointer' : 'default', opacity: iso ? 1 : 0.35,
              }}
            >
              {iso && <div style={{ fontSize: 11, fontWeight: 800, color: iso === todayIso ? 'var(--os-accent)' : 'var(--os-text-faint)', marginBottom: 3 }}>{Number(iso.slice(8))}</div>}
              {iso && (byDay.get(iso) ?? []).slice(0, 3).map(t => (
                <div
                  key={t.id}
                  onClick={e => { e.stopPropagation(); onEditTask(t) }}
                  title={`${t.title}${bizName(accounts, t.accountId) ? ` · ${bizName(accounts, t.accountId)}` : ''}`}
                  style={{
                    fontSize: 10.5, fontWeight: 700, color: t.status === 'done' ? 'var(--os-text-faint)' : 'var(--os-text)',
                    textDecoration: t.status === 'done' ? 'line-through' : 'none',
                    background: 'var(--os-card)', border: `1px solid var(--os-line)`,
                    borderLeft: `3px solid ${PRIORITY_META[t.priority].color}`,
                    borderRadius: 5, padding: '2px 5px', marginBottom: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {calTime(t) && <span style={{ color: 'var(--os-accent)', marginRight: 4 }}>{calTime(t)}</span>}
                  {t.title}
                </div>
              ))}
              {iso && (evDays.get(iso) ?? []).slice(0, Math.max(0, 3 - (byDay.get(iso) ?? []).length)).map(e => (
                <ExternalChip key={e.id} e={e} compact />
              ))}
              {iso && (byDay.get(iso) ?? []).length + (evDays.get(iso) ?? []).length > 3 && (
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--os-text-faint)' }}>+{(byDay.get(iso) ?? []).length + (evDays.get(iso) ?? []).length - 3} more</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {undated.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--os-text-faint)' }}>
          {undated.length} open task{undated.length === 1 ? ' has' : 's have'} no date yet. Set a due date or block time and they land on the calendar.
        </div>
      )}
    </div>
  )
}

export function MatrixView({ tasks, accounts, onEditTask }: Pick<ViewProps, 'tasks' | 'accounts' | 'onEditTask'>) {
  const open = tasks.filter(t => t.status !== 'done')
  const isUrgent = (t: Task) => { const d = dueInfo(t.dueDate); return !!d && d.days <= 3 }
  const isImportant = (t: Task) => t.priority === 'urgent' || t.priority === 'high'

  const quads: { key: string; title: string; hint: string; color: string; items: Task[] }[] = [
    { key: 'do',       title: 'Do first',  hint: 'Urgent and important',      color: 'var(--os-bad)',        items: open.filter(t => isUrgent(t) && isImportant(t)) },
    { key: 'schedule', title: 'Schedule',  hint: 'Important, not urgent yet', color: 'var(--os-accent)',     items: open.filter(t => !isUrgent(t) && isImportant(t)) },
    { key: 'delegate', title: 'Delegate',  hint: 'Urgent, lower importance',  color: '#ca8a04',              items: open.filter(t => isUrgent(t) && !isImportant(t)) },
    { key: 'later',    title: 'Later',     hint: 'Neither, for a quiet day',  color: 'var(--os-text-faint)', items: open.filter(t => !isUrgent(t) && !isImportant(t)) },
  ]

  return (
    <div className="os-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {quads.map(q => (
        <div key={q.key} className="os-card" style={{ padding: '16px 18px', borderTop: `3px solid ${q.color}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 14, color: 'var(--os-text)' }}>{q.title}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: q.color }}>{q.items.length}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)', marginBottom: 8 }}>{q.hint}</div>
          {q.items.sort(byDueThenPriority).slice(0, 8).map(t => {
            const due = dueInfo(t.dueDate)
            const biz = bizName(accounts, t.accountId)
            return (
              <div key={t.id} onClick={() => onEditTask(t)} className="os-action-row" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', margin: '0 -8px', borderRadius: 9, cursor: 'pointer', borderTop: '1px solid var(--os-line)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_META[t.priority].color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--os-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}{biz && <span style={{ color: 'var(--os-text-faint)', fontWeight: 500 }}> · {biz}</span>}
                </span>
                {due && <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, color: due.overdue ? 'var(--os-bad)' : 'var(--os-text-faint)' }}>{due.text}</span>}
              </div>
            )
          })}
          {q.items.length === 0 && <div style={{ fontSize: 12, color: 'var(--os-text-faint)', padding: '6px 0' }}>Empty. Good.</div>}
          {q.items.length > 8 && <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)', paddingTop: 6 }}>and {q.items.length - 8} more.</div>}
        </div>
      ))}
    </div>
  )
}

export type ViewKey = 'objectives' | 'areas' | 'list' | 'kanban' | 'calendar' | 'matrix' | 'overview' | 'plan' | 'dashboard'

export function ViewToggle({ views, view, setView }: { views: { key: ViewKey; label: string }[]; view: ViewKey; setView: (v: ViewKey) => void }) {
  return (
    <div className="os-view-toggle" style={{ display: 'inline-flex', background: 'var(--os-line)', borderRadius: 10, padding: 3, gap: 2 }}>
      {views.map(v => (
        <button
          key={v.key}
          onClick={() => setView(v.key)}
          style={{
            padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 700,
            background: view === v.key ? 'var(--os-card)' : 'transparent',
            color: view === v.key ? 'var(--os-text)' : 'var(--os-text-faint)',
            boxShadow: view === v.key ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
          }}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

export type Filters = { status: string; priority: string; assignee: string; accountId: string; owner: string; area: string; tag: string }
export const EMPTY_FILTERS: Filters = { status: 'all', priority: 'all', assignee: 'all', accountId: 'all', owner: 'all', area: 'all', tag: 'all' }

export function applyFilters(tasks: Task[], f: Filters, columns: TaskColumn[] = []): Task[] {
  const textCols = columns.filter(c => c.kind === 'text')
  return tasks.filter(t =>
    (f.area === 'all' || (f.area === '__inbox' ? !t.area : t.area === f.area)) &&
    (f.tag === 'all' || textCols.some(c =>
      `${c.id}:${String(t.fields?.[c.id] ?? '').trim()}` === f.tag)) &&
    (f.status === 'all' || t.status === f.status) &&
    (f.priority === 'all' || t.priority === f.priority) &&
    (f.assignee === 'all' || assigneesOf(t).includes(f.assignee)) &&

    (f.owner === 'all' || (f.owner === 'me' ? (t.owner ?? 'me') !== 'team' && t.owner !== 'client' : t.owner === f.owner)) &&
    (f.accountId === 'all' || (f.accountId === 'internal' ? !t.accountId : t.accountId === f.accountId)),
  )
}

export function FilterBar({ tasks, accounts, filters, setFilters, showBusiness, columns = [] }: {
  tasks: Task[]
  accounts: BusinessAccount[]
  filters: Filters
  setFilters: (f: Filters) => void
  showBusiness: boolean

  columns?: TaskColumn[]
}) {
  const narrow = useIsNarrow()
  const [open, setOpen] = useState(false)
  const assignees = Array.from(new Set(tasks.flatMap(t => assigneesOf(t))))
  const sel: React.CSSProperties = narrow
    ? { padding: '11px 12px', border: '1.5px solid var(--os-line)', borderRadius: 10, fontSize: 16, fontWeight: 600, color: 'var(--os-text)', background: 'var(--os-base-2, #fff)', outline: 'none', cursor: 'pointer', width: '100%', minWidth: 0 }
    : { padding: '7px 10px', border: '1.5px solid var(--os-line)', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--os-text)', background: 'var(--os-card)', outline: 'none', cursor: 'pointer' }
  const on = [filters.status, filters.priority, filters.assignee, filters.accountId, filters.owner, filters.area, filters.tag].filter(v => v !== 'all')

  const labels = (() => {
    if (filters.area === 'all') return [] as [string, string][]
    const seen = new Map<string, string>()
    for (const t of tasks) {
      const a = t.area ?? '__inbox'
      if (a !== filters.area) continue
      for (const c of columns) {
        if (c.kind !== 'text') continue
        const v = String(t.fields?.[c.id] ?? '').trim()
        if (v) seen.set(`${c.id}:${v}`, v)
      }
    }
    return [...seen.entries()]
  })()
  const active = on.length > 0

  if (narrow && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="os-btn os-btn-ghost os-btn-sm"
        style={{ fontWeight: 700, color: active ? 'var(--os-accent)' : undefined }}
      >
        Filters{active ? ` · ${on.length}` : ''}
      </button>
    )
  }

  return (
    <div
      className="os-filter-bar"
      style={narrow
        ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }
        : { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <select value={filters.area} onChange={e => setFilters({ ...filters, area: e.target.value, tag: 'all' })} style={sel}>
        <option value="all">All areas</option>
        {AREAS.map(a => <option key={a.id} value={a.id}>{a.heading}</option>)}
        <option value="__inbox">Inbox</option>
      </select>
      {labels.length > 0 && (
        <select value={filters.tag} onChange={e => setFilters({ ...filters, tag: e.target.value })} style={sel}>
          <option value="all">Any label</option>
          {labels.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      )}
      <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} style={sel}>
        <option value="all">All statuses</option>
        {STATUS_META.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <select value={filters.owner} onChange={e => setFilters({ ...filters, owner: e.target.value })} style={sel}>
        <option value="all">Anyone</option>
        <option value="me">Me</option>
        <option value="team">My team</option>
        <option value="client">The client</option>
      </select>
      <select value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })} style={sel}>
        <option value="all">All priorities</option>
        {(Object.keys(PRIORITY_META) as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
      </select>
      {assignees.length > 0 && (
        <select value={filters.assignee} onChange={e => setFilters({ ...filters, assignee: e.target.value })} style={sel}>
          <option value="all">Everyone</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {showBusiness && (
        <select value={filters.accountId} onChange={e => setFilters({ ...filters, accountId: e.target.value })} style={sel}>
          <option value="all">All businesses</option>
          <option value="internal">Internal</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      {active && (
        <button onClick={() => setFilters(EMPTY_FILTERS)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: narrow ? 14 : 12, fontWeight: 700, color: 'var(--os-accent)', minHeight: narrow ? 44 : undefined }}>
          Clear
        </button>
      )}
      {narrow && (
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--os-text-faint)', minHeight: 44 }}>
          Done
        </button>
      )}
    </div>
  )
}
