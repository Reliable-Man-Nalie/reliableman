'use client'

import { useCallback, useEffect, useState, use } from 'react'
import Image from 'next/image'
import { getInvoiceById, getProposals } from '@/lib/crm-store'
import type { Invoice, Proposal } from '@/lib/crm-types'
import { copyText } from '@/lib/clipboard'
import {BRAND,ISSUER,documentName } from '@/lib/brand'

type Params = { id: string }

function fmt(n: number, cur: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}


function CopyRow({ label, value, mono, small, copied, onCopy }: {
  label: string; value: string; mono?: boolean; small?: boolean
  copied: string; onCopy: (k: string, v: string) => void
}) {
  const isOn = copied === label
  return (
    <div className="inv-copy" style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
      <span style={{ color: '#999', fontSize: 11, minWidth: 78, flexShrink: 0 }}>{label}</span>
      <span style={{
        flex: 1, overflowWrap: 'anywhere',
        fontFamily: mono ? 'monospace' : 'inherit',
        fontSize: mono ? 11.5 : small ? 11 : 12,
        color: small ? '#777' : '#333',
      }}>{value}</span>
      <button
        className="no-print"
        onClick={() => onCopy(label, value)}
        aria-label={`Copy ${label}`}
        style={{
          flexShrink: 0, border: '1px solid #ded5f5', background: isOn ? '#12805a' : '#fff',
          color: isOn ? '#fff' : '#6d28d9', borderRadius: 5, padding: '3px 9px',
          fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >{isOn ? 'Copied' : 'Copy'}</button>
    </div>
  )
}

export default function InvoicePage({ params }: { params: Promise<Params> }) {
  const { id } = use(params)
  const [invoice, setInvoice] = useState<Invoice | null | 'loading'>('loading')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [copiedField, setCopiedField] = useState('')

  const copyField = useCallback((key: string, value: string) => {
    setCopiedField(key)

    void copyText(value)
    window.setTimeout(() => setCopiedField(c => (c === key ? '' : c)), 1800)
  }, [])
  const [payError, setPayError] = useState('')

  async function handleDownloadPdf(inv: Invoice) {
    setDownloading(true)
    try {
      const res = await fetch(`/api/invoice-pdf?id=${inv.id}`)
      if (!res.ok) { const e = await res.json(); alert(e.detail || 'PDF failed'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Invoice-${inv.number}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Could not generate PDF') }
    finally { setDownloading(false) }
  }

  useEffect(() => {
    let cancelled = false
    const applyProposal = async (inv: Invoice) => {
      if (!inv.proposalId) return
      const local = getProposals().find(p => p.id === inv.proposalId)
      if (local) { if (!cancelled) setProposal(local); return }

      try {
        const r = await fetch(`/api/public-proposal?id=${encodeURIComponent(inv.proposalId)}`)
        const d = await r.json()
        if (!cancelled) setProposal(d.proposal ?? null)
      } catch { /* invoice still renders with its own line items */ }
    }

    const local = getInvoiceById(id)
    if (local) { setInvoice(local); applyProposal(local); return }
    fetch(`/api/public-invoice?id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setInvoice(d.invoice ?? null)
        if (d.invoice) applyProposal(d.invoice)
      })
      .catch(() => { if (!cancelled) setInvoice(null) })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1') return
    fetch('/api/track-view', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invoice', id }),
    }).catch(() => { /* best-effort */ })
  }, [id])

  if (invoice === 'loading') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0eeee', fontFamily: 'Georgia, serif', color: '#aaa' }}>Loading…</div>
  }
  if (!invoice) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', color: '#aaa' }}>Invoice not found.</div>
  }

  const subtotal = invoice.lineItems.reduce((s, li) => s + li.quantity * li.price, 0)
  const total = subtotal + invoice.taxes
  const balance = total - invoice.amountPaid

  return (
    <>
      {downloading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(124,58,237,0.15)' }}>
            <div style={{
              height: '100%', background: 'linear-gradient(90deg, #7c3aed, #a855f7, #7c3aed)',
              backgroundSize: '200% 100%',
              animation: 'pdfSlide 1.4s ease-in-out infinite',
              width: '60%',
              borderRadius: 2,
            }} />
          </div>
          <div style={{
            position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            background: '#12002a', color: '#fff', borderRadius: 100,
            padding: '12px 24px', fontSize: 13.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
            fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5" style={{ flexShrink: 0 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Generating your PDF…
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes pdfSlide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(120%); }
          100% { transform: translateX(-100%); }
        }
        body { margin: 0; background: #eeecec; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }

        @media print {
          @page { size: letter; margin: 0.65in 0.75in; }
          .no-print { display: none !important; }
          .doc-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; background: white !important; }
          .doc-wrap { background: white !important; padding: 0 !important; }
          .print-break { break-before: page; }
          .no-break { break-inside: avoid; }
        }

        /* PHONES. The document is laid out for paper (760px, 60px margins,
           logo and invoice number side by side, a 4-column table), and on a
           390px screen it ran off the right edge: the number, the dates and
           the price columns were cut off . Screen only, so
           the PDF and print are unchanged. */
        @media screen and (max-width: 640px) {
          .inv-top { padding: 10px 14px !important; }
          .inv-top-num { display: none; }
          .doc-wrap { padding: 0 0 40px !important; }
          .doc-page { box-shadow: none !important; }
          .inv-sec { padding: 28px 18px !important; }
          .inv-head { flex-direction: column-reverse; gap: 24px; margin-bottom: 28px !important; }
          .inv-meta { text-align: left !important; width: 100%; }
          .inv-meta-title { font-size: 24px !important; margin-bottom: 10px !important; }
          .inv-meta-row { justify-content: space-between !important; gap: 12px !important; }
          .inv-meta-row > span:last-child { min-width: 0 !important; }
          .inv-bill { grid-template-columns: 1fr !important; gap: 20px !important; }
          .inv-bill div { overflow-wrap: anywhere; }
          .inv-items thead { display: none; }
          .inv-items, .inv-items tbody, .inv-items tr, .inv-items td { display: block; width: 100%; }
          .inv-items tr { padding: 12px 0; }
          .inv-items td { padding: 3px 4px !important; text-align: left !important; }
          .inv-items td[data-label] { display: flex; justify-content: space-between; }
          .inv-items td[data-label]::before { content: attr(data-label); color: #999; font-size: 12px; font-weight: 500; }
          .inv-totals-wrap { justify-content: stretch !important; }
          .inv-totals { min-width: 0 !important; width: 100%; }
          .inv-pay-grid { grid-template-columns: 1fr !important; }
          .inv-copy { flex-wrap: wrap; row-gap: 2px !important; margin-bottom: 10px !important; }
          .inv-copy > span:first-child { width: 100%; }
          .inv-foot { gap: 12px; }
          .inv-foot > div:first-child { overflow-wrap: anywhere; }
        }
      `}} />

      <div className="no-print inv-top" style={{
        background: '#fff', borderBottom: '1px solid #e0ddd8', padding: '11px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, background: '#12002a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Image src="/icon.png" alt="Logo" width={24} height={24} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1a1a2e' }}>{BRAND.name}</span>
          <span className="inv-top-num" style={{ fontSize: 12, color: '#aaa', marginLeft: 4 }}>/ Invoice #{invoice.number}</span>
        </div>
        <button onClick={() => handleDownloadPdf(invoice)} disabled={downloading}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: downloading ? '#888' : '#12002a', color: '#fff', border: 'none', borderRadius: 8, cursor: downloading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit', letterSpacing: 0.2 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {downloading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      <div className="doc-wrap" style={{ padding: '40px 20px 60px', minHeight: '100vh' }}>
        <div className="doc-page" style={{
          maxWidth: 760, margin: '0 auto', background: '#fff',
          boxShadow: '0 4px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
        }}>

          <div className="inv-sec" style={{ padding: '52px 60px 40px' }}>

            <div className="inv-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 44 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ width: 88, height: 88, background: '#12002a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <Image src="/icon.png" alt={ISSUER.name} width={81} height={81} style={{ objectFit: 'contain' }} />
                </div>
                <div style={{ lineHeight: 1.75, fontSize: 12.5, color: '#555' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#12002a', marginBottom: 2 }}>{ISSUER.name}</div>
                  {ISSUER.legal && <div style={{ color: '#12002a', fontWeight: 500 }}>{ISSUER.legal}</div>}
                  {ISSUER.address && <div>{ISSUER.address}</div>}
                  {ISSUER.email && <div>{ISSUER.email}</div>}
                  {ISSUER.phone && <div>{ISSUER.phone}</div>}
                </div>
                <div style={{ fontSize: 12, color: '#888', lineHeight: 1.8 }}>
                  {ISSUER.website && <div>{ISSUER.website}</div>}
                  {ISSUER.iban && <div style={{ overflowWrap: 'anywhere' }}>IBAN: {ISSUER.iban}</div>}
                  {ISSUER.taxId && <div>Tax ID: {ISSUER.taxId}</div>}
                </div>
              </div>

              <div className="inv-meta" style={{ textAlign: 'right' }}>
                <div className="inv-meta-title" style={{ fontSize: 26, fontWeight: 800, color: '#12002a', letterSpacing: -0.5, marginBottom: 16 }}>
                  Invoice #{invoice.number}
                </div>
                <div style={{ fontSize: 12.5, color: '#666', lineHeight: 2.1 }}>
                  <div className="inv-meta-row" style={{ display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
                    <span style={{ color: '#999', fontWeight: 500 }}>Issue Date</span>
                    <span style={{ fontWeight: 600, color: '#12002a', minWidth: 130, textAlign: 'right' }}>{fmtDate(invoice.issueDate)}</span>
                  </div>
                  <div className="inv-meta-row" style={{ display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
                    <span style={{ color: '#999', fontWeight: 500 }}>Due Date</span>
                    <span style={{ fontWeight: 600, color: invoice.status === 'overdue' ? '#dc2626' : '#12002a', minWidth: 130, textAlign: 'right' }}>{fmtDate(invoice.dueDate)}</span>
                  </div>
                  <div className="inv-meta-row" style={{ display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
                    <span style={{ color: '#999', fontWeight: 500 }}>Sales rep</span>
                    <span style={{ fontWeight: 500, color: '#12002a', minWidth: 130, textAlign: 'right' }}>{BRAND.owner}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '2px solid #12002a', marginBottom: 28 }} />

            <div className="no-break inv-bill" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 36 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 10 }}>Bill To</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#12002a', marginBottom: 2 }}>{invoice.clientName}</div>
                {invoice.clientCompany && <div style={{ fontWeight: 600, fontSize: 13, color: '#333' }}>{invoice.clientCompany}</div>}
                {invoice.clientAddress && <div style={{ fontSize: 12.5, color: '#666', whiteSpace: 'pre-line', marginTop: 4, lineHeight: 1.7 }}>{invoice.clientAddress}</div>}
              </div>
              {(invoice.clientEmail || invoice.clientPhone) && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 10 }}>Contact</div>
                  {invoice.clientEmail && <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.8 }}>{invoice.clientEmail}</div>}
                  {invoice.clientPhone && <div style={{ fontSize: 12.5, color: '#555' }}>{invoice.clientPhone}</div>}
                  {invoice.clientVat && <div style={{ fontSize: 12.5, color: '#555' }}>VAT ID: {invoice.clientVat}</div>}
                </div>
              )}
            </div>

            {invoice.projectTitle && (
              <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #f0eafc' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#12002a', lineHeight: 1.4 }}>{invoice.projectTitle}</div>
              </div>
            )}

            {proposal && (
              <>
                {proposal.intro && (
                  <div className="no-break" style={{ marginBottom: 28, padding: '20px 24px', background: '#faf8ff', border: '1px solid #ede8fb', borderLeft: '4px solid #7c3aed', borderRadius: 4, fontSize: 13, color: '#333', lineHeight: 1.9, whiteSpace: 'pre-line' }}>
                    {proposal.intro}
                  </div>
                )}

                {proposal.services.length > 0 && (
                  <div className="no-break" style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>Services Included</div>
                    <ul style={{ margin: 0, padding: '0 0 0 18px', listStyle: 'none' }}>
                      {proposal.services.map((s, i) => (
                        <li key={i} style={{ fontSize: 13, color: '#444', lineHeight: 1.8, paddingLeft: 4, position: 'relative' }}>
                          <span style={{ position: 'absolute', left: -14, color: '#7c3aed', fontWeight: 900 }}>·</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {proposal.deliverables.length > 0 && (
                  <div className="no-break" style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>What You Walk Away With</div>
                    <ul style={{ margin: 0, padding: '0 0 0 18px', listStyle: 'none' }}>
                      {proposal.deliverables.map((d, i) => (
                        <li key={i} style={{ fontSize: 13, color: '#444', lineHeight: 1.8, paddingLeft: 4, position: 'relative' }}>
                          <span style={{ position: 'absolute', left: -14, color: '#7c3aed', fontWeight: 900 }}>·</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {proposal.paymentSchedule.length > 1 && (
                  <div className="no-break" style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>Full Engagement Roadmap</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                      {proposal.paymentSchedule.map((phase, i) => (
                        <div key={i} style={{ background: i === (invoice as Invoice).phaseIndex ? '#12002a' : '#faf8ff', border: `1px solid ${i === (invoice as Invoice).phaseIndex ? '#12002a' : '#ede8fb'}`, borderRadius: 8, padding: '12px 14px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: i === (invoice as Invoice).phaseIndex ? '#c4b5fd' : '#7c3aed', marginBottom: 4 }}>{phase.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: i === (invoice as Invoice).phaseIndex ? '#fff' : '#12002a' }}>{fmt(phase.amount, proposal.currency)}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.6 }}>/mo</span></div>
                          {phase.note && <div style={{ fontSize: 11, color: i === (invoice as Invoice).phaseIndex ? '#c4b5fd' : '#999', marginTop: 5, lineHeight: 1.5 }}>{phase.note}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 10, fontStyle: 'italic' }}>Highlighted phase is billed on this invoice. Subsequent months invoiced automatically.</div>
                  </div>
                )}

                <div style={{ borderTop: '2px solid #12002a', marginBottom: 24 }} />
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>This Invoice</div>
              </>
            )}

            <table className="inv-items" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
              <thead>
                <tr style={{ background: '#12002a' }}>
                  {['Product or Service', 'Qty', 'Price', 'Line Total'].map((h, i) => (
                    <th key={h} style={{
                      padding: '11px 14px', textAlign: i === 0 ? 'left' : 'right',
                      fontSize: 11, fontWeight: 700, color: '#e8e0f8', letterSpacing: 0.6, textTransform: 'uppercase'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((li, i) => (
                  <tr key={li.id} className="no-break" style={{ borderBottom: `1px solid ${i % 2 === 0 ? '#ede8f8' : '#f5f2fc'}`, background: i % 2 === 0 ? '#fff' : '#faf8ff' }}>
                    <td style={{ padding: '14px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#12002a' }}>{li.name}</div>
                      {li.description && <div style={{ fontSize: 12, color: '#888', marginTop: 4, lineHeight: 1.6 }}>{li.description}</div>}
                    </td>
                    <td data-label="Qty" style={{ padding: '14px 14px', textAlign: 'right', fontSize: 13, color: '#555' }}>{li.quantity}</td>
                    <td data-label="Price" style={{ padding: '14px 14px', textAlign: 'right', fontSize: 13, color: '#555' }}>{fmt(li.price, invoice.currency)}</td>
                    <td data-label="Line total" style={{ padding: '14px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: '#12002a' }}>{fmt(li.quantity * li.price, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="no-break inv-totals-wrap" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28, marginBottom: 8 }}>
              <div className="inv-totals" style={{ minWidth: 280, borderTop: '2px solid #12002a', paddingTop: 16 }}>
                {[
                  { label: 'Subtotal', value: fmt(subtotal, invoice.currency) },
                  { label: 'Taxes', value: fmt(invoice.taxes, invoice.currency) },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0eafc' }}>
                    <span style={{ fontSize: 13, color: '#888' }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{r.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0eafc' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#12002a' }}>Invoice Total</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#12002a' }}>{fmt(total, invoice.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ fontSize: 13, color: '#888' }}>Amount Paid</span>
                  <span style={{ fontSize: 13, color: '#888' }}>{fmt(invoice.amountPaid, invoice.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', background: '#12002a', borderRadius: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#e8e0f8' }}>Balance Due</span>
                  <span style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>{fmt(balance, invoice.currency)}</span>
                </div>
              </div>
            </div>

          </div>

          <div className="print-break inv-sec" style={{ padding: '52px 60px 52px', borderTop: '8px solid #12002a' }}>

            {invoice.notes && (
              <div className="no-break" style={{ marginBottom: 32, padding: '20px 24px', background: '#faf8ff', border: '1px solid #ede8fb', borderLeft: '4px solid #7c3aed', borderRadius: 4, fontSize: 13.5, color: '#333', lineHeight: 1.85, fontStyle: 'italic' }}>
                {invoice.notes}
              </div>
            )}

            <div className="no-break" style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 16 }}>Payment Methods</div>

              {(() => {
                const raw = (invoice.paymentUrl ?? '').trim()
                if (!raw) return null
                let safe = ''
                try {
                  const u = new URL(raw)
                  if (u.protocol === 'http:' || u.protocol === 'https:') safe = u.toString()
                } catch { /* not a URL, render nothing */ }
                if (!safe) return null
                return (
                  <div className="no-print" style={{ marginBottom: 20, background: 'linear-gradient(135deg,#eefaf3,#e2f5ec)', border: '1px solid #bde5d0', borderRadius: 10, padding: '20px 22px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0d3a24', marginBottom: 3 }}>
                        {invoice.paymentUrlLabel?.trim() || 'Pay now'}
                      </div>
                      <div style={{ fontSize: 12, color: '#406553' }}>Opens a secure payment page. Nothing to copy.</div>
                    </div>
                    <a
                      href={safe}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ background: '#12805a', color: '#fff', border: 'none', borderRadius: 8, padding: '13px 26px', fontSize: 14.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                    >
                      {invoice.paymentUrlLabel?.trim() || 'Pay now'} &rarr;
                    </a>
                  </div>
                )
              })()}

              {invoice.cardPayment !== false && (
              <div className="no-print" style={{ marginBottom: 20, background: 'linear-gradient(135deg,#f5f0ff,#ede8fb)', border: '1px solid #d9cef7', borderRadius: 10, padding: '20px 22px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#12002a', marginBottom: 3 }}>Pay by card, instantly</div>
                  <div style={{ fontSize: 12, color: '#5b5470' }}>Secure checkout by Stripe. No bank details to copy.</div>
                </div>
                <button
                  onClick={async () => {
                    setPaying(true); setPayError('')
                    try {
                      const r = await fetch('/api/pay-invoice', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ invoiceId: id }),
                      })
                      const j = await r.json()

                      if (j?.ok && j.url) { window.location.href = j.url; return }
                      setPayError(j?.error || 'Could not start the payment. Please use a transfer below.')
                    } catch {
                      setPayError('Could not start the payment. Please use a transfer below.')
                    } finally { setPaying(false) }
                  }}
                  disabled={paying}
                  style={{ background: paying ? '#b9a9e8' : 'linear-gradient(180deg,#8b5cf6,#6d28d9)', color: '#fff', border: 'none', borderRadius: 999, padding: '13px 28px', fontWeight: 700, fontSize: 14.5, cursor: paying ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >{paying ? 'Opening checkout…' : 'Pay now by card'}</button>
                {payError && <div style={{ flexBasis: '100%', fontSize: 12.5, color: '#b91c1c' }}>{payError}</div>}
              </div>
              )}

              {(() => {
                const chosen = invoice.paymentMethods
                const wants = (id: string) => !chosen || chosen.includes(id)
                return (
              <div className="inv-pay-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 20 }}>
                {(wants('bank') || wants('wise')) && (ISSUER.iban || ISSUER.accountName) && (
                <div style={{ background: '#faf8ff', border: '1px solid #ede8fb', borderRadius: 8, padding: '18px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#12002a', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Bank transfer</div>
                  <div style={{ fontSize: 12, color: '#555', lineHeight: 1.9 }}>
                    <CopyRow label="Name" value={ISSUER.accountName} copied={copiedField} onCopy={copyField} />
                    <CopyRow label="IBAN" value={ISSUER.iban} mono copied={copiedField} onCopy={copyField} />
                    {ISSUER.swift && <CopyRow label="SWIFT/BIC" value={ISSUER.swift} mono copied={copiedField} onCopy={copyField} />}
                    {ISSUER.bank && <CopyRow label="Bank" value={ISSUER.bank} small copied={copiedField} onCopy={copyField} />}
                    <CopyRow label="Reference" value={`Invoice ${invoice.number}`} copied={copiedField} onCopy={copyField} />
                    <div style={{ color: '#12805a', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                      Paying from a bank inside SEPA? Send it as a normal domestic transfer.
                      The SWIFT code is only needed from outside SEPA.
                    </div>
                  </div>
                </div>
                )}
              </div>
                )
              })()}
            </div>

            <div className="no-break">
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 14 }}>Terms & Conditions</div>
              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.95 }}>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#333' }}>Payment Policy:</strong> Net 7. Payment is due within 7 days of the invoice date. Late payments incur a <strong style={{ color: '#333' }}>2% monthly interest fee</strong> on the outstanding balance. For monthly retainers, failure to communicate or pay within 7 days may result in immediate suspension of services.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#333' }}>Tax &amp; Currency:</strong> No VAT/Sales Tax applied (International B2B service).{invoice.currency === 'AWG' ? <> The fixed exchange rate is <strong style={{ color: '#333' }}>$1.00 USD = 1.80 AWG/Florin</strong>.</> : null}</p>
                <p style={{ margin: 0 }}><strong style={{ color: '#333' }}>Important Note:</strong> Bank details have changed compared to previous invoices. Please use the information above for all future transfers.</p>
              </div>
            </div>

            <div className="inv-foot" style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid #ede8fb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: '#bbb' }}>
                <div style={{ fontWeight: 600, color: '#888', marginBottom: 2 }}>{BRAND.owner}</div>
                <div>{ISSUER.email} · {ISSUER.website}</div>
              </div>
              <div style={{ width: 40, height: 40, background: '#12002a', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/icon.png" alt="Logo" width={32} height={32} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
