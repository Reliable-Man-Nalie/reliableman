'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { updateDeal, updateLead, getDeals, getLeads, getProposals, getInvoices, saveDeal, logLeadActivity } from '@/lib/crm-store'
import { getAttendees, updateAttendee } from '@/lib/event-store'
import { CONTACT_STATUSES, type LeadStatus } from '@/lib/crm-types'
import { CrmDetail, QuickActions, genId, isOpenStage, fmtTs, ACTIVITY_ICON } from '@/app/os/deals/crm-shared'
import { buildPersonHistory, type PersonRecord } from '@/lib/client-history'
import RelationshipTimeline from '@/components/os/RelationshipTimeline'
import type { Deal, Lead, ActivityType, ActivityEntry } from '@/lib/crm-types'
import type { EventAttendee } from '@/lib/event-types'

export interface PersonBusiness {
  name?: string; email?: string; phone?: string; company?: string
  business_name?: string; role?: string
  address?: string; country?: string; location?: string
  niche?: string; offer_summary?: string
  revenue_band?: string; reported_customers?: number
  website?: string; instagram?: string; facebook_url?: string
  linkedin_url?: string; tiktok_url?: string; youtube_url?: string; other_links?: string
  program?: string; plan_name?: string; delivery_stage?: string
  monthly_amount?: number; currency?: string
  onboarded_at?: string; started_at?: string; last_login_at?: string
}

export interface ContactCardContact {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  status?: LeadStatus
  source?: string
  notes?: string
  tags?: string[]
  createdAt?: string
  _deal?: Deal

  fullPageHref?: string

  kindLabel?: string
}

interface Props {
  contact: ContactCardContact | null
  onClose: () => void

  onSaveField?: (patch: Partial<ContactCardContact>) => void
}

interface Resolved {
  deal: Deal | null
  lead: Lead | null
  attendee: EventAttendee | null
}

const lower = (s?: string | null) => (s ?? '').trim().toLowerCase()
const newest = <T,>(rows: T[], at: (r: T) => string) => [...rows].sort((a, b) => (at(b) > at(a) ? 1 : -1))[0] ?? null

export function resolveContact(hint: ContactCardContact): Resolved {
  const email = lower(hint.email ?? hint._deal?.clientEmail)
  const deals = getDeals()
  const byEmailDeals = email ? deals.filter(d => lower(d.clientEmail) === email) : []
  const deal =
    hint._deal ??
    deals.find(d => d.id === hint.id) ??

    byEmailDeals.find(d => isOpenStage(d.stage)) ??
    newest(byEmailDeals, d => d.updatedAt ?? d.createdAt)
  const leads = getLeads()
  const lead = leads.find(l => l.id === hint.id) ?? (email ? newest(leads.filter(l => lower(l.email) === email), l => l.createdAt) : null)
  const attendees = getAttendees()
  const attendee = attendees.find(a => a.id === hint.id) ?? (email ? newest(attendees.filter(a => lower(a.email) === email), a => a.registeredAt) : null)
  return { deal: deal ?? null, lead, attendee }
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}
function avatarColor(id: string) {
  const colors = ['#7b2fff', '#0891b2', '#d97706', '#16a34a', '#db2777', '#9333ea']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

function Fact({ label, value, href }: { label: string; value?: string | number | null; href?: string }) {
  const v = typeof value === 'number' ? String(value) : (value ?? '').trim()
  if (!v) return null
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid var(--os-line)' }}>
      <span style={{ flex: '0 0 116px', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--os-text-faint)', fontWeight: 700 }}>{label}</span>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--os-accent)', overflowWrap: 'anywhere' }}>{v}</a>
        : <span style={{ fontSize: 13, color: 'var(--os-text)', overflowWrap: 'anywhere' }}>{v}</span>}
    </div>
  )
}

export const ONBOARDING_UPDATE_MARKER = 'They updated their details in Member area onboarding.'
const DISMISS_KEY = 'bos_seen_member_updates'

function dismissedIds(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') } catch { return [] }
}

