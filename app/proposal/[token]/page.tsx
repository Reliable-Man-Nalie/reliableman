'use client'

import { BRAND, CONTACT_URL, documentName } from '@/lib/brand'
import { useEffect, useState, use } from 'react'
import Image from 'next/image'
import { getProposalByToken } from '@/lib/crm-store'
import type { Proposal } from '@/lib/crm-types'
import { isResultsBased, proposalLang, resultsTiers, resultsCap, hasCap } from '@/lib/results-billing'

type Params = { token: string }

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string, es = false) {
  return new Date(iso).toLocaleDateString(es ? 'es-ES' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const SIG_FONT = { fontFamily: '"Snell Roundhand", "Brush Script MT", "Segoe Script", "Apple Chancery", cursive', fontStyle: 'italic' as const }

function ValidityCountdown({ expiresAt, es = false }: { expiresAt: Date; es?: boolean }) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  if (now === null) return null

  const ms = expiresAt.getTime() - now
  const expired = ms <= 0
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)

  const urgent = !expired && ms < 2 * 86400000
  const bg = expired ? '#fdecec' : urgent ? '#fff5e6' : '#f4f0ff'
  const edge = expired ? '#f3c2c2' : urgent ? '#f0d4a0' : '#e0d6fb'
  const ink = expired ? '#8a1f1f' : urgent ? '#7a4a00' : '#3c2a6b'

  return (
    <div style={{ background: bg, border: `1px solid ${edge}`, borderRadius: 10, padding: '13px 18px', margin: '0 0 22px', fontSize: 14.5, lineHeight: 1.6, color: ink }}>
      {expired ? (
        <>{es ? 'Esta propuesta ya pasó su fecha de validez y no se puede firmar. Si ahora es buen momento, escríbeme.' : 'This proposal has passed its validity date and can no longer be signed. If the timing is right for you now, just get in touch.'}</>
      ) : (
        <>{es ? 'Válida hasta el' : 'Valid until'} {expiresAt.toLocaleDateString(es ? 'es-ES' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.</>
      )}
    </div>
  )
}

export default function ProposalPage({ params }: { params: Promise<Params> }) {
  const { token } = use(params)
  const [proposal, setProposal] = useState<Proposal | null | 'loading'>('loading')
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [step, setStep] = useState<'view' | 'signed'>('view')
  const [signedAt, setSignedAt] = useState<string | null>(null)
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [pdfParams] = useState(() => {
    if (typeof window === 'undefined') return { isPdf: false, signed: false, signer: '', date: '' }
    const sp = new URLSearchParams(window.location.search)
    return {
      isPdf: sp.get('pdf') === '1',
      signed: sp.get('signed') === '1',
      signer: sp.get('signer') ?? '',
      date: sp.get('date') ?? '',
    }
  })

  useEffect(() => {
    let cancelled = false
    const apply = (p: Proposal | null) => {
      if (cancelled) return
      setProposal(p)
      if (p?.status === 'signed') {
        setStep('signed')
        setSignerName(p.signerName ?? '')
        setSignedAt(p.signedAt ? new Date(p.signedAt).toLocaleString('en-US', {
          timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) + ' (UTC)' : null)
        setLinkedInvoiceId(p.linkedInvoiceId ?? null)
      }
    }

    const local = getProposalByToken(token)
    if (local) { apply(local); return }
    fetch(`/api/public-proposal?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => apply(d.proposal ?? null))
      .catch(() => apply(null))
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (pdfParams.isPdf) return
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1') return
    fetch('/api/track-view', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'proposal', token }),
    }).catch(() => { /* best-effort */ })
  }, [token, pdfParams.isPdf])

  useEffect(() => {
    if (pdfParams.isPdf && proposal !== 'loading') {
      ;(window as unknown as { bosPdfReady?: boolean }).bosPdfReady = true
    }
  }, [pdfParams.isPdf, proposal])

  async function handleSign() {
    if (!proposal || proposal === 'loading') return
    if (!signerName.trim() || !signerEmail.trim()) {
      setError(proposal && proposalLang(proposal) === 'es' ? 'Escribe tu nombre completo y tu email antes de firmar.' : 'Please enter your full name and email before signing.')
      return
    }
    setSubmitting(true)
    setError('')
    const now = new Date()
    const signedAtStr = now.toLocaleString('en-US', {
      timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) + ' (UTC)'

    try {

      const res = await fetch('/api/sign-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: proposal.token,
          signerName: signerName.trim(), signerEmail: signerEmail.trim(),
        }),
      })
      if (!res.ok) throw new Error('sign failed')
      const data = await res.json().catch(() => ({}))
      if (data?.invoiceId) setLinkedInvoiceId(data.invoiceId)
      setSignedAt(signedAtStr)
      setStep('signed')
    } catch {
      setError(proposal && proposalLang(proposal) === 'es' ? `Algo salió mal. Inténtalo de nuevo o escríbele a ${BRAND.owner} directamente.` : `Something went wrong. Please try again or message ${BRAND.owner} directly.`)
    } finally {
      setSubmitting(false)
    }
  }

  if (proposal === 'loading') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eeecec', fontFamily: 'Inter, sans-serif', color: '#aaa' }}>Loading…</div>
  }
  if (!proposal) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#eeecec', fontFamily: 'Inter, sans-serif', gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Document not found</div>
        <div style={{ color: '#aaa', fontSize: 14 }}>This link may be invalid or expired.</div>
        <a href={CONTACT_URL} style={{ marginTop: 12, padding: '10px 22px', background: '#25D366', color: '#fff', borderRadius: 100, fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>Message {BRAND.owner}</a>
      </div>
    )
  }

  const expiresAt = new Date(new Date(proposal.sentAt || proposal.createdAt).getTime() + proposal.validDays * 86400000)

  const isPdf = pdfParams.isPdf
  const showSigned = step === 'signed' || (isPdf && pdfParams.signed)
  const displaySigner = signerName || proposal.signerName || pdfParams.signer
  const displayDate = signedAt || pdfParams.date
  const pdfDownloadHref = `/api/proposal-pdf?token=${encodeURIComponent(proposal.token)}`
  const signedPdfHref = `${pdfDownloadHref}&signed=1&signer=${encodeURIComponent(displaySigner || proposal.clientName)}&date=${encodeURIComponent(displayDate || '')}`

  const schedule = proposal.paymentSchedule ?? []
  const monthlyAmount = schedule[0]?.amount ?? proposal.total

  const looksMonthly = schedule.length > 0
    && schedule.every(m => /^\s*month\s*\d/i.test(m.label ?? ''))

  const isFlatRetainer = looksMonthly
    && (schedule.length <= 1 || schedule.every(m => m.amount === monthlyAmount))

  const isRecurring = proposal.oneTime !== true
    && looksMonthly
    && schedule.length > 1
    && schedule.every(m => m.amount === monthlyAmount)

  const isSinglePayment = schedule.length <= 1

  const results = isResultsBased(proposal)
  const es = proposalLang(proposal) === 'es'
  const tiers = resultsTiers(schedule)
  const cap = resultsCap(schedule)
  const capped = hasCap(schedule)
  const flatFee = tiers[0]?.price ?? 0
  const L = (en: string, sp: string) => (es ? sp : en)
  const priceLabel = results
    ? capped
      ? L(`Nothing upfront · paid by results · up to ${fmt(cap, proposal.currency)}`, `Nada por adelantado · pago por resultados · máximo ${fmt(cap, proposal.currency)}`)
      : L(`Nothing upfront · ${fmt(flatFee, proposal.currency)} per new paying client`, `Nada por adelantado · ${fmt(flatFee, proposal.currency)} por cliente nuevo que pague`)
    : isRecurring
    ? `${fmt(monthlyAmount, proposal.currency)} per month · ${schedule.length} months`
    : schedule.length > 1
      ? `${fmt(proposal.total, proposal.currency)} one-time fee · ${schedule.length} payments`
      : `${fmt(proposal.total, proposal.currency)} · one payment`

  const introParts = (proposal.intro || '').split(/\n\s*\n/)
  const promise = introParts[0] || ''
  const introRest = introParts.slice(1).join('\n\n')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #eeecec; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }

        .tbl-wrap { overflow-x: auto; }

        /* Mobile: the document is a fixed-width print layout by default; on a
           phone we stack the header, shrink the page padding, and let only the
           investment table scroll inside its own container so the page itself
           never pans sideways. PDF/print rendering is unaffected (wide viewport). */
        @media (max-width: 640px) {
          .sig-grid { grid-template-columns: 1fr !important; }
          .doc-wrap { padding: 16px 8px 40px !important; }
          .doc-pad { padding: 30px 18px 28px !important; }
          /* On a phone the letterhead was pushing the actual offer 563px down,
             so the client's first full screen was address and reference number
             and they had to scroll to find out what they were being offered.
             Compact it: smaller mark, tighter gaps, smaller contact block. */
          .doc-head { flex-direction: column !important; gap: 16px !important; margin-bottom: 22px !important; }
          .doc-from { font-size: 11.5px !important; line-height: 1.55 !important; }
          .doc-ref { font-size: 15px !important; margin-bottom: 10px !important; }
          .doc-head-right .meta-row { font-size: 12.5px !important; }
          .doc-title { font-size: 21px !important; }
          .doc-head-right { text-align: left !important; }
          .doc-head-right .meta-row { justify-content: space-between !important; gap: 12px !important; }
          .doc-head-right .meta-row span:last-child { min-width: 0 !important; }
          .topbar { padding: 11px 14px !important; }
          .topbar-ref { display: none !important; }
          /* The download button matters more on a phone than a decorative
             badge, so the private-link chip yields the space to it. */
          .topbar-private { display: none !important; }
          .inv-table th, .inv-table td { padding: 8px 8px !important; font-size: 11.5px !important; }
          .retainer-box { flex-wrap: wrap !important; padding: 20px 18px !important; }
          .retainer-box .side-note { margin-left: 0 !important; max-width: 100% !important; text-align: left !important; flex-basis: 100% !important; }
          .doc-foot { flex-direction: column-reverse !important; align-items: flex-start !important; gap: 14px !important; }
        }

        @media print {
          @page { size: letter; margin: 0.65in 0.75in; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .doc-page { box-shadow: none !important; max-width: 100% !important; margin: 0 !important; }
          .doc-wrap { background: white !important; padding: 0 !important; }
          .print-break { break-before: page; }
          .sign-section { display: none !important; }
          .signed-block { display: block !important; }
          body { background: white !important; }
        }
      `}} />

      {!isPdf && <div className="topbar" style={{
        background: '#fff', borderBottom: '1px solid #e0ddd8', padding: '11px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, background: '#12002a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Image src="/icon.png" alt="Logo" width={24} height={24} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1a1a2e' }}>{BRAND.name}</span>
          <span className="topbar-ref" style={{ fontSize: 11.5, color: '#bbb', marginLeft: 4 }}>/ Proposal · {proposal.ref}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="topbar-private" style={{ fontSize: 11.5, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 100, padding: '4px 12px', fontWeight: 600 }}>🔒 Private link</span>
          <a
            href={step === 'signed' ? signedPdfHref : pdfDownloadHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px', minHeight: 44,
              background: step === 'signed' ? '#12002a' : '#fff',
              color: step === 'signed' ? '#fff' : '#12002a',
              border: step === 'signed' ? 'none' : '1px solid #d9d2ea',
              borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12.5,
              fontFamily: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span className="topbar-dl-label">{step === 'signed' ? L('Download Signed Copy', 'Descargar copia firmada') : L('Download PDF', 'Descargar PDF')}</span>
          </a>
        </div>
      </div>}

      <div className="doc-wrap" style={{ padding: isPdf ? 0 : '40px 20px 60px', background: isPdf ? '#fff' : undefined }}>
        <div className="doc-page" style={{
          maxWidth: isPdf ? '100%' : 760, margin: '0 auto', background: '#fff',
          boxShadow: isPdf ? 'none' : '0 4px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
        }}>

          <div className="doc-pad" style={{ padding: '52px 60px 40px' }}>

            <div className="doc-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="doc-mark" style={{ width: 40, height: 40, background: '#12002a', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    <Image src="/icon.png" alt={BRAND.name} width={36} height={36} style={{ objectFit: 'contain' }} />
                  </div>
                  <div className="doc-wordmark" style={{ fontWeight: 800, fontSize: 16, color: '#12002a', letterSpacing: '-.01em' }}>{BRAND.name}</div>
                </div>
                <div className="doc-from" style={{ lineHeight: 1.7, fontSize: 12, color: '#666' }}>
                  <div style={{ fontWeight: 600, color: '#444' }}>{documentName()}</div>
                  <div></div>
                  <div>{BRAND.email}</div>
                  <div></div>
                  <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>Tax registration pending</div>
                </div>
              </div>

              <div className="doc-head-right" style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 8 }}>{L('Service Agreement', 'Acuerdo de servicio')}</div>
                <div className="doc-ref" style={{ fontSize: 16, fontWeight: 800, color: '#12002a', marginBottom: 14, lineHeight: 1.2, letterSpacing: '.01em' }}>{proposal.ref}</div>
                <div style={{ fontSize: 12.5, color: '#666', lineHeight: 2.1 }}>
                  <div className="meta-row" style={{ display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
                    <span style={{ color: '#999' }}>{L('Prepared', 'Preparado')}</span>
                    <span style={{ fontWeight: 600, color: '#12002a', minWidth: 140, textAlign: 'right' }}>{fmtDate(proposal.createdAt, es)}</span>
                  </div>
                  <div className="meta-row" style={{ display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
                    <span style={{ color: '#999' }}>{L('Valid until', 'Válido hasta')}</span>
                    <span style={{ fontWeight: 600, color: '#12002a', minWidth: 140, textAlign: 'right' }}>{fmtDate(expiresAt.toISOString(), es)}</span>
                  </div>
                  <div className="meta-row" style={{ display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
                    <span style={{ color: '#999' }}>{L('Prepared for', 'Preparado para')}</span>
                    <span style={{ fontWeight: 700, color: '#12002a', minWidth: 140, textAlign: 'right' }}>{proposal.clientName}</span>
                  </div>
                  {proposal.clientCompany && (
                    <div className="meta-row" style={{ display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
                      <span style={{ color: '#999' }}>Company</span>
                      <span style={{ fontWeight: 500, color: '#333', minWidth: 140, textAlign: 'right' }}>{proposal.clientCompany}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '2px solid #12002a', marginBottom: 32 }} />

            <div style={{ marginBottom: 28 }}>
              <div className="doc-title" style={{ fontSize: 20, fontWeight: 800, color: '#12002a', lineHeight: 1.3, marginBottom: 4 }}>{proposal.title}</div>
              {!showSigned && !isPdf && <div style={{ marginTop: 18 }}><ValidityCountdown expiresAt={expiresAt} es={es} /></div>}
              <div style={{ fontSize: 14, color: '#7c3aed', fontWeight: 600 }}>{priceLabel}</div>
            </div>

            {proposal.intro && (
              <div className="no-break" style={{ marginBottom: 32, paddingBottom: 28, borderBottom: '1px solid #f0eafc' }}>
                {promise && (
                  <p style={{ margin: '0 0 18px', fontSize: 17, lineHeight: 1.62, color: '#12002a', fontWeight: 600, whiteSpace: 'pre-line' }}>
                    {promise}
                  </p>
                )}
                {introRest && (
                  <div style={{ fontSize: 13.5, lineHeight: 1.9, color: '#444' }}>
                    {introRest.split(/\n/).map((line, i) => {
                      const t = line.trim()
                      if (!t) return <div key={i} style={{ height: 10 }} />

                      const isAllCaps = t.replace(/[^A-Za-z]/g, '').length > 2 && t === t.toUpperCase()
                      const isHeading = t.length < 60 && !/[.!?:,;]$/.test(t)
                      if (isHeading || isAllCaps) {
                        const nice = isAllCaps ? t.charAt(0) + t.slice(1).toLowerCase() : t
                        return (
                          <div key={i} style={{ fontWeight: 700, fontSize: 14.5, color: '#1c1133', margin: '20px 0 8px' }}>
                            {nice}
                          </div>
                        )
                      }
                      return <p key={i} style={{ margin: '0 0 12px' }}>{t}</p>
                    })}
                  </div>
                )}
              </div>
            )}

            {proposal.services.length > 0 && (
              <div className="no-break" style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 14 }}>{L('1. Scope of Work', '1. Alcance del trabajo')}</div>
                <p style={{ fontSize: 13.5, color: '#444', lineHeight: 1.8, margin: '0 0 10px' }}>
                  {L('Here is exactly what we work through together for', 'Esto es exactamente lo que trabajamos juntos para')} <strong>{proposal.clientCompany || proposal.clientName}</strong>:
                </p>
                <ul style={{ margin: 0, paddingLeft: 22, fontSize: 13.5, color: '#444', lineHeight: 2 }}>
                  {proposal.services.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="print-break doc-pad" style={{ padding: '52px 60px 40px', borderTop: '8px solid #12002a' }}>

            {proposal.deliverables.length > 0 && (
              <div className="no-break" style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 14 }}>{L('2. Deliverables', '2. Entregables')}</div>
                <p style={{ fontSize: 13.5, color: '#444', lineHeight: 1.8, margin: '0 0 10px' }}>
                  {L('Through this engagement,', 'Con este acuerdo,')} <strong>{proposal.clientCompany || proposal.clientName}</strong> {L('will have:', 'tendrá:')}
                </p>
                <ul style={{ margin: 0, paddingLeft: 22, fontSize: 13.5, color: '#444', lineHeight: 2 }}>
                  {proposal.deliverables.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}

            <div className="no-break" style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 14 }}>{L('3. Investment', '3. Inversión')}</div>
              {results ? (
                <>
                  <p style={{ fontSize: 13.5, color: '#444', lineHeight: 1.8, margin: '0 0 16px' }}>
                    {schedule[0]?.note ? `${schedule[0].note} ` : ''}
                    {capped ? L(
                      `Nothing is paid upfront. Each month you receive one invoice only for the NEW clients that came in that month, at the price of the tier each client falls in. The commission ends after client ${tiers[tiers.length - 1]?.to ?? ''}, so the most it can ever add up to is ${fmt(cap, proposal.currency)}. A month with no new clients costs nothing.`,
                      `No se paga nada por adelantado. Cada mes recibes una sola factura, solo por los clientes NUEVOS que llegaron ese mes, al precio del tramo en el que cae cada cliente. La comisión termina después del cliente ${tiers[tiers.length - 1]?.to ?? ''}, así que el máximo total es ${fmt(cap, proposal.currency)}. Un mes sin clientes nuevos no cuesta nada.`,
                    ) : L(
                      `Nothing is paid upfront. Each month you receive one invoice only for the NEW paying clients of that month, at ${fmt(flatFee, proposal.currency)} each. A month with no new clients costs nothing.`,
                      `No se paga nada por adelantado. Cada mes recibes una sola factura, solo por los clientes NUEVOS que pagaron ese mes, a ${fmt(flatFee, proposal.currency)} cada uno. Un mes sin clientes nuevos no cuesta nada.`,
                    )}
                  </p>
                  <div className="tbl-wrap"><table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
                    <thead>
                      <tr style={{ background: '#12002a' }}>
                        {[L('Clients', 'Clientes'), L('Per new client', 'Por cliente nuevo')].map((h, i) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: '#e8e0f8', letterSpacing: 0.6, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((t, i) => (
                        <tr key={t.phaseIndex} style={{ borderBottom: '1px solid #ede8f8', background: i % 2 === 0 ? '#fff' : '#faf8ff' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, color: '#12002a' }}>{Number.isFinite(t.to) ? L(`Clients ${t.from} to ${t.to}`, `Clientes ${t.from} a ${t.to}`) : L('Each new paying client', 'Cada cliente nuevo que pague')}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13.5, color: '#7c3aed', whiteSpace: 'nowrap' }}>{fmt(t.price, proposal.currency)}
                            {Number.isFinite(t.to) && <div style={{ fontSize: 11, fontWeight: 500, color: '#888' }}>{L('max', 'máx.')} {fmt((t.to - t.from + 1) * t.price, proposal.currency)}</div>}</td>
                        </tr>
                      ))}
                      {capped && <tr style={{ background: '#f5f0ff' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: 13, color: '#12002a' }}>{L('Most it can ever be', 'Máximo posible')}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 14.5, color: '#12002a', whiteSpace: 'nowrap' }}>{fmt(cap, proposal.currency)}</td>
                      </tr>}
                    </tbody>
                  </table></div>
                </>
              ) : schedule.length >= 2 ? (
                <>
                  <p style={{ fontSize: 13.5, color: '#444', lineHeight: 1.8, margin: '0 0 16px' }}>
                    {isFlatRetainer
                      ? `A flat monthly retainer of ${fmt(monthlyAmount, proposal.currency)} covers the entire engagement, the full build and its ongoing management, invoiced at the start of each month with no setup fee and no separate build cost. Here is what that retainer delivers across the engagement, in priority order.`
                      : isRecurring
                        ? 'The engagement is billed as a monthly retainer, invoiced at the start of each phase. Each phase builds on the last as we layer in more services and your results compound.'
                        : `A one-time fee of ${fmt(proposal.total, proposal.currency)}, split into ${schedule.length} payments. Nothing recurring, and nothing further to pay once the work is delivered.`}
                  </p>
                  <div className="tbl-wrap"><table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
                    <thead>
                      <tr style={{ background: '#12002a' }}>
                        {['#', isFlatRetainer || isRecurring ? 'Phase' : 'Payment', 'What We Build', isFlatRetainer || isRecurring ? 'Monthly Retainer' : 'Amount'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: i === 3 ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: '#e8e0f8', letterSpacing: 0.6, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((m, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${i % 2 === 0 ? '#ede8f8' : '#f5f2fc'}`, background: i % 2 === 0 ? '#fff' : '#faf8ff' }}>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#aaa', width: 32 }}>#{i + 1}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, color: '#12002a' }}>{m.label}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#777', lineHeight: 1.5 }}>{m.note}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13.5, color: '#7c3aed', whiteSpace: 'nowrap' }}>{fmt(m.amount, proposal.currency)}{(isFlatRetainer || isRecurring) ? '/mo' : ''}</td>
                        </tr>
                      ))}
                      {!isFlatRetainer && !isRecurring && (
                        <tr style={{ background: '#f5f0ff' }}>
                          <td />
                          <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: 13, color: '#12002a' }}>Total</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#777' }}>One-time fee. Nothing recurring.</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 14.5, color: '#12002a', whiteSpace: 'nowrap' }}>{fmt(proposal.total, proposal.currency)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table></div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13.5, color: '#444', lineHeight: 1.8, margin: '0 0 16px' }}>
                    {isSinglePayment
                      ? 'One payment covers everything laid out in this agreement. No setup fee, no monthly cost, and nothing further owed once the project is complete.'
                      : 'A single flat monthly retainer covers everything laid out in this agreement, the full build and its ongoing management. It is invoiced at the start of each month, with no setup fee and no separate build cost.'}
                  </p>
                  <div className="no-break retainer-box" style={{ display: 'flex', alignItems: 'baseline', gap: 10, background: '#12002a', borderRadius: 12, padding: '26px 30px' }}>
                    <span style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{fmt(monthlyAmount, proposal.currency)}</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#b9a6ee' }}>{isSinglePayment ? 'one payment' : '/ month'}</span>
                    <span className="side-note" style={{ marginLeft: 'auto', fontSize: 12.5, color: '#c9bdf0', fontWeight: 500, maxWidth: 210, textAlign: 'right', lineHeight: 1.5 }}>
                      {isSinglePayment ? 'Everything in the scope above, included.' : 'Build, management, and everything in the scope above, included.'}
                    </span>
                  </div>
                </>
              )}
              {!isSinglePayment && (isFlatRetainer || isRecurring) && (
                <div style={{ marginTop: 12, padding: '12px 16px', background: '#f5f0ff', borderRadius: 8, fontSize: 12.5, color: '#7c3aed', fontWeight: 500 }}>
                  Note: Ad spend on Meta and Google, plus any AI tools we set up for your business, are separate from this {isFlatRetainer || isRecurring ? 'retainer' : 'fee'} and will be fully owned by you.
                </div>
              )}
            </div>

            <div className="no-break" style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 14 }}>{L('4. Terms', '4. Condiciones')}</div>
              <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.9 }}>
                {results ? (
                  <>{L(
                    'Signing activates this agreement; nothing is paid on signing. Commission invoices are due within 7 days. Everything built belongs to you from day one. Anything outside the scope above is quoted separately and paid before the work starts. If either of us stops, clients already brought in remain billable and anything finished is yours to keep.',
                    'La firma activa este acuerdo; no se paga nada al firmar. Las facturas de comisión se pagan dentro de 7 días. Todo lo que se construye es tuyo desde el primer día. Cualquier trabajo fuera del alcance de arriba se cotiza aparte y se paga antes de empezar. Si alguno de los dos para, los clientes ya conseguidos siguen siendo facturables y todo lo terminado es tuyo.',
                  )}</>
                ) : isRecurring ? (
                  <>Payment of the first monthly retainer activates this agreement and work begins. Each subsequent month is invoiced at the start of that month. All assets, accounts, and intellectual property created under this agreement belong to you from day one. Either party may pause or discontinue with 30 days written notice; work completed to that point remains billable. Our goal is a long-term partnership, not a one-time project.</>
                ) : (
                  <>The first payment activates this agreement and work begins straight away. All assets, accounts, and intellectual property created under this agreement belong to you from day one. If either of us needs to stop, work completed to that point remains billable and anything finished is yours to keep.</>
                )}
              </div>
            </div>

            {proposal.bankInfo && (
              <div className="no-break" style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 14 }}>{L('5. Payment Details', '5. Datos de pago')}</div>
                <pre style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 12.5, color: '#444', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, background: '#faf8ff', border: '1px solid #ede8fb', borderRadius: 8, padding: '16px 18px', lineHeight: 1.9 }}>{proposal.bankInfo}</pre>
              </div>
            )}
          </div>

          <div className="print-break doc-pad" style={{ padding: '52px 60px 52px', borderTop: '8px solid #12002a' }}>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 10 }}>{L('Electronic Signatures', 'Firmas electrónicas')}</div>
              <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.85, maxWidth: 560 }}>
                {L('By signing below,', 'Al firmar,')} <strong style={{ color: '#12002a' }}>{proposal.clientName}</strong> {L('confirms they have read, understood, and agree to all terms in this agreement. Typing your name is your electronic signature and holds the same legal validity as a handwritten one.', 'confirma que ha leído, entendido y acepta todas las condiciones de este acuerdo. Escribir tu nombre es tu firma electrónica y tiene la misma validez que una firma a mano.')}
              </div>
            </div>

            <div className="sig-grid no-break" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
              <div style={{ border: '1.5px solid #ede8fb', borderRadius: 10, padding: '22px 24px', background: '#faf8ff' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 16 }}>{L(`For ${BRAND.name}`, `Por ${BRAND.name}`)}</div>
                <div style={{ ...SIG_FONT, fontSize: 34, color: '#12002a', lineHeight: 1, marginBottom: 12 }}>{BRAND.owner}</div>
                <div style={{ borderTop: '1px solid #ddd', paddingTop: 8, fontWeight: 800, fontSize: 14, color: '#12002a' }}>{BRAND.owner}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{L(`${BRAND.owner}, ${BRAND.name}`, `${BRAND.owner}, ${BRAND.name}`)}</div>
              </div>

              <div style={{ border: `1.5px solid ${showSigned ? '#12002a' : '#ede8fb'}`, borderRadius: 10, padding: '22px 24px', background: showSigned ? '#fff' : '#faf8ff' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 16 }}>{L('For', 'Por')} {proposal.clientCompany || proposal.clientName}</div>
                {showSigned ? (
                  <>
                    <div style={{ ...SIG_FONT, fontSize: 34, color: '#12002a', lineHeight: 1, marginBottom: 12 }}>{displaySigner}</div>
                    <div style={{ borderTop: '1px solid #ddd', paddingTop: 8, fontWeight: 800, fontSize: 14, color: '#12002a' }}>{displaySigner}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>Electronically signed{displayDate ? ` · ${displayDate}` : ''}</div>
                  </>
                ) : isPdf ? (
                  <div style={{ ...SIG_FONT, fontSize: 30, color: '#c4bdd4', lineHeight: 1 }}>Awaiting signature</div>
                ) : (
                  <>
                    <div style={{ minHeight: 46, marginBottom: 6, display: 'flex', alignItems: 'flex-end' }}>
                      <span style={{ ...SIG_FONT, fontSize: 34, color: signerName.trim() ? '#12002a' : '#c4bdd4', lineHeight: 1 }}>{signerName.trim() || L('Type your name', 'Escribe tu nombre')}</span>
                    </div>
                    <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder={L('Full name', 'Nombre completo')}
                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #ddd', borderRadius: 7, fontSize: 13.5, fontFamily: 'Inter, Arial, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
                      <input type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder={L('Email address', 'Email')}
                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #ddd', borderRadius: 7, fontSize: 13.5, fontFamily: 'Inter, Arial, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
                      {error && <div style={{ fontSize: 12.5, color: '#dc2626' }}>{error}</div>}
                      <button type="button" disabled={submitting} onClick={() => handleSign()}
                        style={{ width: '100%', padding: '12px', marginTop: 4, background: submitting ? '#c4bdd4' : '#12002a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: submitting ? 'default' : 'pointer', fontFamily: 'Inter, Arial, sans-serif' }}>
                        {submitting ? L('Signing…', 'Firmando…') : L('Sign & Accept Agreement', 'Firmar y aceptar el acuerdo')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {!isPdf && step === 'signed' && (
              <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '2px solid #86efac', borderRadius: 12, padding: '28px 32px', textAlign: 'center', marginTop: 24 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: '#15803d', marginBottom: 6 }}>{L('Signed and confirmed', 'Firmado y confirmado')}</div>
                <div style={{ fontSize: 13.5, color: '#166534', marginBottom: 20 }}>
                  {L(`Thank you, ${BRAND.owner} has received your signed agreement and will be in touch soon.`, `Gracias, ${BRAND.owner} ha recibido tu acuerdo firmado y te escribirá pronto.`)}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: '#25D366', color: '#fff', borderRadius: 100, fontWeight: 700, textDecoration: 'none', fontSize: 13, fontFamily: 'inherit' }}>
                    💬 Message {BRAND.owner}
                  </a>
                  {linkedInvoiceId && (
                    <a href={`/invoice/${linkedInvoiceId}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: '#7b2fff', color: '#fff', borderRadius: 100, fontWeight: 700, textDecoration: 'none', fontSize: 13, fontFamily: 'inherit' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
                      View Invoice
                    </a>
                  )}
                  <a href={signedPdfHref} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: '#12002a', color: '#fff', border: 'none', borderRadius: 100, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download Signed Copy
                  </a>
                </div>
              </div>
            )}

            <div className="doc-foot" style={{ marginTop: 52, paddingTop: 20, borderTop: '1px solid #ede8fb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: '#bbb' }}>
                <div style={{ fontWeight: 600, color: '#888', marginBottom: 2 }}>{BRAND.name} · {proposal.ref}</div>
                <div>{BRAND.email} · {BRAND.website.replace(/^https?:\/\//, '')}</div>
              </div>
              <div style={{ width: 36, height: 36, background: '#12002a', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/icon.png" alt="Logo" width={28} height={28} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
