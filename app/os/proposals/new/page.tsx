'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getLeads, saveLead, updateLead, saveProposal, getOffers, seedDefaultOffers } from '@/lib/crm-store'
import { getPeople } from '@/lib/people'
import { getAttendees } from '@/lib/event-store'
import { getClientRecords } from '@/lib/client-store'
import type { PaymentMilestone, Currency, Offer, OfferCategory } from '@/lib/crm-types'

import { BANK_INFO, TEMPLATES, templateFields, type Template } from '@/lib/proposal-templates'
import { currencyOptions } from '@/lib/fx'
import { EmailText } from '@/components/os/CopyEmail'

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SOURCE_BADGE: Record<'deal' | 'client' | 'lead' | 'attendee', { label: string; color: string; bg: string }> = {
  client:   { label: 'client',   color: 'var(--os-good)',       bg: 'var(--os-good-soft)' },
  deal:     { label: 'deal',     color: 'var(--os-accent)',     bg: 'var(--os-chip)' },
  lead:     { label: 'lead',     color: 'var(--os-warn)',       bg: 'var(--os-warn-soft)' },
  attendee: { label: 'contact',  color: 'var(--os-text-faint)', bg: 'var(--os-line)' },
}

type ContactOption = {
  name: string
  email: string
  company: string
  phone?: string
  address?: string
  source: 'deal' | 'client' | 'lead' | 'attendee'
}

function useContacts(): ContactOption[] {

  return useMemo(() => getPeople().map(p => ({
    name: p.name, email: p.email, company: p.company, phone: p.phone, address: p.address,
    source: p.stage === 'client' ? 'client' : p.stage === 'lead' ? (p.dealId ? 'deal' : 'lead') : 'attendee',
  })), [])
}

type OfferCategoryFilter = 'all' | OfferCategory

