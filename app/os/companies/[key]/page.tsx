'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SearchSelect } from '@/components/os/SearchSelect'
import { moneyOf, STAGE_LABEL, type Company } from '@/lib/companies'
import { ago, card, fmtMoney, input, OUT_LABEL, pill, STAGE_TONE, useCompanies } from '../shared'

const h: React.CSSProperties = { fontWeight: 650, fontSize: 15, marginBottom: 10 }
const muted: React.CSSProperties = { fontSize: 13, color: 'var(--os-text-muted)' }
const DEAL_LABEL: Record<string, string> = { lead: 'New lead', discovery: 'Discovery', proposal_sent: 'Proposal sent', negotiation: 'Negotiation', signed: 'Signed', active: 'Active', completed: 'Completed', lost: 'Lost' }

function decode(k: string) { try { return decodeURIComponent(k) } catch { return k } }

export default function CompanyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = use(params)
  const key = decode(raw)
  const { companies, people, research, loaded, error, post } = useCompanies()
  const c = useMemo(() => companies.find(x => x.key === key || x.tokens.includes(key)), [companies, key])

  if (!c) {
    return (
      <div style={{ maxWidth: 900 }}>
        <Link href="/os/companies" style={muted}>← Companies</Link>
        <div style={{ ...card, marginTop: 12 }}>{loaded ? 'This company is not in the system any more.' : 'Loading…'}</div>
        {error && <div style={{ ...card, marginTop: 12 }}>{error}</div>}
      </div>
    )
  }
  return <CompanyView key={c.key} c={c} people={people} research={research} error={error} post={post} />
}

