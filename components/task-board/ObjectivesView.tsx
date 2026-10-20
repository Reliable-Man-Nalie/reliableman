'use client'

import { useMemo, useState } from 'react'
import CompanyGoalBar from '@/components/os/CompanyGoalBar'
import { AREAS, type LevelId } from '@/lib/business-areas'
import {
  type Objective, laneFor, graduated, progressFor, daysUntil,
} from '@/lib/objectives'
import { BLOCK_START_KEY, type Task, type Status } from '@/app/os/tasks/task-shared'

const NEXT: Record<Status, Status> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

export function ObjectivesView({
  objectives, tasks, onEditTask, onSetStatus, onAddProject,
  onCreateObjective, onUpdateObjective, onDeleteObjective,
}: {
  objectives: Objective[]

  tasks: Task[]
  onEditTask: (t: Task) => void
  onSetStatus: (t: Task, s: Status) => void
  onAddProject: (objective: Objective, title: string) => void
  onCreateObjective: (title: string, area?: LevelId) => void
  onUpdateObjective: (o: Objective, patch: Partial<Objective>) => void
  onDeleteObjective: (o: Objective) => void
}) {
  const [showTrail, setShowTrail] = useState(false)
  const done = graduated(objectives)
  const unsorted = laneFor(objectives, undefined)
  const loose = tasks.filter(t => !t.parentId && !t.objectiveId && t.status !== 'done').length

  return (
    <div>
      <CompanyGoalBar />

      <div className="os-obj-lanes">
        {AREAS.map(a => (
          <Lane key={a.id} title={a.heading} sub={a.name} color={a.color} area={a.id}
            objectives={laneFor(objectives, a.id)} tasks={tasks}
            onEditTask={onEditTask} onSetStatus={onSetStatus} onAddProject={onAddProject}
            onCreateObjective={onCreateObjective} onUpdateObjective={onUpdateObjective} onDeleteObjective={onDeleteObjective} />
        ))}
        {unsorted.length > 0 && (
          <Lane title="Not in an area yet" sub="Pick one in Edit" color="var(--os-text-faint)"
            objectives={unsorted} tasks={tasks}
            onEditTask={onEditTask} onSetStatus={onSetStatus} onAddProject={onAddProject}
            onCreateObjective={onCreateObjective} onUpdateObjective={onUpdateObjective} onDeleteObjective={onDeleteObjective} />
        )}
      </div>

      {loose > 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--os-text-faint)', margin: '14px 2px 0' }}>
          {loose} open task{loose === 1 ? ' is' : 's are'} not under an objective yet. Open one and pick its Objective to put it on a bar.
        </p>
      )}

      {done.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <button type="button" onClick={() => setShowTrail(v => !v)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 800, color: 'var(--os-text)' }}>
            🎓 Graduated ({done.length}) {showTrail ? '▾' : '▸'}
          </button>
          {showTrail && (
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {done.map(o => (
                <div key={o.id} className="os-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--os-good)', fontWeight: 800 }}>✓</span>
                  <span style={{ flex: 1, minWidth: 160, fontSize: 13.5, fontWeight: 600, color: 'var(--os-text)' }}>{o.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>
                    {o.completedAt ? new Date(o.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}
                  </span>
                  <button type="button" className="os-btn os-btn-ghost os-btn-sm"
                    onClick={() => onUpdateObjective(o, { completedAt: undefined })}>Bring back</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Lane({ title, sub, color, area, objectives, tasks, onCreateObjective, ...card }: {
  title: string
  sub: string
  color: string
  area?: LevelId
  objectives: Objective[]
  tasks: Task[]
  onEditTask: (t: Task) => void
  onSetStatus: (t: Task, s: Status) => void
  onAddProject: (objective: Objective, title: string) => void
  onCreateObjective: (title: string, area?: LevelId) => void
  onUpdateObjective: (o: Objective, patch: Partial<Objective>) => void
  onDeleteObjective: (o: Objective) => void
}) {
  const [draft, setDraft] = useState('')
  const add = () => { const v = draft.trim(); if (!v) return; onCreateObjective(v, area); setDraft('') }
  return (
    <section className="os-obj-lane">
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, background: color, flexShrink: 0, alignSelf: 'center' }} aria-hidden />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--os-text)' }}>{title}</h2>
        <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>{sub}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--os-text-faint)' }}>{objectives.length || ''}</span>
      </header>
      <div style={{ display: 'grid', gap: 10 }}>
        {objectives.map(o => <ObjectiveCard key={o.id} objective={o} tasks={tasks} color={color} {...card} />)}
      </div>
      {area !== undefined && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="+ Add an objective"
            aria-label={`Add an objective to ${title}`}
            style={{ flex: 1, minWidth: 0, border: '1px dashed var(--os-line-strong)', background: 'transparent', color: 'var(--os-text)', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, outline: 'none' }} />
          {draft.trim() && <button type="button" onClick={add} className="os-btn os-btn-primary os-btn-sm">Add</button>}
        </div>
      )}
    </section>
  )
}

function ObjectiveCard({ objective: o, tasks, color, onEditTask, onSetStatus, onAddProject, onUpdateObjective, onDeleteObjective }: {
  objective: Objective
  tasks: Task[]
  color: string
  onEditTask: (t: Task) => void
  onSetStatus: (t: Task, s: Status) => void
  onAddProject: (objective: Objective, title: string) => void
  onUpdateObjective: (o: Objective, patch: Partial<Objective>) => void
  onDeleteObjective: (o: Objective) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const prog = useMemo(() => progressFor(o.id, tasks), [o.id, tasks])
  const projects = useMemo(
    () => tasks.filter(t => !t.parentId && t.objectiveId === o.id)
      .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9)),
    [o.id, tasks],
  )
  const left = daysUntil(o.dueDate)
  const addProject = () => { const v = draft.trim(); if (!v) return; onAddProject(o, v); setDraft('') }

  if (editing) return <ObjectiveEditor objective={o} onCancel={() => setEditing(false)}
    onSave={p => { onUpdateObjective(o, p); setEditing(false) }}
    onDelete={() => onDeleteObjective(o)} />

  return (
    <article className="os-card" style={{ padding: '14px 16px', borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--os-text)', lineHeight: 1.3 }}>{o.title}</div>
          {o.keyResult && <div style={{ fontSize: 12.5, color: 'var(--os-text-muted, var(--os-text-faint))', marginTop: 3 }}>Done when: {o.keyResult}</div>}
        </div>
        {left !== null && (
          <span title={`Due ${o.dueDate}`} style={{
            flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: '3px 8px', borderRadius: 99,
            background: 'var(--os-chip)', color: left < 0 ? 'var(--os-bad)' : left <= 2 ? 'var(--os-warn)' : 'var(--os-text-faint)',
          }}>
            {left < 0 ? `${-left}d late` : left === 0 ? 'Today' : left === 1 ? 'Tomorrow' : `${left} days`}
          </span>
        )}
        <button type="button" onClick={() => setEditing(true)} className="os-btn os-btn-ghost os-btn-sm" aria-label={`Edit ${o.title}`}>Edit</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.pct} aria-label={`${o.title} progress`}
          style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--os-line)', overflow: 'hidden' }}>
          <div style={{ width: `${prog.pct}%`, height: '100%', borderRadius: 99, background: prog.complete ? 'var(--os-good)' : color, transition: 'width .3s ease' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--os-text-faint)', minWidth: 74, textAlign: 'right' }}>
          {prog.total ? `${prog.done}/${prog.total} · ${prog.pct}%` : 'No tasks yet'}
        </span>
      </div>

      {projects.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 2 }}>
          {projects.map(p => {
            const subs = tasks.filter(t => t.parentId === p.id)
            const subsDone = subs.filter(t => t.status === 'done').length
            const isDone = p.status === 'done'
            return (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
                <button type="button" onClick={() => onSetStatus(p, NEXT[p.status])}
                  aria-label={`${p.title}: ${p.status.replace('_', ' ')}. Change status`}
                  style={{
                    width: 20, height: 20, borderRadius: 99, flexShrink: 0, cursor: 'pointer', padding: 0,
                    border: `2px solid ${isDone ? 'var(--os-good)' : p.status === 'in_progress' ? color : 'var(--os-line-strong)'}`,
                    background: isDone ? 'var(--os-good)' : p.status === 'in_progress' ? `linear-gradient(90deg, ${color} 50%, transparent 50%)` : 'transparent',
                    color: '#fff', fontSize: 11, lineHeight: 1,
                  }}>{isDone ? '✓' : ''}</button>
                <button type="button" onClick={() => onEditTask(p)}
                  style={{
                    flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
                    fontSize: 13.5, fontWeight: 600, color: isDone ? 'var(--os-text-faint)' : 'var(--os-text)',
                    textDecoration: isDone ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.title}</button>
                {p.fields?.[BLOCK_START_KEY] && <span title="Has a time block for Google Calendar" aria-label="Time block set" style={{ fontSize: 12 }}>📅</span>}
                {subs.length > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--os-text-faint)' }}>{subsDone}/{subs.length}</span>}
              </li>
            )
          })}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProject() } }}
          placeholder="+ Add a project"
          aria-label={`Add a project to ${o.title}`}
          style={{ flex: 1, minWidth: 0, border: 'none', borderBottom: '1px solid var(--os-line)', background: 'transparent', color: 'var(--os-text)', padding: '7px 2px', fontSize: 13, outline: 'none' }} />
        {draft.trim() && <button type="button" onClick={addProject} className="os-btn os-btn-sm">Add</button>}
      </div>

      {prog.complete && (
        <button type="button" onClick={() => onUpdateObjective(o, { completedAt: new Date().toISOString() })}
          className="os-btn os-btn-primary os-btn-sm" style={{ marginTop: 12, width: '100%' }}>
          🎓 Everything is done. Graduate this objective
        </button>
      )}
    </article>
  )
}

