'use client'

import { useCallback, useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getDeals, getLeads, getProposals, getInvoices, updateDeal, updateLead, saveDeal,
} from '@/lib/crm-store'
import { getAttendees, updateAttendee } from '@/lib/event-store'
import { getClientRecords, updateClientRecord, type ClientRecord } from '@/lib/client-store'
import {
  buildPersonHistory, isOpenDeal, invoiceTotal, STATUS_LABEL, STATUS_HINT, type PersonRecord,
} from '@/lib/client-history'
import RelationshipTimeline from '@/components/os/RelationshipTimeline'
import { CrmDetail, genId, STAGES } from '../../deals/crm-shared'
import type { Deal, Lead, ActivityType, ActivityEntry } from '@/lib/crm-types'
import type { EventAttendee } from '@/lib/event-types'
import { EmailText } from '@/components/os/CopyEmail'

const money = (n?: number, cur?: string) => {
  if (n === undefined) return null
  const sym = cur === 'EUR' ? '€' : cur === 'AWG' ? 'Afl. ' : '$'
  return sym + n.toLocaleString()
}
const key = (e?: string) => (e ?? '').trim().toLowerCase()
const digits = (s?: string) => (s ?? '').replace(/[^\d]/g, '')

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function AddToPipeline({ onAdd }: { onAdd: (note: string) => void }) {
  const [note, setNote] = useState<string | null>(null)
  if (note === null) {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--os-text-faint)', marginBottom: 10 }}>Not in the pipeline yet.</div>
        <button className="os-btn os-btn-primary os-btn-sm" onClick={() => setNote('')}>
          <i className="ti ti-plus" /> Add to lead pipeline
        </button>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input className="os-crm-input" placeholder="What's this about? (optional)" value={note}
        onChange={e => setNote(e.target.value)} style={{ flex: 1, maxWidth: 320 }}
        onKeyDown={e => { if (e.key === 'Enter') { onAdd(note); setNote(null) } }} />
      <button className="os-btn os-btn-primary os-btn-sm" onClick={() => { onAdd(note); setNote(null) }}>Add</button>
      <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => setNote(null)}>✕</button>
    </div>
  )
}

