'use client'

import { useEffect, useState, use } from 'react'
import Image from 'next/image'
import { getInvoiceById } from '@/lib/crm-store'
import type { Invoice } from '@/lib/crm-types'
import { BRAND, ISSUER } from '@/lib/brand'

type Params = { id: string }

function fmt(n: number, cur: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  const date = d.length <= 10 ? new Date(d + 'T00:00:00') : new Date(d)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}


export default function ReceiptPage({ params }: { params: Promise<Params> }) {
  const { id } = use(params)
  const [invoice, setInvoice] = useState<Invoice | null | 'loading'>('loading')
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadPdf(inv: Invoice) {
    setDownloading(true)
    try {
      const res = await fetch(`/api/receipt-pdf?id=${encodeURIComponent(inv.id)}`)
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || 'PDF failed'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Receipt-R-${inv.number}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Could not generate PDF') }
    finally { setDownloading(false) }
  }

  useEffect(() => {
    let cancelled = false
    const local = getInvoiceById(id)
    if (local) { setInvoice(local); return }
    fetch(`/api/public-invoice?id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setInvoice(d.invoice ?? null) })
      .catch(() => { if (!cancelled) setInvoice(null) })
    return () => { cancelled = true }
  }, [id])

  if (invoice === 'loading') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef1ee', fontFamily: 'Inter, sans-serif', color: '#aaa' }}>Loading…</div>
  }
  if (!invoice) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#aaa' }}>Receipt not found.</div>
  }

  const subtotal = (invoice.lineItems ?? []).reduce((s, li) => s + li.quantity * li.price, 0)
  const total = subtotal + (invoice.taxes ?? 0)
  const amountPaid = invoice.amountPaid && invoice.amountPaid > 0 ? invoice.amountPaid : total
  const paidOn = invoice.paidAt || invoice.createdAt
  const rNo = `R-${invoice.number}`

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #eef1ee; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }
      `}} />

      <div className="no-print" style={{
        background: '#fff', borderBottom: '1px solid #e0ddd8', padding: '11px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, background: '#0d3d1e', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Image src="/icon.png" alt="Logo" width={24} height={24} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1a1a2e' }}>{BRAND.name}</span>
          <span style={{ fontSize: 12, color: '#aaa', marginLeft: 4 }}>/ Receipt {rNo}</span>
        </div>
        <button onClick={() => handleDownloadPdf(invoice)} disabled={downloading}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: downloading ? '#888' : '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: downloading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit', letterSpacing: 0.2 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {downloading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      <div style={{ padding: '40px 20px 60px', minHeight: '100vh' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', borderRadius: 4, boxShadow: '0 4px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '48px 56px 44px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #12002a' }}>
              <div>
                <div style={{ width: 64, height: 64, background: '#0d3d1e', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14 }}>
                  <Image src="/icon.png" alt="Logo" width={58} height={58} style={{ objectFit: 'contain' }} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#12002a', marginBottom: 4 }}>{ISSUER.name}</div>
                <div style={{ fontSize: 12, color: '#777', lineHeight: 1.7 }}>
                  {ISSUER.legal && <div>{ISSUER.legal}</div>}
                  {ISSUER.address && <div>{ISSUER.address}</div>}
                  <div>{[ISSUER.email, ISSUER.phone].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#16a34a', marginBottom: 6 }}>Payment Receipt</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#12002a', lineHeight: 1 }}>{rNo}</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>for Invoice #{invoice.number}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d3d1e', borderRadius: 12, padding: '24px 28px', marginBottom: 30, flexWrap: 'wrap', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ border: '2.5px solid #4ade80', color: '#4ade80', borderRadius: 8, padding: '6px 15px', fontSize: 20, fontWeight: 800, letterSpacing: 3, transform: 'rotate(-4deg)' }}>PAID</div>
                <div>
                  <div style={{ color: '#a7f3d0', fontSize: 10.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Amount Received</div>
                  <div style={{ color: '#fff', fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{fmt(amountPaid, invoice.currency)}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', color: '#a7f3d0', fontSize: 12.5, lineHeight: 1.7 }}>
                Paid on<div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{fmtDate(paidOn)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 30 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#16a34a', marginBottom: 8 }}>Received From</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#12002a' }}>{invoice.clientName}</div>
                {invoice.clientCompany && <div style={{ fontSize: 13, color: '#333' }}>{invoice.clientCompany}</div>}
                {invoice.clientEmail && <div style={{ fontSize: 12.5, color: '#777', marginTop: 2 }}>{invoice.clientEmail}</div>}
              </div>
              {invoice.projectTitle && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#16a34a', marginBottom: 8 }}>For</div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: '#12002a', lineHeight: 1.5 }}>{invoice.projectTitle}</div>
                </div>
              )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr style={{ background: '#12002a' }}>
                  {['Description', 'Qty', 'Amount'].map((h, i) => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: '#e8e0f8', letterSpacing: 0.6, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(invoice.lineItems ?? []).map((li, i) => (
                  <tr key={li.id} style={{ borderBottom: `1px solid ${i % 2 === 0 ? '#ede8f8' : '#f5f2fc'}`, background: i % 2 === 0 ? '#fff' : '#faf8ff' }}>
                    <td style={{ padding: '13px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#12002a' }}>{li.name}</div>
                      {li.description && <div style={{ fontSize: 12, color: '#888', marginTop: 3, lineHeight: 1.6 }}>{li.description}</div>}
                    </td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13, color: '#555' }}>{li.quantity}</td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: '#12002a' }}>{fmt(li.quantity * li.price, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <div style={{ minWidth: 280 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: '#888' }}>
                  <span>Subtotal</span><span>{fmt(subtotal, invoice.currency)}</span>
                </div>
                {invoice.taxes ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: '#888' }}>
                    <span>Taxes / Fees</span><span>{fmt(invoice.taxes, invoice.currency)}</span>
                  </div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', background: '#0d3d1e', borderRadius: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#a7f3d0' }}>Total Paid</span>
                  <span style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>{fmt(amountPaid, invoice.currency)}</span>
                </div>
              </div>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid #16a34a', borderRadius: 4, padding: '14px 18px', fontSize: 13, color: '#14532d', lineHeight: 1.7 }}>
              This receipt confirms that payment has been received in full. No balance remains outstanding. Keep this document for your records. Thank you for your business.
            </div>

            <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #ede8fb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: '#bbb' }}>
              <div>{ISSUER.name} · Receipt {rNo} · {ISSUER.email}</div>
              <div style={{ color: '#16a34a', fontWeight: 700 }}>Paid in full</div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
