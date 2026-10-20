'use client'

import { useEffect, useRef, useState } from 'react'
import type { EventAttendee } from '@/lib/event-types'

function when(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function stripeLink(a: EventAttendee): string {
  const r = a.paymentRef || {}
  const base = r.livemode === false ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com'
  if (r.paymentIntent) return `${base}/payments/${encodeURIComponent(r.paymentIntent)}`
  return `${base}/search?query=${encodeURIComponent(a.email)}`
}

export default function PaymentChip({ a, onOpenProof }: { a: EventAttendee; onOpenProof: () => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const card = a.paymentMethod === 'card' || a.paymentRef?.via === 'card'
  const bank = !card && (a.paymentMethod === 'bank' || !!a.paymentRef?.via?.startsWith('bank') || !!a.proofPath)
  const circle = !card && (a.paymentMethod === 'circle' || a.paymentRef?.via === 'circle')
  const label = card ? 'Card' : bank ? 'Bank' : circle ? 'Free' : 'Paid'
  const currency = a.paymentRef?.currency || 'USD'

  function show() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    const r = btn.current?.getBoundingClientRect()
    if (r) {
      const width = 280
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.left + r.width / 2 - width / 2))
      setPos({ top: r.bottom + 8, left })
    }
    setOpen(true)
  }
  function hideSoon() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setOpen(false), 180)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open])

  const markedBy = a.paymentRef?.markedBy
  const verdict = a.proofCheck?.verdict

  return (
    <>
      <button ref={btn} type="button"
        onMouseEnter={show} onMouseLeave={hideSoon} onFocus={show} onBlur={hideSoon}
        onClick={() => (open ? setOpen(false) : show())}
        aria-expanded={open}
        style={{
          border: 'none', cursor: 'pointer', borderRadius: 100, padding: '4px 10px',
          fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
          color: 'var(--os-success, #16a34a)', background: 'color-mix(in srgb, var(--os-success, #16a34a) 14%, transparent)',
        }}>
        ✓ {label}
      </button>
      {open && (
        <div role="dialog" onMouseEnter={show} onMouseLeave={hideSoon}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: 280, zIndex: 500, textAlign: 'left',
            background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)',
            border: '1px solid var(--os-line)', borderRadius: 12, padding: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,.28)', fontSize: 12.5, color: 'var(--os-text-primary)',
          }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8, color: 'var(--os-success, #16a34a)' }}>
            {card ? 'Stripe payment confirmed' : bank ? 'Paid by bank transfer' : circle ? 'Free seat' : 'Marked paid'}
          </div>
          <Row k="Amount" v={`${currency === 'USD' ? '$' : currency + ' '}${a.paidAmount || 0}`} />
          {a.paidAt && <Row k="Paid" v={when(a.paidAt)} />}
          {card && a.paymentRef?.payerEmail && a.paymentRef.payerEmail.toLowerCase() !== a.email.toLowerCase() && <Row k="Card email" v={a.paymentRef.payerEmail} />}
          {card && a.paymentRef?.paymentIntent && <Row k="Payment" v={a.paymentRef.paymentIntent} mono />}
          {bank && (
            <Row k="Confirmed by" v={
              a.paymentRef?.via === 'bank-auto' ? 'Matched from the uploaded proof'
                : markedBy ? markedBy
                : a.paymentRef?.via === 'bank-manual' ? 'Marked by hand' : 'Marked by hand'
            } />
          )}
          {bank && verdict && <Row k="Proof check" v={verdict === 'match' ? 'Proof matched' : `Check by hand${a.proofCheck?.reasons?.length ? `: ${a.proofCheck.reasons.join(' ')}` : ''}`} />}
          <Row k="Ticket" v={a.ticketCode} mono />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {card && (
              <a href={stripeLink(a)} target="_blank" rel="noreferrer"
                style={{ fontWeight: 700, fontSize: 12, color: 'var(--os-accent)', textDecoration: 'none' }}>
                Open in Stripe ↗
              </a>
            )}
            {a.proofPath && (
              <button type="button" onClick={() => { setOpen(false); onOpenProof() }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: 'var(--os-accent)' }}>
                View transfer proof ↗
              </button>
            )}
            {bank && !a.proofPath && <span style={{ fontSize: 11.5, color: 'var(--os-text-muted)' }}>No proof uploaded. Check your bank account.</span>}
          </div>
        </div>
      )}
    </>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '3px 0' }}>
      <span style={{ width: 92, flexShrink: 0, color: 'var(--os-text-muted)' }}>{k}</span>
      <span style={{ wordBreak: 'break-word', fontFamily: mono ? 'monospace' : undefined, fontSize: mono ? 11.5 : undefined }}>{v}</span>
    </div>
  )
}