export default function ContactWorkspace({ params }: { params: Promise<{ email: string }> }) {
  const { email: rawEmail } = use(params)
  const email = decodeURIComponent(rawEmail)
  const router = useRouter()

  const [lead, setLead] = useState<Lead | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [attendee, setAttendee] = useState<EventAttendee | null>(null)
  const [clientRec, setClientRec] = useState<ClientRecord | null>(null)
  const [person, setPerson] = useState<PersonRecord | null>(null)
  const [name, setName] = useState('')

  const reload = useCallback(() => {
    const k = key(email)
    const l = getLeads().find(x => key(x.email) === k) ?? null
    const d = getDeals().filter(x => key(x.clientEmail) === k)
    const a = getAttendees().find(x => key(x.email) === k) ?? null
    const vc = getClientRecords().find(x => key(x.email) === k) ?? null
    setLead(l)
    setDeals(d)
    setAttendee(a)
    setClientRec(vc)
    setPerson(buildPersonHistory(email, {
      deals: getDeals(), leads: getLeads(), proposals: getProposals(), invoices: getInvoices(), attendees: getAttendees(),
    }))
    setName(d.find(isOpenDeal)?.clientName ?? d[0]?.clientName ?? l?.name ?? vc?.name ?? a?.name ?? email)
  }, [email])

  useEffect(() => { reload() }, [reload])

  if (!person) return <div style={{ padding: 60, color: 'var(--os-text-faint)' }}>Loading…</div>

  const primaryDeal = deals.find(isOpenDeal) ?? deals[0] ?? null
  const proposals = getProposals().filter(p => key(p.clientEmail) === key(email))
  const invoices = getInvoices().filter(i => key(i.clientEmail) === key(email))
  const nothingAtAll = !lead && deals.length === 0 && !attendee && !clientRec

  const phone = primaryDeal?.clientPhone || lead?.phone || attendee?.phone || clientRec?.phone
  const company = primaryDeal?.clientCompany || lead?.company || attendee?.company || clientRec?.company

  function patchDeal(p: Partial<Deal>) {
    if (!primaryDeal) return
    updateDeal(primaryDeal.id, p)
    reload()
  }
  function addActivity(type: ActivityType, text: string) {
    if (!primaryDeal) return
    const entry: ActivityEntry = { id: genId('act'), ts: new Date().toISOString(), type, text }

    patchDeal({ activity: [entry, ...(primaryDeal.activity ?? [])] })
  }
  function moveStage(stage: Deal['stage']) {
    if (!primaryDeal || primaryDeal.stage === stage) return
    const label = STAGES.find(s => s.key === stage)?.label ?? stage
    const entry: ActivityEntry = { id: genId('act'), ts: new Date().toISOString(), type: 'stage', text: `Moved to ${label}` }
    patchDeal({ stage, activity: [entry, ...(primaryDeal.activity ?? [])] })
  }

  function saveName(value: string) {
    setName(value)
    if (primaryDeal) updateDeal(primaryDeal.id, { clientName: value })
    else if (lead) updateLead(lead.id, { name: value })
    else if (attendee) updateAttendee(attendee.id, { name: value })
    else if (clientRec) updateClientRecord(clientRec.id, { name: value })
  }

  function addToPipeline(note: string) {
    saveDeal({
      clientName: name || email,
      clientEmail: email,
      clientPhone: phone,
      clientCompany: company,
      stage: 'lead',
      value: 0,
      currency: 'USD',
      service: note.trim() || 'Follow up',
    })
    window.dispatchEvent(new CustomEvent('bos:hydrated'))
    reload()
  }

  const wa = digits(phone)
  return (
    <>
      <button className="os-back-link" onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}>
        <i className="ti ti-arrow-left" /> Back
      </button>

      {nothingAtAll ? (
        <div className="os-card" style={{ padding: 40, textAlign: 'center', color: 'var(--os-text-faint)' }}>
          No record found for <strong style={{ color: 'var(--os-text)' }}>{email}</strong>.
        </div>
      ) : (
        <>
          <div className="os-card" style={{ padding: '22px 24px', marginBottom: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(150deg,var(--os-accent),#b06fd6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {initials(name)}
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <input className="os-crm-input" value={name} onChange={e => setName(e.target.value)} onBlur={e => saveName(e.target.value)}
                  style={{ fontSize: 24, fontWeight: 800, background: 'transparent', padding: '2px 4px', maxWidth: 420 }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6, paddingLeft: 4 }}>
                  <span className="os-tag-chip active" title={STATUS_HINT[person.status]}>{STATUS_LABEL[person.status]}</span>
                  <EmailText email={email} style={{ fontSize: 13, color: 'var(--os-text-faint)' }} />
                  {company && <span style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>· {company}</span>}
                </div>
              </div>
              <div className="os-crm-actions" style={{ marginBottom: 0, maxWidth: 320 }}>
                {wa && <a className="os-crm-action os-crm-action-wa" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><i className="ti ti-brand-whatsapp" /> WhatsApp</a>}
                {phone && <a className="os-crm-action os-crm-action-dark" href={`tel:${phone}`}><i className="ti ti-phone" /> Call</a>}
                <a className="os-crm-action os-crm-action-dark" href={`mailto:${email}`}><i className="ti ti-mail" /> Email</a>
              </div>
            </div>
          </div>

          <div className="os-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
            <div className="os-crm-section-title" style={{ marginBottom: 14 }}>Pipeline</div>
            {primaryDeal ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                  <select className="os-crm-input" value={primaryDeal.stage}
                    onChange={e => moveStage(e.target.value as Deal['stage'])}
                    style={{ width: 'auto', padding: '8px 12px', fontWeight: 700 }}>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <Link href={`/os/deals/${primaryDeal.id}`} className="os-btn os-btn-ghost os-btn-sm">
                    <i className="ti ti-arrow-up-right" /> Open pipeline workspace
                  </Link>
                  {deals.length > 1 && (
                    <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>+{deals.length - 1} other deal{deals.length > 2 ? 's' : ''} in the timeline below</span>
                  )}
                </div>
                <CrmDetail deal={primaryDeal} layout="page" onPatch={patchDeal} onAddActivity={addActivity} />
              </>
            ) : (
              <AddToPipeline onAdd={addToPipeline} />
            )}
          </div>

          <div className="os-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
            <div className="os-crm-section-title" style={{ marginBottom: 14 }}>Client plan</div>
            {clientRec ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--os-text-faint)', fontWeight: 700 }}>Plan</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--os-text)' }}>{clientRec.planName || clientRec.program || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--os-text-faint)', fontWeight: 700 }}>Status</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: clientRec.status === 'active' ? 'var(--os-good)' : clientRec.status === 'paused' ? 'var(--os-warn)' : 'var(--os-text-faint)', textTransform: 'capitalize' }}>{clientRec.status}</div>
                  </div>
                  {!!clientRec.monthlyAmount && (
                    <div>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--os-text-faint)', fontWeight: 700 }}>Monthly</div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--os-good)' }}>{money(clientRec.monthlyAmount, clientRec.currency)}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>Not a client yet.</div>
            )}
          </div>

          <div className="os-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
            <div className="os-crm-section-title" style={{ marginBottom: 14 }}>Invoices</div>
            {invoices.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>No invoices yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {invoices.map(inv => (
                  <Link key={inv.id} href={`/os/invoices/${inv.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', textDecoration: 'none', borderBottom: '1px solid var(--os-line)' }}>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)' }}>{inv.projectTitle || `Invoice #${inv.number}`}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 100, textTransform: 'capitalize', color: inv.status === 'paid' ? 'var(--os-good)' : inv.status === 'overdue' ? 'var(--os-bad)' : 'var(--os-text-faint)', background: inv.status === 'paid' ? 'var(--os-good-soft)' : inv.status === 'overdue' ? 'var(--os-bad-soft)' : 'var(--os-line)' }}>{inv.status}</span>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--os-text)' }}>{money(invoiceTotal(inv), inv.currency)}</span>
                  </Link>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Link href={`/os/invoices/new?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`} className="os-btn os-btn-ghost os-btn-sm">
                <i className="ti ti-file-dollar" /> New invoice
              </Link>
            </div>
          </div>

          <div className="os-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
            <div className="os-crm-section-title" style={{ marginBottom: 14 }}>Proposals</div>
            {proposals.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>No proposals yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {proposals.map(p => (
                  <Link key={p.id} href={`/os/proposals/${p.id}/edit`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', textDecoration: 'none', borderBottom: '1px solid var(--os-line)' }}>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)' }}>{p.title || p.ref}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 100, textTransform: 'capitalize', color: p.status === 'signed' ? 'var(--os-good)' : 'var(--os-text-faint)', background: p.status === 'signed' ? 'var(--os-good-soft)' : 'var(--os-line)' }}>{p.status}</span>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--os-text)' }}>{money(p.total, p.currency)}</span>
                  </Link>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Link href={`/os/proposals/new?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`} className="os-btn os-btn-ghost os-btn-sm">
                <i className="ti ti-file-text" /> New proposal
              </Link>
            </div>
          </div>

          <PortalAccess email={email} name={person.name} />

          <div className="os-card" style={{ padding: '20px 24px' }}>
            <RelationshipTimeline person={person} limit={20} />
          </div>
        </>
      )}
    </>
  )
}

function PortalAccess({ email, name }: { email: string; name: string }) {
  const [row, setRow] = useState<{
    clientId?: string; accessStatus: string; lastLoginAt?: string | null; hasPassword: boolean
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    return fetch('/api/os/learning-platform', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) return
        const found = (d.roster ?? []).find(
          (p: { email: string }) => p.email.toLowerCase() === email.toLowerCase(),
        )
        setRow(found ?? { accessStatus: 'none', hasPassword: false })
      })
      .catch(() => { /* the rest of the contact still works */ })
  }, [email])

  useEffect(() => { void load() }, [load])

  async function send() {
    setBusy(true); setNote('')
    try {
      const res = await fetch('/api/os/learning-platform', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-welcome', email, name }),
      })
      const d = await res.json().catch(() => ({}))
      setNote(d?.ok ? `Access sent to ${email}` : (d?.error || 'That did not send.'))
      if (d?.ok) await load()
    } catch { setNote('Could not reach the server.') }
    setBusy(false)
  }

  if (!row) return null
  const has = row.accessStatus === 'active'
  const ago = row.lastLoginAt
    ? new Date(row.lastLoginAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    : null

  return (
    <div className="os-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="os-card-title">Portal access</div>
          <div style={{ fontSize: 13.5, color: 'var(--os-text-faint)', marginTop: 2 }}>
            {row.accessStatus === 'none' ? 'No account yet.'
              : row.accessStatus === 'suspended' ? 'Suspended.'
              : ago ? `Active · last opened ${ago}`
              : 'Active · never opened it'}
            {has && row.hasPassword ? ' · has a password' : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {has && (
            <a className="os-btn os-btn-ghost os-btn-sm" target="_blank" rel="noopener noreferrer"
              href={`/os/contacts/${encodeURIComponent(email)}`}>
              <i className="ti ti-eye" /> Their portal
            </a>
          )}
          <button className="os-btn os-btn-primary os-btn-sm" disabled={busy} onClick={send}>
            {busy ? 'Sending…' : has ? 'Resend link' : 'Send access'}
          </button>
        </div>
      </div>
      {note && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--os-text-muted)' }}>{note}</p>
      )}
    </div>
  )
}