export default function NewProposalPage() {
  const router = useRouter()
  const contacts = useContacts()

  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [search, setSearch]       = useState('')
  const [contact, setContact]     = useState<ContactOption | null>(null)
  const [manualName, setManualName]     = useState('')
  const [manualEmail, setManualEmail]   = useState('')
  const [manualCompany, setManualCompany] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [template, setTemplate]   = useState<Template | null>(null)
  const [selectedOfferId, setSelectedOfferId] = useState<string | undefined>(undefined)

  const [offers, setOffers]       = useState<Offer[]>([])
  const [offerFilter, setOfferFilter] = useState<OfferCategoryFilter>('all')

  const [title, setTitle]         = useState('')
  const [intro, setIntro]         = useState('')
  const [services, setServices]   = useState<string[]>([])
  const [deliverables, setDeliverables] = useState<string[]>([''])
  const [milestones, setMilestones]     = useState<PaymentMilestone[]>([{ label: '', amount: 0 }])
  const [currency, setCurrency]   = useState<Currency>('USD')

  const [oneTime, setOneTime] = useState(false)

  const [payMethods, setPayMethods] = useState<string[]>(['bank', 'card'])
  const [validDays, setValidDays] = useState(14)
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    seedDefaultOffers()
    setOffers(getOffers().filter(o => o.active))
  }, [])

  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || contacts.length === 0) return
    const q = new URLSearchParams(window.location.search)
    const email = (q.get('email') ?? '').trim()
    const name = (q.get('name') ?? '').trim()
    const company = (q.get('company') ?? '').trim()
    if (!email && !name) return
    prefilled.current = true
    const match = email
      ? contacts.find(c => c.email.trim().toLowerCase() === email.toLowerCase())
      : undefined
    if (match) { pickContact(match); return }

    if (name) setManualName(name)
    if (email) setManualEmail(email)
    if (company) setManualCompany(company)
    setStep(2)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts])

  const clientName    = contact?.name    ?? manualName
  const clientEmail   = contact?.email   ?? manualEmail
  const clientCompany = contact?.company ?? manualCompany

  const clientPhone   = contact?.phone   || manualPhone
  const clientAddress = contact?.address || manualAddress
  const total         = milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0)

  const filtered = contacts.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase())
  )

  const filteredOffers = offerFilter === 'all' ? offers : offers.filter(o => o.category === offerFilter)

  function pickContact(c: ContactOption) {
    setContact(c)
    setManualName(''); setManualEmail(''); setManualCompany('')
    setStep(2)
  }

  function applyTemplateFields(t: Template) {
    const f = templateFields(t, clientName, clientCompany)
    setTitle(f.title)
    setIntro(f.intro)
    setServices(f.services)
    setDeliverables(f.deliverables)
    setMilestones(f.milestones)
    setCurrency(f.currency)
    setOneTime(f.oneTime)
    setValidDays(f.validDays)
  }

  function pickTemplate(t: Template) {
    setTemplate(t)
    setSelectedOfferId(undefined)
    applyTemplateFields(t)
    setStep(3)
  }

  function pickOffer(o: Offer) {
    setSelectedOfferId(o.id)
    setTemplate(null)

    const key = (t: Template) => (t.offerName ?? t.name).toLowerCase()
    const tpl = TEMPLATES.find(t => key(t) === o.name.toLowerCase())
    if (tpl) {
      applyTemplateFields(tpl)
      setStep(3)
      return
    }
    setTitle(o.name + (clientCompany ? ` for ${clientCompany}` : ''))
    setIntro(`${clientName}, here is the proposal for ${o.name}.\n\n${o.tagline}`)
    setServices([...o.services])
    setDeliverables(o.deliverables.length ? [...o.deliverables] : [''])

    setMilestones(o.paymentSchedule.length ? [...o.paymentSchedule]
      : o.price > 0 ? [{ label: o.billingType === 'monthly' ? 'Month 1' : 'Paid in full on signing', amount: o.price }]
      : [{ label: '', amount: 0 }])
    setCurrency(o.currency)
    setValidDays(14)
    setStep(3)
  }

  function submit() {
    setSaving(true)

    const email = clientEmail.trim()
    if (email) {
      const existing = getLeads().find(l => (l.email ?? '').trim().toLowerCase() === email.toLowerCase())
      if (existing) {
        updateLead(existing.id, {
          name: existing.name || clientName,
          company: existing.company || clientCompany,
        })
      } else {
        saveLead({
          name: clientName || email,
          email,
          company: clientCompany,
          source: 'proposal',
          status: 'qualified',
          notes: `Added automatically when the proposal "${title}" was created.`,
        })
      }
    }

    saveProposal({
      clientName, clientEmail, clientCompany, clientPhone, clientAddress,
      title, intro, services,
      deliverables: deliverables.filter(Boolean),
      paymentSchedule: milestones.map(m => ({ ...m, amount: Number(m.amount) })),
      total, currency, validDays, billingDay: 1,
      oneTime,
      paymentMethods: payMethods,
      status: 'draft', paymentLink: '', bankInfo: BANK_INFO,
      offerId: selectedOfferId,
    })
    router.push('/os/proposals')
  }

  const steps = ['Contact', 'Package', 'Review']

  return (
    <div className="os-doc-editor">
      <div className="os-page-header">
        <div>
          <div className="os-page-title">New Proposal</div>
          <div className="os-page-sub">3 steps from contact to ready-to-send</div>
        </div>
        <button className="os-btn os-btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28, maxWidth: 420 }}>
        {steps.map((s, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const done = step > n
          const active = step === n
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: done ? 'pointer' : 'default' }}
                onClick={() => { if (done) setStep(n) }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13, flexShrink: 0,
                  background: done ? 'var(--accent)' : active ? 'var(--os-accent-soft)' : 'var(--os-line)',
                  color: done ? '#fff' : active ? 'var(--accent)' : 'var(--os-text-faint)',
                  border: active ? '2px solid var(--accent)' : '2px solid transparent',
                }}>
                  {done ? <i className="ti ti-check" style={{ fontSize: 13 }} /> : n}
                </div>
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'var(--os-text)' : done ? 'var(--os-text-muted)' : 'var(--os-text-faint)', whiteSpace: 'nowrap' }}>{s}</span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? 'var(--accent)' : 'var(--os-line)', margin: '0 10px', borderRadius: 2 }} />
              )}
            </div>
          )
        })}
      </div>

      {step === 1 && (
        <div className="os-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Who is this proposal for?</div>

          <input className="os-input" placeholder="Search leads and deals..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} autoFocus />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
            {filtered.slice(0, 20).map((c, i) => (
              <button key={i} type="button" onClick={() => pickContact(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--os-card-alt)', border: '1.5px solid var(--os-line)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'border-color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--os-line)')}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--os-text)' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--os-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || c.email}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  color: SOURCE_BADGE[c.source].color,
                  background: SOURCE_BADGE[c.source].bg,
                }}>
                  {SOURCE_BADGE[c.source].label}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <div style={{ color: 'var(--os-text-faint)', fontSize: 13, padding: '12px 0' }}>No matches. Enter details below.</div>}
          </div>

          <div style={{ borderTop: '1px solid var(--os-line)', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--os-text-faint)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Or enter manually</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="os-label">Full name</label>
                <input className="os-input" placeholder="Jane Doe" value={manualName} onChange={e => setManualName(e.target.value)} autoComplete="off" />
              </div>
              <div style={{ flex: '1 1 240px' }}>
                <label className="os-label">
                  Email <span style={{ color: 'var(--os-bad)' }}>*</span>
                  <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--os-text-faint)' }}> — where the proposal is sent</span>
                </label>
                <input
                  className="os-input"
                  type="email"
                  inputMode="email"
                  placeholder="name@company.com"
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  autoComplete="off"
                  style={manualEmail && !EMAIL_OK.test(manualEmail) ? { borderColor: 'var(--os-bad)' } : undefined}
                />
                {manualEmail && !EMAIL_OK.test(manualEmail) && (
                  <div style={{ fontSize: 12, color: 'var(--os-bad)', marginTop: 4 }}>That is not an email address.</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input className="os-input" placeholder="Company (optional)" value={manualCompany} onChange={e => setManualCompany(e.target.value)} style={{ flex: '1 1 160px' }} />
              <input className="os-input" placeholder="Phone (optional)" value={manualPhone} onChange={e => setManualPhone(e.target.value)} style={{ flex: '1 1 160px' }} />
              <input className="os-input" placeholder="Address (optional)" value={manualAddress} onChange={e => setManualAddress(e.target.value)} style={{ flex: '1 1 220px' }} />
            </div>
            {manualName && (
              <button
                type="button"
                className="os-btn os-btn-primary"
                style={{ marginTop: 12 }}
                disabled={!EMAIL_OK.test(manualEmail)}
                title={EMAIL_OK.test(manualEmail) ? undefined : 'Add their email first'}
                onClick={() => { setContact(null); setStep(2) }}
              >
                Continue with {manualName} <i className="ti ti-arrow-right" />
              </button>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--os-text)' }}>
            What are you selling to <span style={{ color: 'var(--accent)' }}>{clientName}</span>?
          </div>

          {offers.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
                {([
                  { key: 'all', label: 'All' },
                  { key: 'programs', label: '🎓 Programs' },
                  { key: 'coaching', label: '🧠 Coaching' },
                  { key: 'communication', label: '🎤 Communication' },
                  { key: 'Partner', label: '🤖 Partner' },
                ] as { key: OfferCategoryFilter; label: string }[]).map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setOfferFilter(f.key)}
                    style={{
                      padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontWeight: 600, fontSize: 12,
                      background: offerFilter === f.key ? 'var(--os-accent-soft)' : 'transparent',
                      color: offerFilter === f.key ? 'var(--os-accent)' : 'var(--os-text-muted)',
                      boxShadow: 'none',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {([
                { key: 'programs', label: 'Online Programs', icon: '🎓', color: 'var(--os-warn)' },
                { key: 'coaching', label: 'Coaching', icon: '🧠', color: 'var(--os-good)' },
                { key: 'communication', label: 'Communication Coaching', icon: '🎤', color: 'var(--os-bad)' },
                { key: 'Partner', label: 'Partner Partnerships', icon: '🤖', color: 'var(--os-text)' },
              ] as { key: OfferCategory; label: string; icon: string; color: string }[])
                .filter(cat => (offerFilter === 'all' || offerFilter === cat.key) && filteredOffers.some(o => o.category === cat.key))
                .map(cat => (
                  <div key={cat.key}>
                    {offerFilter === 'all' && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{cat.label}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
                      {filteredOffers.filter(o => o.category === cat.key).map(o => {
                        const scheduleTotal = o.paymentSchedule.reduce((s, m) => s + m.amount, 0)
                        return (
                          <button key={o.id} type="button" onClick={() => pickOffer(o)}
                            style={{ textAlign: 'left', padding: '18px 20px', background: 'var(--os-card)', border: '2px solid var(--os-line)', borderRadius: 14, cursor: 'pointer', transition: 'all .15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = cat.color; e.currentTarget.style.background = '#faf8ff' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--os-line)'; e.currentTarget.style.background = '#fff' }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: cat.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 10 }}>{cat.icon}</div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--os-text)', marginBottom: 3 }}>{o.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--os-text-faint)', lineHeight: 1.5, marginBottom: 10 }}>{o.tagline}</div>
                            <div style={{ fontWeight: 800, fontSize: 15, color: cat.color }}>
                              {o.currency === 'EUR' ? '\u20ac' : o.currency === 'AWG' ? '\u0192' : '$'}{o.price.toLocaleString()}{o.billingType === 'monthly' ? '/mo' : o.billingType === 'retainer' ? ' retainer' : ''}
                              {scheduleTotal !== o.price && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--os-text-faint)' }}> ({scheduleTotal.toLocaleString()} total)</span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>Or start from a template</div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {TEMPLATES.map(t => (
              <button key={t.id} type="button" onClick={() => pickTemplate(t)}
                style={{ textAlign: 'left', padding: '18px 20px', background: 'var(--os-card)', border: '2px solid var(--os-line)', borderRadius: 14, cursor: 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = '#faf8ff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--os-line)'; e.currentTarget.style.background = '#fff' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: t.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: 18, color: t.color }} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--os-text)', marginBottom: 3 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--os-text-faint)', lineHeight: 1.5 }}>{t.tagline}</div>
                {t.schedule.length > 0 && t.id !== 'custom' && (
                  <div style={{ marginTop: 10, fontWeight: 800, fontSize: 15, color: t.color }}>
                    ${t.schedule.reduce((s, m) => s + m.amount, 0).toLocaleString()}
                    {(t.id === 'growth' || t.id === 'takeover' || t.id === 'ads') && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--os-text-faint)' }}> + retainer</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
          <button type="button" className="os-btn os-btn-ghost" style={{ marginTop: 16 }} onClick={() => setStep(1)}>
            <i className="ti ti-arrow-left" /> Back
          </button>
        </div>
      )}

      {step === 3 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', background: 'var(--os-chip)', borderRadius: 12, marginBottom: 20, border: '1px solid var(--os-line)' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
              {clientName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{clientName}</div>
              <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>{clientCompany} {clientEmail && <>· <EmailText email={clientEmail} /></>}</div>
            </div>
            <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>Change</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="os-card" style={{ padding: 22 }}>
              <div className="os-crm-section-title" style={{ marginBottom: 14 }}>Proposal Copy</div>
              <div className="os-form-group">
                <label className="os-label">Title</label>
                <input className="os-input" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="os-form-group" style={{ marginTop: 14 }}>
                <label className="os-label">Opening message</label>
                <textarea className="os-textarea" value={intro} onChange={e => setIntro(e.target.value)} style={{ minHeight: 110 }} />
              </div>
            </div>

            <div className="os-card" style={{ padding: 22 }}>
              <div className="os-crm-section-title" style={{ marginBottom: 14 }}>Services Included</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {services.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <i className="ti ti-check" style={{ color: 'var(--accent)', marginTop: 10, flexShrink: 0 }} />
                    <input className="os-input" value={s} onChange={e => setServices(prev => prev.map((x, idx) => idx === i ? e.target.value : x))} />
                    <button type="button" onClick={() => setServices(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)', paddingTop: 8 }}><i className="ti ti-x" /></button>
                  </div>
                ))}
              </div>
              <button type="button" className="os-add-btn" style={{ marginTop: 10 }} onClick={() => setServices(prev => [...prev, ''])}>
                <i className="ti ti-plus" /> Add service
              </button>
            </div>

            <div className="os-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="os-crm-section-title" style={{ marginBottom: 0 }}>Payment Schedule</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>
                  {currency} {total.toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {milestones.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--os-card-alt)', border: '1px solid var(--os-line)', borderRadius: 10, padding: '12px 14px' }}>
                    <input className="os-input" value={m.label} onChange={e => setMilestones(prev => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} placeholder="Label" style={{ flex: 2 }} />
                    <input className="os-input" type="number" value={m.amount || ''} onChange={e => setMilestones(prev => prev.map((x, idx) => idx === i ? { ...x, amount: Number(e.target.value) } : x))} placeholder="$" style={{ flex: '0 0 100px' }} />
                    <button type="button" onClick={() => setMilestones(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-text-faint)' }}><i className="ti ti-x" /></button>
                  </div>
                ))}
              </div>
              <button type="button" className="os-add-btn" style={{ marginTop: 10 }} onClick={() => setMilestones(prev => [...prev, { label: '', amount: 0 }])}>
                <i className="ti ti-plus" /> Add payment
              </button>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 7 }}>
                  Payment methods on the invoice
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {([['bank','Bank transfer'],['card','Card (Stripe)']] as const).map(([id, label]) => {
                    const on = payMethods.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPayMethods(on ? payMethods.filter(x => x !== id) : [...payMethods, id])}
                        className={on ? 'os-btn os-btn-primary os-btn-sm' : 'os-btn os-btn-ghost os-btn-sm'}
                      >{on ? '\u2713 ' : ''}{label}</button>
                    )
                  })}
                </div>
                {payMethods.length === 0 && (
                  <div style={{ fontSize: 12.5, color: 'var(--os-bad)', marginTop: 6 }}>
                    Pick at least one, or the invoice tells them nothing about how to pay.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="os-select" value={currency} onChange={e => setCurrency(e.target.value as Currency)} style={{ width: 'auto', padding: '7px 12px' }}>
                  {currencyOptions(currency).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--os-text-faint)' }}>
                  Valid for
                  <input className="os-input" type="number" value={validDays} onChange={e => setValidDays(Number(e.target.value))} style={{ width: 60, textAlign: 'center' }} />
                  days
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', paddingBottom: 40 }}>
              <button type="button" className="os-btn os-btn-ghost" onClick={() => setStep(2)}>
                <i className="ti ti-arrow-left" /> Back
              </button>
              <button type="button" className="os-btn os-btn-primary" disabled={saving || !clientName || !title} onClick={submit}>
                <i className="ti ti-device-floppy" /> {saving ? 'Saving...' : 'Save proposal'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
