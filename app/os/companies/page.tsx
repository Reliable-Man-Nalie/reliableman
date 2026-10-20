'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { companyHref, moneyOf, STAGE_LABEL, type CompanyStage } from '@/lib/companies'
import { ago, card, fmtMoney, input, OUT_LABEL, pill, STAGE_TONE, useCompanies } from './shared'

const FILTERS: ['all' | CompanyStage, string][] = [['all', 'All'], ['client', 'Clients'], ['pipeline', 'In pipeline'], ['outbound', 'Outbound running'], ['prospect', 'Outbound list'], ['contact', 'Contacts']]

export default function CompaniesPage() {
  const router = useRouter()
  const { companies, research, loaded, error, post } = useCompanies()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<'all' | CompanyStage>('all')
  const [shown, setShown] = useState(100)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', website: '', industry: '' })
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: companies.length }
    for (const x of companies) c[x.stage] = (c[x.stage] ?? 0) + 1
    return c
  }, [companies])
  const researched = companies.filter(c => c.profile.brief).length
  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return companies.filter(c => (stage === 'all' || c.stage === stage) &&
      (!n || `${c.name} ${c.domain} ${c.industry} ${c.island} ${c.people.map(p => `${p.name} ${p.email}`).join(' ')}`.toLowerCase().includes(n)))
  }, [companies, q, stage])

  const create = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    const r = await post({ action: 'create', ...form })
    setBusy(false)
    if (r?.key) router.push(companyHref(String(r.key)))
  }

  return (
    <div style={{ maxWidth: 1180 }}>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Companies</div>
          <div className="os-page-sub">
            {companies.length} {companies.length === 1 ? 'company' : 'companies'} · {counts.client ?? 0} {counts.client === 1 ? 'client' : 'clients'} · {counts.pipeline ?? 0} in pipeline · {researched} researched by Assistant
          </div>
        </div>
        <div className="os-page-actions">
          <button className="os-btn os-btn-primary" onClick={() => setAdding(a => !a)}>+ New company</button>
        </div>
      </div>

      {error && <div style={{ ...card, borderColor: 'var(--os-danger, #dc2626)', marginBottom: 14 }}>{error}</div>}
      {loaded && !research && (
        <div style={{ ...card, marginBottom: 14, fontSize: 13.5, color: 'var(--os-text-muted)' }}>
          Assistant researches companies by itself once the AI key is set, which is on the live site only. Here you can still connect people and keep notes.
        </div>
      )}

      {adding && (
        <div style={{ ...card, marginBottom: 14, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 650 }}>New company</div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <input style={input} placeholder="Company name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            <input style={input} placeholder="Website (optional)" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
            <input style={input} placeholder="Industry (optional)" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="os-btn os-btn-primary" disabled={busy || !form.name.trim()} onClick={create}>{busy ? 'Saving…' : 'Create and open'}</button>
            <button className="os-btn os-btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input style={{ ...input, maxWidth: 360, flex: '1 1 220px' }} placeholder="Search companies, people, industries" value={q} onChange={e => { setQ(e.target.value); setShown(100) }} />
        <div className="os-view-tabs" style={{ flexWrap: 'wrap' }}>
          {FILTERS.map(([k, l]) => (
            <button key={k} className={`os-view-tab${stage === k ? ' active' : ''}`} onClick={() => { setStage(k); setShown(100) }}>{l}{counts[k] ? ` (${counts[k]})` : ''}</button>
          ))}
        </div>
      </div>

      {!loaded && <div style={card}>Loading companies…</div>}
      {loaded && !list.length && <div style={card}>No companies here yet.</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {list.slice(0, shown).map(c => {
          const money = moneyOf(c)
          const open = c.deals.filter(d => ['lead', 'discovery', 'proposal_sent', 'negotiation'].includes(d.status)).length
          const owed = money.filter(m => m.owed > 0)
          return (
            <Link key={c.key} href={companyHref(c.key)} className="oc-row" style={{ ...card, padding: '12px 14px', display: 'grid', gap: 6, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontWeight: 650, fontSize: 15.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <span style={pill(STAGE_TONE[c.stage])}>{STAGE_LABEL[c.stage]}</span>
                {c.profile.brief && <span style={pill('var(--os-accent)')}>Researched</span>}
                {c.prospect && c.prospect.status !== 'new' && <span style={pill('var(--os-text-muted)')}>{OUT_LABEL[c.prospect.status] ?? c.prospect.status}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--os-text-muted)' }}>{c.lastSeen ? ago(c.lastSeen) : c.prospect?.rank ? `#${c.prospect.rank} on the list` : ''}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--os-text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {(c.industry || c.island) && <span>{[c.industry, c.island].filter(Boolean).join(' · ')}</span>}
                <span>{c.people.length} {c.people.length === 1 ? 'person' : 'people'}</span>
                {money.map(m => m.paid > 0 && <span key={m.currency}>{fmtMoney(m.paid, m.currency)} paid</span>)}
                {owed.map(m => <span key={`o${m.currency}`} style={{ color: 'var(--os-warn, #d97706)' }}>{fmtMoney(m.owed, m.currency)} open</span>)}
                {open > 0 && <span>{open} open deal{open === 1 ? '' : 's'}</span>}
                {c.profile.brief?.summary && <span style={{ flexBasis: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.profile.brief.summary}</span>}
              </div>
            </Link>
          )
        })}
      </div>
      {list.length > shown && <button className="os-btn os-btn-ghost" style={{ marginTop: 10 }} onClick={() => setShown(shown + 100)}>Show more ({list.length - shown} left)</button>}
    </div>
  )
}
