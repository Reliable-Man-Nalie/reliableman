'use client'

export type LifecycleStep = {
  key: string
  label: string
  icon: string // Tabler icon name without the "ti-" prefix
  at?: string  // ISO timestamp when this step completed; absent = not yet
}

function fmt(at?: string): string {
  if (!at) return ''
  const d = new Date(at)
  const today = new Date()
  const days = Math.floor((today.getTime() - d.getTime()) / 86400000)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (days <= 0) return `Today · ${date}`
  if (days === 1) return `Yesterday`
  if (days < 30) return `${days}d ago`
  return date
}

export function LifecycleFlow({ steps }: { steps: LifecycleStep[] }) {
  const firstPending = steps.findIndex(s => !s.at)
  const allDone = firstPending === -1

  return (
    <div style={{ background: '#fff', border: '1px solid #ede8fb', borderRadius: 16, padding: '20px 24px', overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 'min-content' }}>
        {steps.map((s, i) => {
          const done = !!s.at
          const current = !done && i === firstPending
          const color = done ? '#16a34a' : current ? '#7c3aed' : '#cbb8e8'
          const isLast = i === steps.length - 1

          const connectorDone = !!steps[i + 1]?.at || (done && allDone)
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? '0 0 auto' : 1, minWidth: isLast ? 92 : 120 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: isLast ? 92 : 96, flexShrink: 0 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#16a34a' : current ? '#f5f0ff' : '#f6f4fb',
                  border: current ? '2px solid #7c3aed' : done ? 'none' : '2px solid #ece6f7',
                  color: done ? '#fff' : color, fontSize: 16,
                  boxShadow: current ? '0 0 0 4px rgba(124,77,214,.12)' : 'none',
                }}>
                  <i className={`ti ${done ? 'ti-check' : s.icon}`} />
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: done ? '#15803d' : current ? '#5b21b6' : '#a99dc4', marginTop: 8, lineHeight: 1.25 }}>{s.label}</div>
                <div style={{ fontSize: 10.5, color: '#bbb', marginTop: 2, minHeight: 13 }}>{done ? fmt(s.at) : current ? 'Pending' : ''}</div>
              </div>
              {!isLast && (
                <div style={{ flex: 1, height: 2, background: connectorDone ? '#16a34a' : '#ece6f7', marginTop: 18, borderRadius: 2 }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
