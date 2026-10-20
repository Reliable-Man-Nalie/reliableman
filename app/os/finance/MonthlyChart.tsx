'use client'

import { useState } from 'react'

export type ChartMonth = { label: string; income: number; costs: number; ads: number }

const PURPLE = 'var(--os-accent)'
const GOLD = '#eaa92e'
const ADS = '#e86fb4'
const GREEN = 'var(--os-good)'
const CORAL = 'var(--os-bad)'
const FAINT = 'var(--os-text-faint)'
const MUTED = 'var(--os-text-muted)'
const LINE = 'var(--os-line)'

function money(n: number, cur: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
}
function short(n: number) {
  const a = Math.abs(n)
  if (a >= 1000) return (n / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k'
  return String(Math.round(n))
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

function niceMax(v: number) {
  if (v <= 0) return 1000
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}

type Step = { tone: 'good' | 'warn' | 'bad'; title: string; body: string }

function actionSteps(full: ChartMonth[], runRate: number, cur: string, costByCategory: { label: string; total: number }[]): Step[] {
  const steps: Step[] = []
  if (full.length === 0) return steps
  const m = (n: number) => money(n, cur)

  const last3 = full.slice(-3), prev3 = full.slice(-6, -3)
  const lastAvg = avg(last3.map(x => x.income))
  if (prev3.length === 3) {
    const prevAvg = avg(prev3.map(x => x.income))
    const change = prevAvg > 0 ? ((lastAvg - prevAvg) / prevAvg) * 100 : 0
    if (change <= -15) steps.push({ tone: 'bad', title: `Income is down ${Math.abs(Math.round(change))}% on the three months before`, body: `The last three full months averaged ${m(lastAvg)}, against ${m(prevAvg)} before. Open your pipeline and follow up the warmest leads this week, and check which client or offer stopped paying.` })
    else if (change >= 15) steps.push({ tone: 'good', title: `Income is up ${Math.round(change)}% on the three months before`, body: `The last three full months averaged ${m(lastAvg)}, against ${m(prevAvg)} before. Find what changed (a client, an offer, an event) and do more of exactly that.` })
    else steps.push({ tone: 'warn', title: 'Income is flat', body: `The last three full months averaged ${m(lastAvg)}, about the same as before. Steady is good; growth needs one new recurring client or a higher price on the next one.` })
  }

  if (runRate > 0) {
    if (lastAvg < runRate) steps.push({ tone: 'bad', title: 'Recurring costs are higher than recent income', body: `Your tools and subscriptions run ${m(runRate)} a month and the last three months brought in ${m(lastAvg)} on average. Cancel what you have not opened in a month before adding anything new.` })
    else steps.push({ tone: 'good', title: `Your fixed costs are covered ${(lastAvg / runRate).toFixed(1)} times`, body: `Recurring costs are ${m(runRate)} a month against ${m(lastAvg)} coming in. Keep new subscriptions to ones that save you hours or bring in clients.` })
  }

  const losing = full.filter(x => x.costs > x.income)
  if (losing.length > 0) steps.push({ tone: 'warn', title: `${losing.length} of ${full.length} months cost more than came in`, body: `${losing.map(x => x.label).join(', ')}. Look at what was paid out in ${losing.length === 1 ? 'that month' : 'those months'}: a one-off purchase is fine, a pattern is not.` })

  const adMonths = full.filter(x => x.ads > 0)
  const noAdMonths = full.filter(x => x.ads === 0)
  if (adMonths.length > 0) {
    const adTotal = adMonths.reduce((s, x) => s + x.ads, 0)
    const withAvg = avg(adMonths.map(x => x.income))
    const withoutAvg = avg(noAdMonths.map(x => x.income))
    if (noAdMonths.length > 0 && withAvg > withoutAvg * 1.1) {
      steps.push({ tone: 'good', title: 'Months with ads brought in more', body: `${m(withAvg)} on average with ads against ${m(withoutAvg)} without, on ${m(adTotal)} of ad spend this year. Keep a steady budget and tag every new lead with the ad it came from, so the next read is proof and not timing.` })
    } else if (noAdMonths.length > 0) {
      steps.push({ tone: 'warn', title: 'Ads have not clearly moved income yet', body: `${m(withAvg)} on average with ads against ${m(withoutAvg)} without, on ${m(adTotal)} spent. Before spending more, send ads to one offer with one clear next step (an event or an application) and count the leads it brings.` })
    } else {
      steps.push({ tone: 'warn', title: 'Ads ran every month, so there is nothing to compare', body: `${m(adTotal)} spent this year. Tag each new lead with its source in the pipeline; that is the only way to see which ad pays.` })
    }
  } else {
    steps.push({ tone: 'warn', title: 'No ad spend recorded this year', body: 'Import the Meta or Google Ads export below so the chart can show what the ads did.' })
  }

  const top = costByCategory[0]
  const totalCost = costByCategory.reduce((s, c) => s + c.total, 0)
  if (top && totalCost > 0) steps.push({ tone: 'warn', title: `${top.label} is your biggest cost`, body: `${m(top.total)} this year, ${Math.round((top.total / totalCost) * 100)}% of everything spent. This is the first line to check when you want to cut.` })

  const best = full.reduce((a, b) => (b.income > a.income ? b : a))
  if (best.income > 0) steps.push({ tone: 'good', title: `${best.label} was your best month`, body: `${m(best.income)} came in. Look at what sold that month and whether it can be sold again.` })

  return steps
}

export default function MonthlyChart({ year, months, cur, runRate, costByCategory }: {
  year: number
  months: ChartMonth[]
  cur: string
  runRate: number
  costByCategory: { label: string; total: number }[]
}) {
  const [picked, setPicked] = useState<number | null>(null)
  if (months.length === 0) return null

  const full = months.slice(0, -1) // the last month is the one still running
  const steps = actionSteps(full, runRate, cur, costByCategory)

  const W = 760, H = 300, padL = 46, padR = 12, padT = 16, padB = 34
  const plotW = W - padL - padR, plotH = H - padT - padB
  const top = niceMax(Math.max(...months.map(x => Math.max(x.income, x.costs)), 1))
  const minProfit = Math.min(0, ...months.map(x => x.income - x.costs))
  const bottom = minProfit < 0 ? -niceMax(-minProfit) : 0
  const span = top - bottom
  const y = (v: number) => padT + ((top - v) / span) * plotH
  const slot = plotW / months.length
  const barW = Math.min(26, slot * 0.32)
  const ticks = Array.from({ length: 5 }, (_, i) => bottom + (span * i) / 4)
  const profitPts = months.map((x, i) => [padL + slot * i + slot / 2, y(x.income - x.costs)] as const)

  const sel = picked !== null ? months[picked] : null
  const next = picked !== null ? months[picked + 1] : undefined

  const adRows = months.map((x, i) => ({ ...x, i, next: months[i + 1] })).filter(x => x.ads > 0)

  const tone = { good: GREEN, warn: '#FFB84D', bad: CORAL }

  return (
    <div className="os-card" style={{ marginTop: 22, padding: 22 }}>
      <div className="os-card-header">
        <div className="os-card-title">{year}: how the business is moving</div>
        <div className="os-card-sub">Money in, costs and profit per month, with ad spend marked inside the costs. Tap a month for the detail.</div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: MUTED, margin: '6px 0 10px' }}>
        <Legend color={PURPLE} label="Money in" />
        <Legend color={GOLD} label="Costs" />
        <Legend color={ADS} label="of which ads" />
        <Legend color={GREEN} label="Profit" line />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Money in, costs and profit per month in ${year}`}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={LINE} strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={FAINT}>{short(t)}</text>
          </g>
        ))}
        {months.map((x, i) => {
          const cx = padL + slot * i + slot / 2
          const running = i === months.length - 1
          const on = picked === i
          return (
            <g key={x.label} onClick={() => setPicked(on ? null : i)} style={{ cursor: 'pointer' }} opacity={picked !== null && !on ? 0.45 : running ? 0.7 : 1}>
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill={on ? 'var(--os-accent-soft)' : 'transparent'} />
              <rect x={cx - barW - 2} y={y(x.income)} width={barW} height={Math.max(0, y(0) - y(x.income))} rx={4} fill={PURPLE} />
              <rect x={cx + 2} y={y(x.costs)} width={barW} height={Math.max(0, y(0) - y(x.costs))} rx={4} fill={GOLD} />
              {x.ads > 0 && <rect x={cx + 2} y={y(x.ads)} width={barW} height={Math.max(0, y(0) - y(x.ads))} rx={4} fill={ADS} />}
              <text x={cx} y={H - 12} textAnchor="middle" fontSize="11.5" fill={on ? 'var(--os-text)' : FAINT} fontWeight={on ? 700 : 400}>
                {x.label.slice(0, 3)}{running ? '*' : ''}
              </text>
              <title>{`${x.label}: in ${money(x.income, cur)}, costs ${money(x.costs, cur)}${x.ads ? `, ads ${money(x.ads, cur)}` : ''}, profit ${money(x.income - x.costs, cur)}`}</title>
            </g>
          )
        })}
        <polyline points={profitPts.map(p => p.join(',')).join(' ')} fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinejoin="round" pointerEvents="none" />
        {profitPts.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={4} fill={months[i].income - months[i].costs >= 0 ? GREEN : CORAL} stroke="var(--os-base)" strokeWidth={1.5} pointerEvents="none" />
        ))}
      </svg>
      <div style={{ fontSize: 11.5, color: FAINT, marginTop: 4 }}>* {months[months.length - 1].label} is still running.</div>

      {sel && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 12, border: `1px solid ${LINE}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          <Fact label={sel.label} value={money(sel.income - sel.costs, cur)} color={sel.income - sel.costs >= 0 ? GREEN : CORAL} sub="profit" />
          <Fact label="Money in" value={money(sel.income, cur)} color={PURPLE} />
          <Fact label="Costs" value={money(sel.costs, cur)} color={GOLD} />
          <Fact label="Ads" value={sel.ads > 0 ? money(sel.ads, cur) : 'none'} color={ADS} />
          {sel.ads > 0 && <Fact label="In per $1 of ads" value={(sel.income / sel.ads).toFixed(1) + 'x'} color={MUTED} sub="same month" />}
          {next && sel.ads > 0 && <Fact label={`${next.label} money in`} value={money(next.income, cur)} color={MUTED} sub="the month after" />}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", textTransform: 'uppercase', letterSpacing: '.2em', fontSize: 11, color: FAINT, marginBottom: 8 }}>Ads against income</div>
        {adRows.length === 0 ? (
          <div style={{ fontSize: 13.5, color: MUTED }}>No ad spend recorded this year. Import your Meta or Google Ads export further down the page.</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="os-table">
                <thead>
                  <tr><th>Month</th><th style={{ textAlign: 'right' }}>Ads</th><th style={{ textAlign: 'right' }}>Money in</th><th style={{ textAlign: 'right' }}>In per $1 of ads</th><th style={{ textAlign: 'right' }}>Month after</th></tr>
                </thead>
                <tbody>
                  {adRows.map(r => (
                    <tr key={r.label}>
                      <td style={{ fontWeight: 600 }}>{r.label}{r.i === months.length - 1 ? '*' : ''}</td>
                      <td style={{ textAlign: 'right', color: ADS }}>{money(r.ads, cur)}</td>
                      <td style={{ textAlign: 'right', color: PURPLE }}>{money(r.income, cur)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{(r.income / r.ads).toFixed(1)}x</td>
                      <td style={{ textAlign: 'right', color: MUTED }}>{r.next ? money(r.next.income, cur) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: FAINT, marginTop: 6 }}>
              This shows timing, not proof: a client from an ad often pays a month later, and some months had income that had nothing to do with ads. Tag new leads with the ad they came from to know for sure.
            </div>
          </>
        )}
      </div>

      {steps.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", textTransform: 'uppercase', letterSpacing: '.2em', fontSize: 11, color: FAINT, marginBottom: 8 }}>What to do next</div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {steps.map(s => (
              <div key={s.title} style={{ padding: 14, borderRadius: 12, border: `1px solid ${LINE}`, borderLeft: `3px solid ${tone[s.tone]}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--os-text)', marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{s.body}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>Read from full months only. For a written read, use Ask Assistant at the top of the page.</div>
        </div>
      )}
    </div>
  )
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: line ? 3 : 12, borderRadius: line ? 2 : 3, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

function Fact({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: FAINT }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: FAINT }}>{sub}</div>}
    </div>
  )
}
