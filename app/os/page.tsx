'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getLeads, getDeals, getProposals, getInvoices } from '@/lib/crm-store'
import type { Lead, Deal, Proposal, Invoice } from '@/lib/crm-types'
import TrafficPanel from './TrafficPanel'
import ActionCenter from './ActionCenter'
import CompanyGoalBar from '@/components/os/CompanyGoalBar'
import TasksOverview from './TasksOverview'
import { openContactPanel } from '@/lib/contact-panel'
import { isLikelySpam } from '@/lib/apply-guard'
import { OsIcon } from './os-icons'
import { EmailText } from '@/components/os/CopyEmail'

function fmt(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const PIPELINE_COLORS: Record<string, string> = {
  'New Lead':      'var(--os-accent)',
  'Discovery':     'var(--os-warn)',
  'Proposal Sent': 'var(--os-accent)',
  'Negotiation':   'var(--os-bad)',
  'Signed':        'var(--os-good)',
}

function DonutChart({ deals }: { deals: Deal[] }) {
  const active = deals   // already the open ones; the page filters once

  const stageCounts: Record<string, number> = {}
  for (const d of active) {
    stageCounts[d.stage] = (stageCounts[d.stage] ?? 0) + 1
  }

  const segments = Object.entries(stageCounts).filter(([, c]) => c > 0)
  const total = segments.reduce((s, [, c]) => s + c, 0)

  const cx = 70, cy = 70, r = 52, sw = 18
  const C = 2 * Math.PI * r

  let offset = 0
  const arcs = segments.map(([stage, count]) => {
    const frac = count / (total || 1)
    const dash = frac * C
    const arc = { stage, count, color: PIPELINE_COLORS[stage] ?? 'var(--os-text-faint)', dash, offset }
    offset += dash
    return arc
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--os-line)" strokeWidth={sw} />
        ) : (
          arcs.map(arc => (
            <circle
              key={arc.stage}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth={sw}
              strokeDasharray={`${arc.dash} ${C - arc.dash}`}
              strokeDashoffset={-arc.offset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px' }}
            />
          ))
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 22, fill: 'var(--os-text)' }}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', fontSize: 10, fill: '#9a8cba' }}>deals</text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {segments.map(([stage, count]) => (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--os-text)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIPELINE_COLORS[stage] ?? '#9a8cba', flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 500 }}>{stage}</span>
            <span style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700 }}>{count}</span>
          </div>
        ))}
        {segments.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>No active deals</div>
        )}
      </div>
    </div>
  )
}

