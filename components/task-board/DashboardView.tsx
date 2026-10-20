'use client'
import { assigneesOf, type Task } from '@/app/os/tasks/task-shared'
import { AREAS } from '@/lib/business-areas'
import { dueInfo, groupTasks, PRIORITY_META, type TaskGroup, type ViewProps } from './TaskViews'

type Props = Pick<ViewProps, 'tasks' | 'accounts' | 'onEditTask'> & {

  groups?: TaskGroup[]
  breakdownLabel?: string
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const x = new Date(y, m - 1, d + n, 12)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { weekday: 'short' })
}
const startOfWeekISO = () => {
  const d = new Date()
  const back = (d.getDay() + 6) % 7 // Monday-first
  return addDays(todayISO(), -back)
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

function Bars({ rows, hue }: { rows: { label: string; value: number; color?: string }[]; hue?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  if (rows.length === 0) return <Empty>Nothing to count yet.</Empty>
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 34%) 1fr 28px', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--os-text)' }}>
            {r.color && <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          </span>
          <span style={{ height: 10, background: 'var(--os-line)', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0, background: r.color ?? hue ?? 'var(--os-accent)', borderRadius: 4 }} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--os-text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function StatusBar({ todo, doing, done }: { todo: number; doing: number; done: number }) {
  const total = todo + doing + done
  const seg = [
    { key: 'todo', label: 'To do', n: todo, color: 'var(--os-line-strong)' },
    { key: 'doing', label: 'In progress', n: doing, color: 'var(--os-accent)' },
    { key: 'done', label: 'Done', n: done, color: 'var(--os-good)' },
  ]
  if (total === 0) return <Empty>Nothing to count yet.</Empty>
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 14, borderRadius: 5, overflow: 'hidden', background: 'var(--os-line)' }}>
        {seg.filter(s => s.n > 0).map(s => (
          <span key={s.key} title={`${s.label}: ${s.n}`} style={{ flex: `${s.n} 0 0`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 12 }}>
        {seg.map(s => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--os-text-muted)' }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
            {s.label}
            <b style={{ color: 'var(--os-text)', fontVariantNumeric: 'tabular-nums' }}>{s.n}</b>
            <span style={{ color: 'var(--os-text-faint)' }}>{Math.round((s.n / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function WeekColumns({ open }: { open: Task[] }) {
  const today = todayISO()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const counts = days.map(iso => open.filter(t => (t.dueDate || '').slice(0, 10) === iso).length)
  const max = Math.max(1, ...counts)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end', height: 128 }}>
      {days.map((iso, i) => (
        <div key={iso} title={`${weekday(iso)} ${iso.slice(5)}: ${counts[i]} due`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: counts[i] ? 'var(--os-text)' : 'transparent', fontVariantNumeric: 'tabular-nums' }}>{counts[i]}</span>
          <span style={{ width: '100%', maxWidth: 34, height: `${(counts[i] / max) * 78}px`, minHeight: counts[i] ? 4 : 2, background: counts[i] ? (i === 0 ? 'var(--os-accent)' : 'color-mix(in srgb, var(--os-accent) 55%, var(--os-line))') : 'var(--os-line)', borderRadius: '4px 4px 2px 2px' }} />
          <span style={{ fontSize: 11, fontWeight: i === 0 ? 800 : 600, color: i === 0 ? 'var(--os-text)' : 'var(--os-text-faint)' }}>{i === 0 ? 'Today' : weekday(iso)}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, padding: '14px 0', fontSize: 13, color: 'var(--os-text-faint)' }}>{children}</p>
}

function TaskList({ items, accounts, onEditTask, tone, emptyText }: {
  items: Task[]; accounts: ViewProps['accounts']; onEditTask: ViewProps['onEditTask']; tone: 'bad' | 'plain'; emptyText: string
}) {
  const LIMIT = 8
  if (items.length === 0) return <Empty>{emptyText}</Empty>
  return (
    <div style={{ display: 'grid' }}>
      {items.slice(0, LIMIT).map(t => {
        const due = dueInfo(t.dueDate)
        const biz = t.accountId ? accounts.find(a => a.id === t.accountId)?.name : undefined
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onEditTask(t)}
            style={{
              display: 'grid', gridTemplateColumns: '8px 1fr auto', alignItems: 'center', gap: 10,
              width: '100%', textAlign: 'left', padding: '9px 2px', minHeight: 40,
              background: 'none', border: 'none', borderTop: '1px solid var(--os-line)', cursor: 'pointer',
              color: 'var(--os-text)', font: 'inherit',
            }}
          >
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_META[t.priority].color }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              {biz && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--os-text-faint)' }}>{biz}</span>}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', color: tone === 'bad' ? 'var(--os-bad)' : 'var(--os-text-muted)' }}>
              {due ? (tone === 'bad' ? `${Math.abs(due.days)}d over` : due.text) : ''}
              {assigneesOf(t).map((n, i) => (
                <span key={n} title={n} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--os-accent)', color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800, marginLeft: i ? -6 : 0, boxShadow: i ? '0 0 0 2px var(--os-base-2, #fff)' : 'none' }}>
                  {initialsOf(n)}
                </span>
              ))}
            </span>
          </button>
        )
      })}
      {items.length > LIMIT && (
        <p style={{ margin: 0, padding: '8px 2px 0', fontSize: 12, color: 'var(--os-text-faint)', borderTop: '1px solid var(--os-line)' }}>+ {items.length - LIMIT} more</p>
      )}
    </div>
  )
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="os-card" style={{ padding: '18px 20px', minWidth: 0 }}>
      <header style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--os-text)' }}>{title}</h3>
        {sub && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--os-text-faint)' }}>{sub}</p>}
      </header>
      {children}
    </section>
  )
}