const asUrl = (v?: string | null) => {
  const s = (v ?? '').trim()
  if (!s) return undefined
  if (/^https?:\/\//i.test(s)) return s
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return undefined   // some other scheme
  if (/\s/.test(s) || s.startsWith('@')) return undefined // a handle, not a URL
  if (!/^[^\s/]+\.[a-z]{2,}(\/|$)/i.test(s)) return undefined
  return `https://${s}`
}

type EditKey = 'email' | 'phone' | 'company' | 'notes' | 'name' | 'status'

export default function ContactCard({ contact, onClose, onSaveField }: Props) {
  const router = useRouter()

  const [version, setVersion] = useState(0)

  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window === 'undefined' ? [] : dismissedIds()))

  const [biz, setBiz] = useState<{ key: string; row: PersonBusiness | null; error: boolean }>({ key: '', row: null, error: false })

  const resolved = useMemo<Resolved>(() => {

    void version
    return contact ? resolveContact(contact) : { deal: null, lead: null, attendee: null }
  }, [contact, version])

  const key = contact?.id ?? ''
  const [edit, setEdit] = useState<{ key: string; deal: Partial<Deal>; form: Partial<ContactCardContact> }>({ key, deal: {}, form: {} })
  const dealEdit = edit.key === key ? edit.deal : {}
  const editDeal = (p: Partial<Deal>) => setEdit(e => (e.key === key ? { ...e, deal: { ...e.deal, ...p } } : { key, deal: p, form: {} }))
  const editForm = (p: Partial<ContactCardContact>) => setEdit(e => (e.key === key ? { ...e, form: { ...e.form, ...p } } : { key, deal: {}, form: p }))

  const deal = resolved.deal ? { ...resolved.deal, ...dealEdit } : null

  const form = useMemo<ContactCardContact | null>(() => {
    if (!contact) return null
    const row = resolved.lead ?? resolved.attendee
    return {
      ...contact,
      name: row?.name || contact.name,
      email: row?.email || contact.email,
      phone: row?.phone || contact.phone,
      company: row?.company || contact.company,
      notes: row?.notes ?? contact.notes,
      status: resolved.lead?.status ?? contact.status,
      source: resolved.lead?.source ?? contact.source ?? resolved.attendee?.source,
      createdAt: resolved.lead?.createdAt ?? resolved.attendee?.registeredAt ?? contact.createdAt,

      ...(edit.key === key ? edit.form : {}),
    }
  }, [contact, resolved, edit, key])

  const person = useMemo<PersonRecord | null>(() => {
    const email = contact?.email ?? resolved.deal?.clientEmail ?? resolved.lead?.email ?? resolved.attendee?.email
    if (!email) return null
    return buildPersonHistory(email, {
      deals: getDeals(), leads: getLeads(), proposals: getProposals(), invoices: getInvoices(), attendees: getAttendees(),
    })
  }, [contact, resolved])

  const bizEmail = contact?.email ?? resolved.deal?.clientEmail ?? resolved.lead?.email ?? resolved.attendee?.email ?? ''
  useEffect(() => {
    if (!bizEmail) return
    let live = true
    fetch(`/api/os/person-business?email=${encodeURIComponent(bizEmail)}`)
      .then(r => r.json())
      .then(d => { if (live) setBiz({ key: bizEmail, row: d?.ok ? (d.business ?? null) : null, error: !d?.ok }) })
      .catch(() => { if (live) setBiz({ key: bizEmail, row: null, error: true }) })
    return () => { live = false }
  }, [bizEmail, version])

  useEffect(() => {
    if (!contact) return
    const onWrite = () => setVersion(v => v + 1)
    window.addEventListener('bos:hydrated', onWrite)
    return () => window.removeEventListener('bos:hydrated', onWrite)
  }, [contact])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const notify = () => window.dispatchEvent(new CustomEvent('bos:hydrated'))

  const writer = useMemo<((patch: Partial<ContactCardContact>) => void) | null>(() => {
    if (onSaveField) return onSaveField
    if (resolved.lead) { const id = resolved.lead.id; return patch => updateLead(id, patch as Partial<Lead>) }
    if (resolved.attendee) { const id = resolved.attendee.id; return patch => updateAttendee(id, patch as Partial<EventAttendee>) }
    return null
  }, [onSaveField, resolved.lead, resolved.attendee])

  if (!contact || !form) return null

  function patchDeal(p: Partial<Deal>) {
    if (!deal) return
    updateDeal(deal.id, p)
    editDeal(p)
    notify()
  }
  function addActivity(type: ActivityType, text: string) {
    if (!deal) return
    const entry: ActivityEntry = { id: genId('act'), ts: new Date().toISOString(), type, text }

    patchDeal({ activity: [entry, ...(deal.activity ?? [])] })
  }

  const setField = (k: EditKey, value: string) => editForm({ [k]: value } as Partial<ContactCardContact>)

  const saveField = (k: EditKey, value?: string) => {
    if (!writer) return
    writer({ [k]: value ?? ((form?.[k] as string) ?? '') } as Partial<ContactCardContact>)
    notify()
  }
  const field = (label: string, k: 'email' | 'phone' | 'company', type = 'text', placeholder = '') => (
    <div className="os-crm-field">
      <label>{label}</label>
      <input className="os-crm-input" type={type} placeholder={placeholder} disabled={!writer}
        value={(form?.[k] as string) ?? ''}
        onChange={e => setField(k, e.target.value)} onBlur={() => saveField(k)} />
    </div>
  )

  function addToPipeline(note: string) {
    const email = form?.email
    if (!email) return
    saveDeal({
      clientName: form?.name || email,
      clientEmail: email,
      clientPhone: form?.phone,
      clientCompany: form?.company,
      stage: 'lead',
      value: 0,
      currency: 'USD',
      service: note.trim() || 'Follow up',
    })

    window.dispatchEvent(new CustomEvent('bos:hydrated'))
  }

  const recentUpdate = [...(deal?.activity ?? []), ...(resolved.lead?.activity ?? [])]
    .find(a => a.text?.startsWith(ONBOARDING_UPDATE_MARKER) && !dismissed.includes(a.id))

  const settled = !!bizEmail && biz.key === bizEmail
  const b = settled ? biz.row : null

  const bizFacts = b ? [
    b.business_name || b.company, b.role, b.niche, b.offer_summary, b.revenue_band,
    b.reported_customers, b.location || b.address || b.country,
    b.website, b.instagram, b.facebook_url, b.linkedin_url, b.tiktok_url, b.youtube_url, b.other_links,
  ].filter(v => (typeof v === 'number' ? true : Boolean((v ?? '').toString().trim()))).length : 0

  const color = avatarColor(contact.id)

  const contactEmail = deal?.clientEmail ?? form.email

  const kind = deal
    ? 'Pipeline deal'
    : contact.kindLabel
      ?? (resolved.lead ? 'Contact' : resolved.attendee ? `Attendee · ${resolved.attendee.eventTitle}` : 'On record')

  const actionTarget = deal ?? ({ clientPhone: form.phone, clientEmail: form.email, activity: [] } as unknown as Deal)

  return (
    <>
      <div className="os-drawer-overlay" onClick={onClose} />
      <div className="os-crm-drawer">
        <div className="os-drawer-head">
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {initials(deal?.clientName ?? form.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {deal ? (
              <input className="os-crm-input" value={deal.clientName}
                onChange={e => editDeal({ clientName: e.target.value })}
                onBlur={e => patchDeal({ clientName: e.target.value })}
                style={{ fontSize: 18, fontWeight: 800, background: 'transparent', padding: '2px 4px' }} />
            ) : (
              <input className="os-crm-input" value={form.name ?? ''} disabled={!writer}
                onChange={e => setField('name', e.target.value)} onBlur={() => saveField('name')}
                style={{ fontSize: 18, fontWeight: 800, background: 'transparent', padding: '2px 4px' }} />
            )}
            <div style={{ fontSize: 12, color: 'var(--os-text-faint)', marginTop: 2, paddingLeft: 4 }}>
              {kind}{form.source ? ` · ${form.source}` : ''}
            </div>
          </div>
          {(contact.fullPageHref || contactEmail) && (
            <button className="os-icon-btn" title="Open full contact page" onClick={() => router.push(contact.fullPageHref ?? `/os/contacts/${encodeURIComponent(contactEmail!)}`)}><i className="ti ti-arrows-diagonal" /></button>
          )}
          <button className="os-icon-btn" title="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className="os-drawer-body">
          {recentUpdate && (
            <div className="os-crm-notice" data-tone="warn">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <i className="ti ti-refresh" style={{ color: 'var(--os-warn)', fontSize: 14 }} />
                <strong style={{ fontSize: 12.5, color: 'var(--os-text)' }}>They updated their own details</strong>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--os-text-faint)' }}>{fmtTs(recentUpdate.ts)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--os-text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {recentUpdate.text.replace(ONBOARDING_UPDATE_MARKER, '').trim()}
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = [...dismissed, recentUpdate.id].slice(-200)
                  setDismissed(next)
                  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)) } catch { /* a notice is not worth an error */ }
                }}
                style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--os-accent)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
              >Got it</button>
            </div>
          )}

          <QuickActions deal={actionTarget} onLog={deal ? addActivity : undefined} />

          {settled && biz.error && (
            <div className="os-crm-notice" data-tone="bad" style={{ fontSize: 12.5, color: 'var(--os-text-muted)' }}>
              Their onboarding answers could not be loaded. This is not the same as them having answered nothing.
            </div>
          )}
          {settled && !biz.error && bizFacts > 0 && (
            <div className="os-crm-section">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div className="os-crm-section-title" style={{ marginBottom: 0 }}>Their business</div>
                <span style={{ fontSize: 11, color: 'var(--os-text-faint)' }}>
                  {b?.onboarded_at ? `Onboarded ${new Date(b.onboarded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'From their onboarding'}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <Fact label="Business" value={b?.business_name || b?.company} />
                <Fact label="Their role" value={b?.role} />
                <Fact label="Niche" value={b?.niche} />
                <Fact label="What they sell" value={b?.offer_summary} />
                <Fact label="Revenue" value={b?.revenue_band} />
                <Fact label="Customers" value={b?.reported_customers} />
                <Fact label="Where" value={[b?.location, b?.address, b?.country].filter(Boolean).join(' · ')} />
                <Fact label="Website" value={b?.website} href={asUrl(b?.website)} />
                <Fact label="Instagram" value={b?.instagram} href={asUrl(b?.instagram)} />
                <Fact label="Facebook" value={b?.facebook_url} href={asUrl(b?.facebook_url)} />
                <Fact label="LinkedIn" value={b?.linkedin_url} href={asUrl(b?.linkedin_url)} />
                <Fact label="TikTok" value={b?.tiktok_url} href={asUrl(b?.tiktok_url)} />
                <Fact label="YouTube" value={b?.youtube_url} href={asUrl(b?.youtube_url)} />
                <Fact label="Other links" value={b?.other_links} />
              </div>
            </div>
          )}

          {deal ? (
            <CrmDetail deal={deal} layout="drawer" onPatch={patchDeal} onAddActivity={addActivity} />
          ) : (
            <>
              {!writer && (
                <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', background: 'var(--os-line)', borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
                  This person is only on a proposal or an invoice, so there is no contact record to edit yet. Add them to the pipeline below to start one.
                </div>
              )}
              <div className="os-crm-section">
                <div className="os-crm-section-title">Contact</div>
                {field('Email', 'email', 'email', 'name@company.com')}
                {field('Phone', 'phone', 'tel', '+297 ...')}
                {field('Company', 'company', 'text', 'Company name')}
                {(resolved.lead || (onSaveField && form.status)) && (
                  <div className="os-crm-field">
                    <label>Status</label>
                    <select
                      className="os-crm-input"
                      value={(form.status as string) ?? 'new'}
                      onChange={e => {
                        const next = e.target.value

                        setField('status', next)
                        saveField('status', next)
                      }}
                    >
                      {CONTACT_STATUSES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {resolved.lead && (
                <div className="os-crm-section">
                  <div className="os-crm-section-title">Log a touch</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {([
                      { t: 'call' as const, label: 'Called', icon: 'ti-phone' },
                      { t: 'email' as const, label: 'Emailed', icon: 'ti-mail' },
                      { t: 'whatsapp' as const, label: 'WhatsApp', icon: 'ti-brand-whatsapp' },
                      { t: 'meeting' as const, label: 'Met', icon: 'ti-users' },
                    ]).map(o => (
                      <button key={o.t} type="button" className="os-btn os-btn-ghost os-btn-sm"
                        onClick={() => { logLeadActivity(resolved.lead!.id, o.t, o.label); notify(); setVersion(v => v + 1) }}>
                        <i className={`ti ${o.icon}`} /> {o.label}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={e => {
                    e.preventDefault()
                    const el = (e.currentTarget.elements.namedItem('note') as HTMLInputElement)
                    const text = el.value.trim()
                    if (!text) return
                    logLeadActivity(resolved.lead!.id, 'note', text)
                    el.value = ''
                    notify(); setVersion(v => v + 1)
                  }} style={{ display: 'flex', gap: 6 }}>
                    <input name="note" className="os-crm-input" placeholder="Add a note…" style={{ flex: 1 }} />
                    <button type="submit" className="os-btn os-btn-sm">Add</button>
                  </form>

                  {(resolved.lead.activity?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {resolved.lead.activity!.slice(0, 8).map(a => (
                        <div key={a.id} style={{ display: 'flex', gap: 9, padding: '6px 0', borderBottom: '1px solid var(--os-line)' }}>
                          <i className={`ti ${ACTIVITY_ICON[a.type] ?? 'ti-point'}`} style={{ fontSize: 13, color: 'var(--os-text-faint)', marginTop: 2 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, color: 'var(--os-text)', whiteSpace: 'pre-wrap' }}>{a.text}</div>
                            <div style={{ fontSize: 11, color: 'var(--os-text-faint)' }}>{fmtTs(a.ts)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {person && <RelationshipTimeline person={person} onAddToPipeline={addToPipeline} compact limit={8} />}

              {(contact.tags?.length ?? 0) > 0 && (
                <div className="os-crm-section">
                  <div className="os-crm-section-title">Segments</div>
                  <div className="os-crm-tags">
                    {contact.tags!.map(t => <span key={t} className="os-tag-chip active" title={t}>{t}</span>)}
                  </div>
                </div>
              )}

              <div className="os-crm-section">
                <div className="os-crm-section-title">Notes</div>
                <div className="os-crm-field">
                  <textarea className="os-crm-textarea" placeholder="Anything worth remembering about this contact" disabled={!writer}
                    value={form.notes ?? ''}
                    onChange={e => setField('notes', e.target.value)} onBlur={() => saveField('notes')} />
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--os-text-faint)', padding: '4px 2px' }}>
                Added {form.createdAt ? new Date(form.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