export default function OsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])

  const reload = () => {
    setLeads(getLeads())
    setDeals(getDeals())
    setProposals(getProposals())
    setInvoices(getInvoices())
  }

  useEffect(() => {
    reload()
    window.addEventListener('bos:hydrated', reload)
    return () => window.removeEventListener('bos:hydrated', reload)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeDeals = deals.filter(d => !['completed', 'lost'].includes(d.stage))
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.value ?? 0), 0)
  const signedProposals = proposals.filter(p => p.status === 'signed')

  const statCards = [
    { label: 'Total leads',    value: String(leads.filter(l => !isLikelySpam(l)).length), note: 'All time, spam excluded', icon: 'applications' as const, bg: 'rgba(124,77,214,.12)' },
    { label: 'Active deals',   value: String(activeDeals.length),     note: 'In pipeline',        icon: 'hot' as const, bg: 'rgba(232,165,22,.16)' },
    { label: 'Pipeline value', value: fmt(pipelineValue),             note: 'USD',                icon: 'money' as const, bg: 'rgba(31,138,91,.14)'  },
    { label: 'Signed',         value: String(signedProposals.length), note: 'Proposals closed',   icon: 'signed' as const, bg: 'rgba(224,104,63,.14)' },
  ]

  const topOpportunities = deals
    .filter(d => !['completed', 'lost'].includes(d.stage))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3)
    .map((d, i) => {
      const avatarColors = [
        'linear-gradient(150deg,var(--os-bad),#eaa92e)',
        'linear-gradient(150deg,var(--os-accent),#b06fd6)',
        'linear-gradient(150deg,var(--os-good),var(--os-accent))',
      ]
      const initials = d.clientName?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
      return { ...d, initials, avBg: avatarColors[i % avatarColors.length] }
    })

  const stBadge = (s: string) =>
    s === 'signed' ? { sc: 'var(--os-good)', sbg: 'rgba(31,138,91,.12)' } :
    s === 'sent'   ? { sc: 'var(--os-warn)', sbg: 'rgba(232,165,22,.16)' } :
                     { sc: 'var(--os-accent)', sbg: 'rgba(124,77,214,.12)' }

  const realLeads = leads.filter(l => !isLikelySpam(l))
  const hiddenSpam = leads.length - realLeads.length
  const recentLeads = realLeads.slice(0, 5)
  const recentProposals = proposals.slice(0, 5)

  const leadAvatarColors = [
    'linear-gradient(150deg,var(--os-accent),#b06fd6)',
    'linear-gradient(150deg,var(--os-bad),#eaa92e)',
    'linear-gradient(150deg,var(--os-good),var(--os-accent))',
    'linear-gradient(150deg,var(--os-warn),var(--os-bad))',
    'linear-gradient(150deg,var(--os-accent),var(--os-accent))',
  ]

  return (
    <>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Dashboard</div>
          <div className="os-page-sub">Welcome back. Here is what is happening.</div>
        </div>
        <Link href="/os/proposals/new" className="os-btn os-btn-primary">
          + New Proposal
        </Link>
      </div>

      <div className="os-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 22 }}>
        {statCards.map(s => (
          <div key={s.label} className="os-stat-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="os-stat-label">{s.label}</span>
              <span className="os-stat-icon" style={{ background: s.bg }}><OsIcon name={s.icon} size={14} /></span>
            </div>
            <div className={`os-stat-value${/[$€ƒ]/.test(String(s.value)) ? ' money' : ''}`}>{s.value}</div>
            <div className="os-stat-sub">{s.note}</div>
          </div>
        ))}
      </div>

      <CompanyGoalBar />

      <div className="os-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22, alignItems: 'stretch' }}>
        <ActionCenter deals={deals} invoices={invoices} proposals={proposals} />
        <TasksOverview />
      </div>

      <TrafficPanel compact />

      <div className="os-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>

        <div className="os-card" style={{ padding: '20px 22px' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-space-mono), Space Mono, monospace', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--os-accent)', marginBottom: 4 }}>Pipeline Overview</div>
            <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--os-text)' }}>{activeDeals.length} active deals</div>
          </div>
          <DonutChart deals={activeDeals} />
        </div>

        <div className="os-card" style={{ padding: '20px 22px' }}>
          <div style={{ fontFamily: 'var(--font-space-mono), Space Mono, monospace', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--os-accent)', marginBottom: 14 }}>Top Opportunities</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topOpportunities.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--os-text-faint)', padding: '16px 0' }}>No active opportunities yet</div>
            ) : topOpportunities.map(opp => {
              const isHot = opp.stage === 'Proposal Sent' || (opp.value ?? 0) > 5000
              return (
                <div key={opp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 11px', borderRadius: 12, border: '1px solid var(--os-line)', background: 'var(--os-card-alt)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: opp.avBg, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                    {opp.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      onClick={() => openContactPanel({ id: opp.id, name: opp.clientName ?? 'Unnamed', email: opp.clientEmail, phone: opp.clientPhone, company: opp.clientCompany, tags: opp.tags, notes: opp.notes, createdAt: opp.createdAt, _deal: opp })}
                      style={{ fontWeight: 700, fontSize: 13, color: 'var(--os-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                    >{opp.clientName ?? 'Unnamed'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)', marginTop: 1 }}>{opp.stage}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 800, fontSize: 13.5, color: 'var(--os-text)' }}>{fmt(opp.value ?? 0)}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: isHot ? 'rgba(224,104,63,.14)' : 'rgba(232,165,22,.16)', color: isHot ? '#c4501f' : 'var(--os-warn)' }}>
                      {isHot ? 'HOT' : 'WARM'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      <div className="os-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1.05fr', gap: 16 }}>

        <div className="os-card">
          <div className="os-card-header">
            <span className="os-card-title">Recent Leads</span>
            <Link href="/os/contacts" className="os-btn os-btn-ghost os-btn-sm">View all</Link>
          </div>
          {hiddenSpam > 0 && (
            <div style={{ padding: '8px 20px 0', fontSize: 11.5, color: 'var(--os-text-faint)' }}>
              {hiddenSpam} likely spam {hiddenSpam === 1 ? 'lead is' : 'leads are'} hidden here.{' '}
              <Link href="/os/contacts" style={{ color: 'var(--os-accent)', fontWeight: 600 }}>See them</Link>
            </div>
          )}
          {recentLeads.length === 0 ? (
            <div style={{ padding: '32px 24px', color: 'var(--os-text-faint)', fontSize: 13, textAlign: 'center' }}>
              {hiddenSpam > 0
                ? 'Every lead so far reads as spam. Nothing real has come in yet.'
                : 'No leads yet. Form submissions will appear here.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentLeads.map((lead, i) => {
                const initials = lead.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < recentLeads.length - 1 ? '1px solid var(--os-line)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: leadAvatarColors[i % leadAvatarColors.length], display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => openContactPanel({ id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, company: lead.company, source: lead.source, notes: lead.notes, createdAt: lead.createdAt, tags: (lead as Lead & { tags?: string[] }).tags })}
                        style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--os-text)', cursor: 'pointer' }}
                      >{lead.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--os-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><EmailText email={lead.email} /></div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'rgba(124,77,214,.1)', color: 'var(--os-accent)' }}>
                      {lead.source || 'website'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="os-card">
          <div className="os-card-header">
            <span className="os-card-title">Proposals</span>
            <Link href="/os/proposals" className="os-btn os-btn-ghost os-btn-sm">View all</Link>
          </div>
          {recentProposals.length === 0 ? (
            <div style={{ padding: '32px 24px', color: 'var(--os-text-faint)', fontSize: 13, textAlign: 'center' }}>No proposals yet. Create your first proposal.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, padding: '9px 20px', borderBottom: '1px solid var(--os-line)', background: 'var(--os-card-alt)' }}>
                <span style={{ fontFamily: 'var(--font-space-mono), Space Mono, monospace', fontSize: 10, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Client</span>
                <span style={{ fontFamily: 'var(--font-space-mono), Space Mono, monospace', fontSize: 10, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Total</span>
                <span style={{ fontFamily: 'var(--font-space-mono), Space Mono, monospace', fontSize: 10, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Status</span>
              </div>
              {recentProposals.map((p, i) => {
                const { sc, sbg } = stBadge(p.status)
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center', padding: '12px 20px', borderBottom: i < recentProposals.length - 1 ? '1px solid var(--os-line)' : 'none' }}>
                    <div>
                      <div
                        onClick={() => openContactPanel({ id: p.id, name: p.clientName, email: p.clientEmail, company: p.clientCompany, createdAt: p.createdAt, kindLabel: 'Proposal' })}
                        style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--os-text)', cursor: 'pointer' }}
                      >{p.clientName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--os-text-faint)' }}>{p.ref}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-sora), Sora, sans-serif', fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)', whiteSpace: 'nowrap' }}>
                      {p.total === 0 ? '$0' : fmt(p.total)}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sbg, color: sc, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                      {p.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