function ObjectiveEditor({ objective: o, onSave, onCancel, onDelete }: {
  objective: Objective
  onSave: (patch: Partial<Objective>) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(o.title)
  const [keyResult, setKeyResult] = useState(o.keyResult ?? '')
  const [dueDate, setDueDate] = useState(o.dueDate ?? '')
  const [area, setArea] = useState<string>(o.area ?? '')
  const field: React.CSSProperties = {
    width: '100%', padding: '9px 10px', border: '1.5px solid var(--os-line)', borderRadius: 8,
    fontSize: 16, color: 'var(--os-text)', outline: 'none', background: 'var(--os-card)',
  }
  const lab: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 1, margin: '8px 0 4px' }
  return (
    <form className="os-card" style={{ padding: '14px 16px' }}
      onSubmit={e => {
        e.preventDefault()
        if (!title.trim()) return
        onSave({
          title: title.trim(), keyResult: keyResult.trim() || undefined,
          dueDate: dueDate || undefined, area: (area || undefined) as LevelId | undefined,
        })
      }}>
      <label style={{ ...lab, marginTop: 0 }}>Objective</label>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} style={field} />
      <label style={lab}>Done when</label>
      <input value={keyResult} onChange={e => setKeyResult(e.target.value)} placeholder="One line: what finished looks like" style={field} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={lab}>Due</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={field} />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label style={lab}>Area</label>
          <select value={area} onChange={e => setArea(e.target.value)} style={field}>
            <option value="">Not sorted</option>
            {AREAS.map(a => <option key={a.id} value={a.id}>{a.heading}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="submit" className="os-btn os-btn-primary os-btn-sm">Save</button>
        <button type="button" onClick={onCancel} className="os-btn os-btn-sm">Cancel</button>
        <button type="button" onClick={onDelete} className="os-btn os-btn-ghost os-btn-sm" style={{ marginLeft: 'auto', color: 'var(--os-bad)' }}>Delete</button>
      </div>
    </form>
  )
}