export function DashboardView({ tasks, accounts, onEditTask, groups, breakdownLabel = 'By area' }: Props) {
  const { majors, subsOf } = groupTasks(tasks)
  const all = [...majors, ...[...subsOf.values()].flat()]
  const today = todayISO()
  const weekStart = startOfWeekISO()

  const open = all.filter(t => t.status !== 'done')
  const doing = all.filter(t => t.status === 'in_progress')
  const done = all.filter(t => t.status === 'done')
  const overdue = open.filter(t => t.dueDate && t.dueDate.slice(0, 10) < today)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
  const upNext = open.filter(t => { const d = (t.dueDate || '').slice(0, 10); return d >= today && d <= addDays(today, 6) })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
  const doneThisWeek = done.filter(t => t.dueDate && t.dueDate.slice(0, 10) >= weekStart)

  const groupRows = (groups ?? AREAS.map(a => ({ id: a.id, label: a.heading, color: a.color, match: (t: Task) => t.area === a.id } as TaskGroup)))
    .map(g => ({ label: g.label, color: g.color, value: majors.filter(t => t.status !== 'done' && g.match(t)).length }))
  const unsorted = majors.filter(t => t.status !== 'done' && !(groups ?? []).some(g => g.match(t)) && (groups ? true : !t.area)).length
  const breakdown = unsorted > 0 ? [...groupRows, { label: groups ? 'Not in a group' : 'Unsorted', color: 'var(--os-text-faint)', value: unsorted }] : groupRows

  const byOwner = Object.entries(
    open.reduce<Record<string, number>>((acc, t) => {
      const names = assigneesOf(t)
      for (const k of names.length ? names : ['Unassigned']) acc[k] = (acc[k] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))

  const tiles = [
    { label: 'Open', value: open.length, sub: `${majors.filter(t => t.status !== 'done').length} tasks · ${open.length - majors.filter(t => t.status !== 'done').length} subtasks` },
    { label: 'In progress', value: doing.length, sub: doing.length === 1 ? 'being worked on' : 'being worked on' },
    { label: 'Overdue', value: overdue.length, sub: overdue.length ? 'need a new date or a push' : 'nothing slipping', tone: overdue.length ? 'var(--os-bad)' : undefined },
    { label: 'Done this week', value: doneThisWeek.length, sub: `${done.length} done in total`, tone: doneThisWeek.length ? 'var(--os-good)' : undefined },
  ]

  return (
    <div className="os-task-dash" style={{ display: 'grid', gap: 14 }}>
      <div className="os-stats os-collapse-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 0 }}>
        {tiles.map(s => (
          <div key={s.label} className="os-stat-card" style={{ padding: '16px 18px' }}>
            <span className="os-stat-label">{s.label}</span>
            <div className="os-stat-value" style={{ marginTop: 8, color: s.tone }}>{s.value}</div>
            <div className="os-stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="os-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="By status" sub={`${all.length} in total`}>
          <StatusBar todo={open.length - doing.length} doing={doing.length} done={done.length} />
        </Card>
        <Card title={breakdownLabel} sub="open tasks">
          <Bars rows={breakdown} />
        </Card>
        <Card title="By owner" sub="open tasks and subtasks">
          <Bars rows={byOwner} />
        </Card>
        <Card title="Due in the next 7 days" sub={`${upNext.length} due · ${open.filter(t => !t.dueDate).length} with no date`}>
          <WeekColumns open={open} />
        </Card>
        <Card title="Overdue" sub={overdue.length ? `${overdue.length} past their date` : undefined}>
          <TaskList items={overdue} accounts={accounts} onEditTask={onEditTask} tone="bad" emptyText="Nothing is overdue." />
        </Card>
        <Card title="Up next" sub="due today through Sunday">
          <TaskList items={upNext} accounts={accounts} onEditTask={onEditTask} tone="plain" emptyText="Nothing due this week." />
        </Card>
      </div>
    </div>
  )
}
