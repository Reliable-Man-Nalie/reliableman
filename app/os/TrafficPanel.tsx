'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Series = { day: string; visitors: number; views: number }
type Page = { path: string; views: number; visitors: number }
type Source = { source: string; visitors: number }
type Funnel = { funnelId: string; visitors: number; clicks: number; leads: number; purchases: number; conversion: number }
type Traffic = {
  ok: boolean
  error?: string
  days: number
  totals: { visitors: number; pageViews: number; leads: number; purchases: number; conversion: number }
  series: Series[]
  topPages: Page[]
  sources: Source[]
  funnels: Funnel[]
  capped?: boolean
}

const nf = new Intl.NumberFormat('en-US')

function VisitorsChart({ series }: { series: Series[] }) {
  const W = 720, H = 150, PAD = 6
  const max = Math.max(1, ...series.map(s => s.visitors))
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2)
  const pts = series.map((s, i) => [PAD + i * step, y(s.visitors)] as const)

  const line = pts.map(([x, yy], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yy.toFixed(1)}`).join(' ')
  const area = `${line} L${(PAD + (series.length - 1) * step).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`
  const last = pts[pts.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }}>
      <defs>
        <linearGradient id="tp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--os-accent)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--os-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PAD} x2={W - PAD} y1={y(max * f)} y2={y(max * f)} stroke="var(--os-line)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#tp-fill)" />
      <path d={line} fill="none" stroke="var(--os-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--os-gold)" />}
    </svg>
  )
}

function BarRow({ label, value, max, suffix, href }: { label: string; value: number; max: number; suffix: string; href?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0
  const name = href
    ? <Link href={href} style={{ color: 'var(--os-text)', textDecoration: 'none' }}>{label}</Link>
    : <span style={{ color: 'var(--os-text)' }}>{label}</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ width: '42%', height: 7, borderRadius: 999, background: 'var(--os-card-alt)', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--os-accent), var(--os-gold))' }} />
      </div>
      <div style={{ width: 68, textAlign: 'right', fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--os-text)', flexShrink: 0 }}>
        {nf.format(value)}<span style={{ color: 'var(--os-text-faint)', fontWeight: 500, fontSize: 11 }}> {suffix}</span>
      </div>
    </div>
  )
}

export default function TrafficPanel({ compact = false }: { compact?: boolean }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Traffic | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/os/traffic?days=${days}`)
      .then(r => r.json())
      .then(d => { if (alive) { setData(d); setLoading(false) } })
      .catch(() => { if (alive) { setData(null); setLoading(false) } })
    return () => { alive = false }
  }, [days])

  const t = data?.totals
  const stats = [

    { label: 'Visitors', value: t ? nf.format(t.visitors) : '0', note: 'Unique people' },
    { label: 'Page views', value: t ? nf.format(t.pageViews) : '0', note: 'Pages opened' },
    { label: 'Leads', value: t ? nf.format(t.leads) : '0', note: 'Forms completed' },
    { label: 'Conversion', value: t ? `${t.conversion}%` : '0%', note: 'Visitor to lead' },
  ]

  const maxPage = Math.max(1, ...(data?.topPages ?? []).map(p => p.views))
  const maxSource = Math.max(1, ...(data?.sources ?? []).map(s => s.visitors))
  const maxFunnel = Math.max(1, ...(data?.funnels ?? []).map(f => f.visitors))

  if (compact) {
    const ok = data?.ok && data.totals.pageViews > 0
    return (
      <Link
        href="/os/insights"
        className="os-card os-traffic-strip"
        style={{
          display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
          padding: '14px 20px', marginBottom: 22, textDecoration: 'none',
        }}
      >
        <span className="os-card-title" style={{ flexShrink: 0 }}>Funnel, 30 days</span>

        {ok && [
          ['Visitors', nf.format(t!.visitors)],
          ['Leads', nf.format(t!.leads)],
          ['Converted', `${t!.conversion}%`],
        ].map(([label, value]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 19, color: 'var(--os-text)', fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </span>
            <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>{label}</span>
          </span>
        ))}

        {loading && <span style={{ fontSize: 12.5, color: 'var(--os-text-faint)' }}>Reading traffic</span>}
        {!loading && !ok && (
          <span style={{ fontSize: 12.5, color: 'var(--os-text-faint)' }}>
            No visitors recorded yet. This fills up once ads send traffic.
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--os-accent)', whiteSpace: 'nowrap' }}>
          Full insights &rarr;
        </span>
      </Link>
    )
  }

  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="os-card-title">Traffic and funnels</div>
          <div style={{ fontSize: 13, color: 'var(--os-text-faint)', marginTop: 3 }}>
            Where people came from, what they opened, and which funnel turned them into a lead.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                fontFamily: 'inherit',
                background: days === d ? 'var(--os-accent-soft)' : 'var(--os-card)',
                border: `1px solid ${days === d ? 'var(--os-accent)' : 'var(--os-line)'}`,
                color: days === d ? 'var(--os-text)' : 'var(--os-text-faint)',
              }}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {!loading && data && !data.ok && (
        <div className="os-card" style={{ padding: '18px 20px', fontSize: 13.5, color: 'var(--os-text-muted)' }}>
          Traffic data is not readable yet. {data.error ? `Reason: ${data.error}` : 'The analytics store is not configured.'}
        </div>
      )}

      {!loading && data?.ok && data.totals.pageViews === 0 && (
        <div className="os-card" style={{ padding: '18px 20px', fontSize: 13.5, color: 'var(--os-text-muted)' }}>
          No page views recorded in the last {days} days. Tracking fires from the funnel pages, so this fills up once ads start sending traffic.
        </div>
      )}

      {(loading || (data?.ok && data.totals.pageViews > 0)) && (
        <>
          <div className="os-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
            {stats.map(s => (
              <div key={s.label} className="os-stat-card" style={{ padding: '16px 18px' }}>
                <span className="os-stat-label">{s.label}</span>
                <div className="os-stat-value" style={{ marginTop: 8, fontSize: 30 }}>{loading ? '…' : s.value}</div>
                <div className="os-stat-sub">{s.note}</div>
              </div>
            ))}
          </div>

          <div className="os-card" style={{ padding: '20px 22px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="os-card-title">Visitors per day</div>
              {data?.capped && (
                <div style={{ fontSize: 11, color: 'var(--os-warn)' }}>Showing the most recent 20,000 events</div>
              )}
            </div>
            {data?.series?.length ? <VisitorsChart series={data.series} /> : <div style={{ height: 150 }} />}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div className="os-card" style={{ padding: '20px 22px' }}>
              <div className="os-card-title" style={{ marginBottom: 10 }}>Most visited pages</div>
              {(data?.topPages ?? []).map(p => (
                <BarRow key={p.path} label={p.path} value={p.views} max={maxPage} suffix="views" href={p.path} />
              ))}
              {!loading && !data?.topPages?.length && (
                <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>Nothing yet.</div>
              )}
            </div>

            <div className="os-card" style={{ padding: '20px 22px' }}>
              <div className="os-card-title" style={{ marginBottom: 10 }}>Where they came from</div>
              {(data?.sources ?? []).map(s => (
                <BarRow key={s.source} label={s.source} value={s.visitors} max={maxSource} suffix="people" />
              ))}
              {!loading && !data?.sources?.length && (
                <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>Nothing yet.</div>
              )}
            </div>
          </div>

          <div className="os-card" style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="os-card-title">Funnel performance</div>
              <Link href="/os/funnel" className="os-btn os-btn-ghost os-btn-sm" style={{ padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}>
                All funnels
              </Link>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 10px 8px 0' }}>Funnel</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Visitors</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Leads</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Sales</th>
                    <th style={{ padding: '8px 0 8px 10px', width: '30%' }}>Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.funnels ?? []).map(f => (
                    <tr key={f.funnelId} style={{ borderTop: '1px solid var(--os-line)' }}>
                      <td style={{ padding: '11px 10px 11px 0', fontWeight: 600, color: 'var(--os-text)' }}>{f.funnelId}</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', color: 'var(--os-text-muted)' }}>{nf.format(f.visitors)}</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', color: 'var(--os-text)', fontWeight: 700 }}>{nf.format(f.leads)}</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', color: f.purchases > 0 ? 'var(--os-good)' : 'var(--os-text-faint)', fontWeight: 700 }}>{nf.format(f.purchases)}</td>
                      <td style={{ padding: '11px 0 11px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'var(--os-card-alt)', overflow: 'hidden' }}>
                            <div style={{

                              width: `${Math.max(2, (f.visitors / maxFunnel) * 100)}%`,
                              height: '100%', borderRadius: 999,
                              background: 'linear-gradient(90deg, var(--os-accent), var(--os-gold))',
                            }} />
                          </div>
                          <span style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', width: 48, textAlign: 'right', color: 'var(--os-text)' }}>
                            {f.conversion}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !data?.funnels?.length && (
                <div style={{ fontSize: 13, color: 'var(--os-text-faint)', paddingTop: 8 }}>No funnel activity in this window.</div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
