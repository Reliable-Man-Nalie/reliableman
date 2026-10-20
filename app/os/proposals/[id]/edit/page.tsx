'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { getProposals, updateProposal, getInvoices, createInvoiceFromProposal, createPhaseInvoice, nextUnbilledPhase, createCommissionInvoice } from '@/lib/crm-store'
import { isResultsBased, resultsCap, resultsMaxClients, clientsInvoiced } from '@/lib/results-billing'
import type { PaymentMilestone, Currency, Proposal, Invoice } from '@/lib/crm-types'
import { LifecycleFlow, type LifecycleStep } from '@/components/LifecycleFlow'
import { TEMPLATES, templateFields, matchTemplate, type Template } from '@/lib/proposal-templates'
import { currencyOptions } from '@/lib/fx'

const SERVICES_PRESETS = [
  'Full website redesign and development',
  'AI automation and workflow setup',
  'SEO strategy and implementation',
  'Meta / Google advertising setup',
  'Content strategy and creation framework',
  'Email marketing system setup',
  'Social media strategy',
  'CRM setup and onboarding',
  'Monthly strategy calls',
  'Direct support throughout the program',
]

export default function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)

  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientCompany, setClientCompany] = useState('')
  const [title, setTitle] = useState('')
  const [intro, setIntro] = useState('')
  const [services, setServices] = useState<string[]>([])
  const [customService, setCustomService] = useState('')
  const [deliverables, setDeliverables] = useState<string[]>([''])
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([{ label: '', amount: 0, note: '' }])
  const [currency, setCurrency] = useState<Currency>('USD')
  const [validDays, setValidDays] = useState(14)
  const [billingDay, setBillingDay] = useState<1 | 15>(1)
  const [paymentLink, setPaymentLink] = useState('')
  const [bankInfo, setBankInfo] = useState('')
  const [rebuildId, setRebuildId] = useState('')
  const [rebuilt, setRebuilt] = useState(false)

  useEffect(() => {

    const p = getProposals().find(p => p.id === id)
    if (!p) { router.push('/os/proposals'); return }
    setProposal(p)
    setInvoice(getInvoices().find(i => i.proposalId === id && (i.phaseIndex ?? 0) === 0) ?? null)
    setClientName(p.clientName)
    setClientEmail(p.clientEmail)
    setClientCompany(p.clientCompany ?? '')
    setTitle(p.title)
    setIntro(p.intro)
    setServices(p.services)
    setDeliverables(p.deliverables.length ? p.deliverables : [''])
    setMilestones(p.paymentSchedule.length ? p.paymentSchedule : [{ label: '', amount: 0, note: '' }])
    setCurrency(p.currency)
    setValidDays(p.validDays)
    setBillingDay(p.billingDay ?? 1)
    setPaymentLink(p.paymentLink ?? '')
    setBankInfo(p.bankInfo ?? '')
    setRebuildId(matchTemplate(p)?.id ?? '')
  }, [id, router])

  const resultsTotal = isResultsBased({ paymentSchedule: milestones })
    ? resultsCap(milestones.map(m => ({ ...m, amount: Number(m.amount) || 0 })))
    : null
  const total = resultsTotal === null
    ? milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0)
    : Number.isFinite(resultsTotal) ? resultsTotal : 0
  const noCap = resultsTotal !== null && !Number.isFinite(resultsTotal)
  const [newClients, setNewClients] = useState('')
  const [period, setPeriod] = useState('')
  const [commissionMsg, setCommissionMsg] = useState('')

  function rebuildFromTemplate(t: Template) {
    const f = templateFields(t, clientName, clientCompany || undefined)
    setTitle(f.title)
    setIntro(f.intro)
    setServices(f.services)
    setDeliverables(f.deliverables)
    setMilestones(f.milestones)
    setCurrency(f.currency)
    setValidDays(f.validDays)
    setRebuilt(true)
  }

  function toggleService(s: string) {
    setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function addCustomService() {
    if (customService.trim()) {
      setServices(prev => [...prev, customService.trim()])
      setCustomService('')
    }
  }

  function updateMilestone(i: number, patch: Partial<PaymentMilestone>) {
    setMilestones(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
  }

  function addMilestone() { setMilestones(prev => [...prev, { label: '', amount: 0, note: '' }]) }
  function removeMilestone(i: number) { setMilestones(prev => prev.filter((_, idx) => idx !== i)) }
  function updateDeliverable(i: number, val: string) { setDeliverables(prev => prev.map((d, idx) => idx === i ? val : d)) }
  function addDeliverable() { setDeliverables(prev => [...prev, '']) }
  function removeDeliverable(i: number) { setDeliverables(prev => prev.filter((_, idx) => idx !== i)) }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    updateProposal(id, isLocked ? {
      clientName,
      clientEmail,
      clientCompany,
      paymentLink,
      bankInfo,
      billingDay,
    } : {
      clientName,
      clientEmail,
      clientCompany,
      title,
      intro,
      services,
      deliverables: deliverables.filter(Boolean),
      paymentSchedule: milestones.map(m => ({ ...m, amount: Number(m.amount) })),
      total,
      currency,
      validDays,
      billingDay,
      paymentLink,
      bankInfo,
    })
    router.push('/os/proposals')
  }

  if (!proposal) return null

  const isLocked = proposal.status === 'signed'

  const lifecycleSteps: LifecycleStep[] = [
    { key: 'sent', label: 'Proposal Sent', icon: 'ti-send', at: proposal.sentAt },
    { key: 'viewed', label: 'Viewed by Client', icon: 'ti-eye', at: proposal.viewedAt },
    { key: 'signed', label: 'Signed', icon: 'ti-writing-sign', at: proposal.signedAt },
    { key: 'invoiced', label: 'Invoice Created', icon: 'ti-receipt', at: invoice?.createdAt },
    { key: 'inv-viewed', label: 'Invoice Viewed', icon: 'ti-eye', at: invoice?.viewedAt },
    { key: 'paid', label: 'Paid', icon: 'ti-cash', at: invoice?.status === 'paid' ? (invoice.paidAt ?? invoice.createdAt) : undefined },
  ]

  const nextPhase = nextUnbilledPhase(proposal)
  const results = isResultsBased(proposal)
  const resultsDone = results ? clientsInvoiced(proposal.id, getInvoices()) : 0
  const resultsMax = results ? resultsMaxClients(proposal.paymentSchedule) : 0

  function invoiceCommission() {
    if (!proposal) return
    const n = Math.floor(Number(newClients))
    if (!(n >= 1)) { setCommissionMsg('Type how many new clients came in.'); return }
    const { invoice: inv, billed, beyondCap } = createCommissionInvoice(proposal, n, period)
    if (!inv) { setCommissionMsg(`All ${resultsMax} clients are already invoiced. The commission has ended.`); return }
    if (beyondCap > 0) setCommissionMsg(`${billed} billed. ${beyondCap} more fall past client ${resultsMax}, where the commission ends.`)
    router.push(`/os/invoices/${inv.id}`)
  }

  return (
    <div className="os-doc-editor">
      <div className="os-page-header">
        <div>
          <div className="os-page-title">
            Edit Proposal
            {(proposal.version ?? 1) > 1 && (
              <span style={{ marginLeft: 10, background: '#7b2fff', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: 0.5 }}>
                v{proposal.version}
              </span>
            )}
          </div>
          <div className="os-page-sub">{proposal.ref} · {proposal.clientName}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {isLocked && (
            <div style={{ background: 'var(--os-good-soft)', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--os-good)', fontWeight: 600 }}>
              <i className="ti ti-lock" /> Signed. Only the contact and payment details save from here; the price, scope and schedule are locked. Use Revise to change the terms.
            </div>
          )}
          {!results && <button
            type="button"
            onClick={() => { const inv = invoice ?? createInvoiceFromProposal(proposal); router.push(`/os/invoices/${inv.id}`) }}
            className="os-btn os-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-receipt" /> {invoice ? 'Open invoice' : 'Create invoice from proposal'}
          </button>}
          {proposal.status === 'signed' && nextPhase > 0 && (
            <button
              type="button"
              onClick={() => { const inv = createPhaseInvoice(proposal, nextPhase); if (inv) router.push(`/os/invoices/${inv.id}`) }}
              className="os-btn os-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <i className="ti ti-receipt" /> Invoice payment {nextPhase + 1}: {proposal.paymentSchedule[nextPhase].label} ({new Intl.NumberFormat('en-US', { style: 'currency', currency: proposal.currency }).format(proposal.paymentSchedule[nextPhase].amount)})
            </button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <LifecycleFlow steps={lifecycleSteps} />
      </div>

      {results && (
        <div className="os-card" style={{ padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--os-text-primary)' }}>Paid by results</div>
            <div style={{ fontSize: 13, color: 'var(--os-text-muted)' }}>{Number.isFinite(resultsMax) ? `${resultsDone} of ${resultsMax} clients invoiced` : `${resultsDone} clients invoiced, no maximum`}</div>
          </div>
          {isLocked ? (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--os-text-muted)' }}>
                  New clients
                  <input className="os-input" type="number" min={1} inputMode="numeric" value={newClients}
                    onChange={e => { setNewClients(e.target.value); setCommissionMsg('') }} style={{ width: 120 }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--os-text-muted)', flex: 1, minWidth: 160 }}>
                  Period (optional, shown on the invoice)
                  <input className="os-input" value={period} placeholder="octubre 2026" onChange={e => setPeriod(e.target.value)} />
                </label>
                <button type="button" className="os-btn os-btn-primary" onClick={invoiceCommission} disabled={resultsDone >= resultsMax}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-receipt" /> Invoice new clients
                </button>
              </div>
              <div style={{ fontSize: 12.5, color: commissionMsg ? 'var(--os-warn)' : 'var(--os-text-muted)', marginTop: 8 }}>
                {commissionMsg || 'Creates a draft invoice. Nothing is sent until you press Send on it.'}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--os-text-muted)' }}>
              Nothing is billed when this is signed. After signing, a box here raises the commission invoice for each month&apos;s new clients.
            </div>
          )}
        </div>
      )}

      {!isLocked && (
        <div className="os-card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <i className="ti ti-refresh" style={{ color: 'var(--os-accent)', fontSize: 18 }} />
          <div style={{ fontSize: 13, color: 'var(--os-text-muted)', flex: 1, minWidth: 220 }}>
            {rebuilt
              ? <span style={{ color: 'var(--os-good)', fontWeight: 600 }}>Rewritten from the template. Read it through, then Save to keep it.</span>
              : <>A revision copies the old wording. Pull in the current terms from a template instead.</>}
          </div>
          <select className="os-input" value={rebuildId} onChange={e => setRebuildId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
            <option value="">Choose a template…</option>
            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            type="button"
            className="os-btn"
            disabled={!rebuildId}
            onClick={() => { const t = TEMPLATES.find(t => t.id === rebuildId); if (t) rebuildFromTemplate(t) }}
          >
            Rebuild content
          </button>
        </div>
      )}

      <form className="os-form" onSubmit={submit}>
        <div className="os-card" style={{ padding: 24 }}>
          <div className="os-section-divider" style={{ marginBottom: 20 }}>Client Information</div>
          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">Client Name *</label>
              <input className="os-input" required value={clientName} onChange={e => setClientName(e.target.value)} />
            </div>
            <div className="os-form-group">
              <label className="os-label">Email *</label>
              <input className="os-input" type="email" required value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
            </div>
          </div>
          <div className="os-form-group" style={{ marginTop: 16 }}>
            <label className="os-label">Company</label>
            <input className="os-input" value={clientCompany} onChange={e => setClientCompany(e.target.value)} />
          </div>
        </div>

        <div className="os-card" style={{ padding: 24 }}>
          <div className="os-section-divider" style={{ marginBottom: 20 }}>Proposal Content</div>
          <div className="os-form-group">
            <label className="os-label">Proposal Title *</label>
            <input className="os-input" required value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="os-form-group" style={{ marginTop: 16 }}>
            <label className="os-label">Opening Message</label>
            <textarea className="os-textarea" value={intro} onChange={e => setIntro(e.target.value)} style={{ minHeight: 140 }} />
          </div>
        </div>

        <div className="os-card" style={{ padding: 24 }}>
          <div className="os-section-divider" style={{ marginBottom: 20 }}>Services Included</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {SERVICES_PRESETS.map(s => (
              <button key={s} type="button" onClick={() => toggleService(s)}
                style={{ padding: '7px 14px', borderRadius: 20, border: '1.5px solid', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', transition: 'all .15s', borderColor: services.includes(s) ? 'var(--accent)' : 'var(--os-line)', background: services.includes(s) ? 'rgba(123,47,255,0.1)' : 'var(--os-card)', color: services.includes(s) ? 'var(--accent)' : 'var(--os-text-muted)' }}>
                {s}
              </button>
            ))}
            {services.filter(s => !SERVICES_PRESETS.includes(s)).map(s => (
              <button key={s} type="button" onClick={() => toggleService(s)}
                style={{ padding: '7px 14px', borderRadius: 20, border: '1.5px solid', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', borderColor: 'var(--accent)', background: 'rgba(123,47,255,0.1)', color: 'var(--accent)' }}>
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="os-input" value={customService} onChange={e => setCustomService(e.target.value)} placeholder="Add custom service..." onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomService() } }} />
            <button type="button" className="os-btn os-btn-ghost" onClick={addCustomService}><i className="ti ti-plus" /></button>
          </div>
        </div>

        <div className="os-card" style={{ padding: 24 }}>
          <div className="os-section-divider" style={{ marginBottom: 20 }}>What They Walk Away With</div>
          <div className="os-milestones">
            {deliverables.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input className="os-input" value={d} onChange={e => updateDeliverable(i, e.target.value)} placeholder={`Deliverable ${i + 1}`} />
                {deliverables.length > 1 && (
                  <button type="button" className="os-remove-btn" onClick={() => removeDeliverable(i)}><i className="ti ti-x" /></button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="os-add-btn" style={{ marginTop: 10 }} onClick={addDeliverable}>
            <i className="ti ti-plus" /> Add Deliverable
          </button>
        </div>

        <div className="os-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div className="os-section-divider" style={{ borderBottom: 'none', marginBottom: 0 }}>Payment Schedule</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select className="os-select" value={currency} onChange={e => setCurrency(e.target.value as Currency)} style={{ width: 'auto', padding: '7px 12px' }}>
                {currencyOptions(currency).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>{noCap ? 'Per client, no maximum' : `${currency} ${total.toLocaleString()}`}</div>
            </div>
          </div>
          <div className="os-milestones">
            {milestones.map((m, i) => (
              <div key={i} style={{ background: 'var(--os-card-alt)', border: '1px solid var(--os-line)', borderRadius: 12, padding: '14px 16px' }}>
                <div className="os-milestone-row" style={{ marginBottom: 8 }}>
                  <div>
                    <label className="os-label" style={{ marginBottom: 4 }}>Label</label>
                    <input className="os-input" value={m.label} onChange={e => updateMilestone(i, { label: e.target.value })} placeholder={`Month ${i + 1}`} />
                  </div>
                  <div>
                    <label className="os-label" style={{ marginBottom: 4 }}>Amount ({currency})</label>
                    <input className="os-input" type="number" value={m.amount || ''} onChange={e => updateMilestone(i, { amount: Number(e.target.value) })} />
                  </div>
                  <button type="button" className="os-remove-btn" onClick={() => removeMilestone(i)} style={{ marginTop: 22 }}>
                    <i className="ti ti-x" />
                  </button>
                </div>
                <div>
                  <label className="os-label" style={{ marginBottom: 4 }}>Note (optional)</label>
                  <input className="os-input" value={m.note ?? ''} onChange={e => updateMilestone(i, { note: e.target.value })} placeholder="What happens in this phase..." />
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="os-add-btn" style={{ marginTop: 10 }} onClick={addMilestone}>
            <i className="ti ti-plus" /> Add Payment
          </button>
        </div>

        <div className="os-card" style={{ padding: 24 }}>
          <div className="os-section-divider" style={{ marginBottom: 20 }}>Payment Details</div>
          <div className="os-form-group">
            <label className="os-label">Payment Link (optional)</label>
            <input className="os-input" value={paymentLink} onChange={e => setPaymentLink(e.target.value)} placeholder="https://payment.link/your-link" />
          </div>
          <div className="os-form-group" style={{ marginTop: 16 }}>
            <label className="os-label">Bank Transfer Information</label>
            <textarea className="os-textarea" value={bankInfo} onChange={e => setBankInfo(e.target.value)} style={{ minHeight: 90, fontFamily: 'monospace', fontSize: 13 }} />
          </div>
          <div className="os-form-group" style={{ marginTop: 16 }}>
            <label className="os-label">Valid for (days)</label>
            <input className="os-input" type="number" value={validDays} onChange={e => setValidDays(Number(e.target.value))} style={{ maxWidth: 120 }} />
          </div>
          <div className="os-form-group" style={{ marginTop: 16 }}>
            <label className="os-label">Monthly billing date</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {([1, 15] as const).map(day => (
                <button key={day} type="button" onClick={() => setBillingDay(day)}
                  style={{ padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: billingDay === day ? 'var(--accent)' : 'var(--os-card)', color: billingDay === day ? '#fff' : 'var(--os-text-faint)', border: `1px solid ${billingDay === day ? 'var(--accent)' : 'var(--os-line)'}` }}>
                  {day === 1 ? '1st of the month' : '15th of the month'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="os-doc-savebar" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingBottom: 40 }}>
          <button type="button" className="os-btn os-btn-ghost" onClick={() => router.back()}>Cancel</button>
          <button type="submit" className="os-btn os-btn-primary" disabled={saving}>
            <i className="ti ti-device-floppy" /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