function CompanyView({ c, people, research, error, post }: {
  c: Company
  people: ReturnType<typeof useCompanies>['people']
  research: boolean
  error: string
  post: ReturnType<typeof useCompanies>['post']
}) {
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [notes, setNotes] = useState(c.profile.notes ?? '')
  const [details, setDetails] = useState({ name: c.profile.name ?? c.name, website: c.website, industry: c.industry })
  const [connect, setConnect] = useState('')
  const [unlinkArmed, setUnlinkArmed] = useState('')
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 3500); return () => clearTimeout(t) }, [note])

  const money = moneyOf(c)
  const brief = c.profile.brief
  const inCompany = new Set(c.people.map(p => p.key))
  const candidates = people.filter(p => !inCompany.has(p.key) && !p.spam)
    .map(p => ({ id: p.key, label: p.name || p.email, sub: [p.company, p.email].filter(Boolean).join(' · '), badge: p.stage }))

  const run = async (tag: string, body: Record<string, unknown>, done?: string) => {
    setBusy(tag)
    const r = await post(body)
    setBusy('')
    if (r && done) setNote(done)
    return r
  }
  const saveDetails = () => {
    const patch: Record<string, string> = {}
    if (details.name.trim() && details.name.trim() !== c.name) patch.name = details.name.trim()
    if (details.website.trim() !== c.website) patch.website = details.website.trim()
    if (details.industry.trim() !== c.industry) patch.industry = details.industry.trim()
    if (Object.keys(patch).length) run('details', { action: 'patch', key: c.key, patch }, 'Saved')
  }
  const doResearch = () => run('research', {
    action: 'research', key: c.key,
    input: { name: c.name, website: c.website, island: c.island, industry: c.industry, notes: c.profile.notes ?? '', knownPeople: c.people.map(p => ({ name: p.name, role: p.role })) },
  }, 'Assistant finished the research.')

  return (
    <div style={{ maxWidth: 1100 }}>
      <Link href="/os/companies" style={muted}>← Companies</Link>
      <div className="os-page-header" style={{ marginTop: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="os-page-title" style={{ overflowWrap: 'anywhere' }}>{c.name}</div>
          <div className="os-page-sub" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={pill(STAGE_TONE[c.stage])}>{STAGE_LABEL[c.stage]}</span>
            {[c.industry, c.island].filter(Boolean).join(' · ')}
            {c.website && <a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer">{c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>}
          </div>
        </div>
      </div>

      {error && <div style={{ ...card, borderColor: 'var(--os-danger, #dc2626)', marginBottom: 14 }}>{error}</div>}
      {note && <div role="status" style={{ ...card, borderColor: 'var(--os-success, #16a34a)', marginBottom: 14 }}>{note}</div>}

      <div className="oc-grid" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ ...h, marginBottom: 0 }}>Assistant&apos;s research</div>
            <span style={{ ...muted, fontSize: 12 }}>{brief ? `updated ${ago(brief.at)}` : ''}</span>
            <button className="os-btn os-btn-ghost os-btn-sm" style={{ marginLeft: 'auto' }} disabled={!!busy || !research} onClick={doResearch}>
              {busy === 'research' ? 'Researching, about a minute…' : brief ? 'Research again' : 'Research now'}
            </button>
          </div>
          {!research && <div style={muted}>Research runs on the live site, where the AI key is set.</div>}
          {c.profile.briefError && !brief && <div style={{ ...muted, color: 'var(--os-warn, #d97706)' }}>Last try: {c.profile.briefError}</div>}
          {!brief && research && !c.profile.briefError && <div style={muted}>Not researched yet. Assistant works through open leads and the outbound list by itself on weekdays, or press Research now.</div>}
          {brief && (
            <div style={{ display: 'grid', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
              {brief.summary && <div>{brief.summary}</div>}
              {brief.whatTheyDo && <Field label="What they do">{brief.whatTheyDo}</Field>}
              {brief.size && <Field label="Size">{brief.size}</Field>}
              {brief.signals.length > 0 && <Field label="What we noticed"><ul style={{ margin: 0, paddingLeft: 18 }}>{brief.signals.map((s, i) => <li key={i}>{s}</li>)}</ul></Field>}
              {brief.angle && <Field label="How we could help">{brief.angle}</Field>}
              {brief.hook && <Field label="Opening line for the first email">&ldquo;{brief.hook}&rdquo;</Field>}
              {brief.questions.length > 0 && <Field label="Questions for the call"><ol style={{ margin: 0, paddingLeft: 18 }}>{brief.questions.map((s, i) => <li key={i}>{s}</li>)}</ol></Field>}
              {brief.sources.length > 0 && (
                <Field label="Sources">
                  <div style={{ display: 'grid', gap: 2 }}>
                    {brief.sources.map(u => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{u.replace(/^https?:\/\/(www\.)?/, '')}</a>)}
                  </div>
                </Field>
              )}
            </div>
          )}
        </section>

        <section style={card}>
          <div style={h}>People and roles</div>
          {!c.people.length && <div style={{ ...muted, marginBottom: 10 }}>Nobody connected yet.</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            {c.people.map(p => (
              <div key={p.key} style={{ display: 'grid', gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--os-border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                  {p.email
                    ? <Link href={`/os/contacts/${encodeURIComponent(p.email)}`} style={{ fontWeight: 600 }}>{p.name || p.email}</Link>
                    : <span style={{ fontWeight: 600 }}>{p.name}</span>}
                  <span style={pill(p.stage === 'client' ? 'var(--os-success, #16a34a)' : p.stage === 'lead' ? 'var(--os-accent)' : 'var(--os-text-muted)')}>{p.stage}</span>
                  {p.email && <span style={{ ...muted, fontSize: 12.5, overflowWrap: 'anywhere' }}>{p.email}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ ...input, padding: '6px 9px' }} placeholder="Role (Owner, decides on marketing…)" defaultValue={p.role}
                    onBlur={e => { const v = e.target.value.trim(); if (v !== p.role) run('role', { action: 'patch', key: c.key, patch: { roles: { [p.key]: v } } }, 'Role saved') }} />
                  {unlinkArmed === p.key
                    ? <button className="os-btn os-btn-ghost os-btn-sm" style={{ color: 'var(--os-danger, #dc2626)', whiteSpace: 'nowrap' }} onClick={() => { setUnlinkArmed(''); run('unlink', { action: 'unassign', person: p.key, detach: !p.assigned }, 'Removed from this company') }}>Press again</button>
                    : <button className="os-btn os-btn-ghost os-btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setUnlinkArmed(p.key)}>Not here</button>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ ...muted, marginBottom: 6 }}>Connect a contact to {c.name}</div>
            <SearchSelect value={connect} items={candidates} placeholder="Search your contacts…"
              onChange={id => { setConnect(''); if (id) run('assign', { action: 'assign', person: id, key: c.key }, 'Connected') }} />
          </div>
          {brief && brief.people.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...muted, marginBottom: 6 }}>Found on the web, not in your contacts</div>
              <div style={{ display: 'grid', gap: 4, fontSize: 13.5 }}>
                {brief.people.filter(w => !c.people.some(p => p.name.toLowerCase() === w.name.toLowerCase())).map((w, i) => (
                  <div key={i}>{w.name}{w.role ? `, ${w.role}` : ''}{w.source && <> · <a href={w.source} target="_blank" rel="noreferrer">source</a></>}</div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section style={card}>
          <div style={h}>Invoices</div>
          {money.length > 0 && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
              {money.map(m => <div key={m.currency}><div style={{ fontWeight: 700, fontSize: 18 }}>{fmtMoney(m.paid, m.currency)}</div><div style={muted}>paid{m.owed > 0 ? `, ${fmtMoney(m.owed, m.currency)} open` : ''}</div></div>)}
            </div>
          )}
          {!c.invoices.length && <div style={muted}>No invoices.</div>}
          <div style={{ display: 'grid', gap: 6 }}>
            {[...c.invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map(i => (
              <Link key={i.id} href={`/os/invoices/${i.id}`} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: 'inherit' }}>
                <span>#{i.number}</span><span style={muted}>{i.date?.slice(0, 10)}</span>
                <span style={{ marginLeft: 'auto' }}>{fmtMoney(i.total, i.currency)}</span><span style={{ ...muted, minWidth: 54, textAlign: 'right' }}>{i.status}</span>
              </Link>
            ))}
          </div>
        </section>

        <section style={card}>
          <div style={h}>Deals and proposals</div>
          {!c.deals.length && !c.proposals.length && <div style={muted}>Nothing in the pipeline.</div>}
          <div style={{ display: 'grid', gap: 6, fontSize: 13.5 }}>
            {c.deals.map(d => (
              <div key={d.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={pill('var(--os-accent)')}>{DEAL_LABEL[d.status] ?? d.status}</span>
                <span>{d.title}</span>
                {!!d.value && <span style={{ marginLeft: 'auto' }}>{fmtMoney(d.value, d.currency ?? 'USD')}</span>}
              </div>
            ))}
            {c.proposals.map(d => (
              <Link key={d.id} href={`/os/proposals/${d.id}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'inherit' }}>
                <span style={pill('var(--os-text-muted)')}>Proposal {d.status}</span>
                <span>{d.title}</span>
                {!!d.value && <span style={{ marginLeft: 'auto' }}>{fmtMoney(d.value, d.currency ?? 'USD')}</span>}
              </Link>
            ))}
          </div>
        </section>

        {c.prospect && (
          <section style={card}>
            <div style={h}>Outbound</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
              <span style={pill('var(--os-accent)')}>{OUT_LABEL[c.prospect.status] ?? c.prospect.status}</span>
              {c.prospect.rank && <span>#{c.prospect.rank} on the list</span>}
              {c.prospect.score != null && <span style={muted}>score {c.prospect.score}</span>}
              <span style={muted}>{c.prospect.touchesDone ?? 0} touches done</span>
              {!!c.prospect.responses && <span style={muted}>{c.prospect.responses} answer{c.prospect.responses === 1 ? '' : 's'} logged</span>}
            </div>
            {(c.prospect.size || c.prospect.revenue) && <div style={{ ...muted, marginTop: 8 }}>{[c.prospect.size, c.prospect.revenue].filter(Boolean).join(' · ')}</div>}
            <Link className="os-btn os-btn-ghost os-btn-sm" style={{ marginTop: 10, display: 'inline-flex' }} href="/os/outbound">Open Outbound leads</Link>
          </section>
        )}

        <section style={card}>
          <div style={h}>Details and notes</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input style={input} aria-label="Company name" placeholder="Company name" value={details.name} onChange={e => setDetails({ ...details, name: e.target.value })} onBlur={saveDetails} />
            <input style={input} aria-label="Website" placeholder="Website" value={details.website} onChange={e => setDetails({ ...details, website: e.target.value })} onBlur={saveDetails} />
            <input style={input} aria-label="Industry" placeholder="Industry" value={details.industry} onChange={e => setDetails({ ...details, industry: e.target.value })} onBlur={saveDetails} />
            <textarea style={{ ...input, minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }} placeholder="What you know about them: how decisions are made, who influences whom, what they care about…"
              value={notes} onChange={e => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (c.profile.notes ?? '')) run('notes', { action: 'patch', key: c.key, patch: { notes } }, 'Notes saved') }} />
            <div style={{ ...muted, fontSize: 12 }}>Saves when you click away. Assistant reads these notes when it researches.</div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 650, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--os-text-muted)', marginBottom: 3 }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}
