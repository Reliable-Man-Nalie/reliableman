import { NextRequest, NextResponse } from 'next/server'
import type { Proposal } from '@/lib/crm-types'
import { escapeHtml } from '@/lib/escape-html'
import { isResultsBased, proposalLang, resultsTiers, resultsCap, hasCap } from '@/lib/results-billing'
import { BRAND, ISSUER } from '@/lib/brand'

export const runtime = 'nodejs'
export const maxDuration = 60


function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const BASE_CSS = `
@page { size: Letter; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; }
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 11pt;
  color: #1a0030;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Single padded wrapper, no forced page breaks per div.
   Sections that should start on a new page use break-before: page
   on their first child, which is more reliable than break-after. */
.wrap { width: 100%; padding: 44px 52px; }

/* Keep key blocks together, don't split across pages. */
.payment-table, .terms-box, .bank-box, .sig-box, .sig-parties,
.p1-meta, .section-block { page-break-inside: avoid; break-inside: avoid; }
.deliverables-list li { page-break-inside: avoid; break-inside: avoid; }

/* Section heading */
.section-tag {
  font-size: 7pt;
  font-weight: 800;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: #7c3aed;
  margin-bottom: 8px;
}
.section-title {
  font-size: 15pt;
  font-weight: 800;
  color: #212A4D;
  margin-bottom: 16px;
  line-height: 1.2;
}

/* Page divider, visual break between sections */
.section-divider {
  border: none;
  border-top: 8px solid #212A4D;
  margin: 32px 0 32px;
  break-before: page;
}

hr.rule {
  border: none;
  border-top: 1px solid #ede8fb;
  margin: 20px 0;
}

/* ── Header ── */
.p1-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  padding-bottom: 22px;
  border-bottom: 2px solid #212A4D;
}
.brand-name { font-size: 14pt; font-weight: 800; color: #212A4D; margin-bottom: 5px; }
.brand-meta { font-size: 8.5pt; color: #888; line-height: 1.8; }
.doc-type { text-align: right; }
.doc-label { font-size: 7pt; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #7c3aed; margin-bottom: 4px; }
.doc-ref { font-size: 18pt; font-weight: 800; color: #212A4D; line-height: 1; }

/* ── Meta bar ── */
.p1-meta {
  display: flex;
  gap: 0;
  margin-bottom: 28px;
  background: #faf8ff;
  border-radius: 10px;
  padding: 18px 20px;
}
.meta-col { flex: 1; }
.meta-col + .meta-col { padding-left: 22px; border-left: 1px solid #ede8fb; margin-left: 22px; }
.meta-label { font-size: 7pt; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #bbb; margin-bottom: 5px; }
.meta-value { font-size: 10.5pt; font-weight: 700; color: #212A4D; line-height: 1.4; }
.meta-sub { font-size: 9pt; color: #888; margin-top: 2px; }

/* ── Proposal title / intro ── */
.p1-title {
  font-size: 20pt;
  font-weight: 800;
  color: #212A4D;
  margin-bottom: 12px;
  line-height: 1.2;
}
.p1-intro {
  font-size: 10.5pt;
  color: #444;
  line-height: 1.75;
  margin-bottom: 24px;
}

/* ── Scope list (replaces pills, cleaner, no overflow risk) ── */
.scope-list { margin: 0 0 20px; padding: 0; list-style: none; }
.scope-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f0eafc;
  font-size: 10pt;
  color: #1a0030;
  line-height: 1.5;
}
.scope-num {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  background: #7c3aed;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 7.5pt;
  font-weight: 800;
  color: #fff;
  margin-top: 1px;
}

/* ── Deliverables ── */
.deliverables-list { list-style: none; margin-bottom: 20px; }
.deliverables-list li {
  padding: 9px 0;
  border-bottom: 1px solid #f0eafc;
  font-size: 10pt;
  color: #1a0030;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.check-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  background: #7c3aed;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 8pt; color: #fff; font-weight: 700; line-height: 1;
  margin-top: 2px;
}

/* ── Payment table ── */
.payment-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.payment-table thead tr { background: #212A4D; }
.payment-table thead th {
  padding: 8px 12px;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.75);
  text-align: left;
}
.payment-table thead th:last-child { text-align: right; }
.payment-table tbody td {
  padding: 9px 12px;
  border-bottom: 1px solid #f0eafc;
  font-size: 10pt;
}
.payment-table tbody td:last-child { text-align: right; font-weight: 700; }
.payment-total-row { background: #212A4D; }
.payment-total-row td { color: #fff !important; font-weight: 800 !important; font-size: 11pt !important; }

/* ── Terms / bank boxes ── */
.terms-box {
  background: #faf8ff;
  border-left: 3px solid #7c3aed;
  border-radius: 0 8px 8px 0;
  padding: 12px 16px;
  font-size: 9pt;
  color: #555;
  line-height: 1.75;
  margin-bottom: 16px;
}
.bank-box {
  border: 1px solid #ede8fb;
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 16px;
}
.bank-box-title { font-size: 7.5pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #7c3aed; margin-bottom: 8px; }
.bank-box-body { font-size: 9pt; color: #555; line-height: 1.9; }

/* ── Signature ── */
.sig-intro { font-size: 10.5pt; color: #444; line-height: 1.75; margin-bottom: 24px; }
.sig-parties { display: flex; gap: 32px; margin-bottom: 28px; }
.sig-party { flex: 1; }
.sig-party-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #bbb; margin-bottom: 10px; }
.sig-party-name { font-size: 11pt; font-weight: 700; color: #212A4D; margin-bottom: 4px; }
.sig-party-sub { font-size: 9pt; color: #888; margin-bottom: 14px; }
.sig-line { border-top: 1px solid #212A4D; padding-top: 6px; font-size: 8.5pt; color: #999; }

.sig-box {
  background: #faf8ff;
  border: 1.5px solid #d4b8ff;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 20px;
}
.sig-box-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #7c3aed; margin-bottom: 10px; }
.sig-img { height: 72px; display: block; margin-bottom: 10px; }
.sig-box-cursive { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 26pt; color: #212A4D; margin-bottom: 8px; line-height: 1.1; }
.sig-box-name { font-size: 11pt; font-weight: 700; color: #212A4D; margin-bottom: 3px; }
.sig-box-date { font-size: 9pt; color: #888; }

/* ── Footer ── */
.page-footer {
  margin-top: 32px;
  padding-top: 14px;
  border-top: 1px solid #ede8fb;
  display: flex;
  justify-content: space-between;
  font-size: 8pt;
  color: #ccc;
}
`

function buildProposalHtml(p: Proposal & { signerSignature?: string }, signed: boolean, signerName: string, signerDate: string): string {
  const currency = p.currency || 'USD'
  const validUntil = (() => {
    const d = new Date(p.createdAt)
    d.setDate(d.getDate() + (p.validDays || 14))
    return d.toISOString().split('T')[0]
  })()

  const scopeHtml = (p.services ?? [])
    .map((s, i) => `<li><span class="scope-num">${i + 1}</span><span>${escapeHtml(s)}</span></li>`)
    .join('')

  const deliverablesHtml = (p.deliverables ?? [])
    .map(d => `<li><span class="check-icon">✓</span><span>${escapeHtml(d)}</span></li>`).join('')

  const results = isResultsBased(p)
  const es = proposalLang(p) === 'es'
  const L = (en: string, sp: string) => (es ? sp : en)
  const tiers = resultsTiers(p.paymentSchedule)
  const cap = resultsCap(p.paymentSchedule)
  const capped = hasCap(p.paymentSchedule)
  const flatFee = tiers[0]?.price ?? 0
  const resultsIntro = escapeHtml((p.paymentSchedule?.[0]?.note ? p.paymentSchedule[0].note + ' ' : '') + (!capped ? L(
    `Nothing is paid upfront. Each month one invoice covers only the NEW paying clients of that month, at ${fmt(flatFee, currency)} each. A month with no new clients costs nothing.`,
    `No se paga nada por adelantado. Cada mes una sola factura cubre solo los clientes NUEVOS que pagaron ese mes, a ${fmt(flatFee, currency)} cada uno. Un mes sin clientes nuevos no cuesta nada.`,
  ) : L(
    `Nothing is paid upfront. Each month one invoice covers only the NEW clients of that month, at the price of the tier each client falls in. The commission ends after client ${tiers[tiers.length - 1]?.to ?? ''}, so the most it can ever add up to is ${fmt(cap, currency)}.`,
    `No se paga nada por adelantado. Cada mes una sola factura cubre solo los clientes NUEVOS de ese mes, al precio del tramo en el que cae cada cliente. La comisión termina después del cliente ${tiers[tiers.length - 1]?.to ?? ''}, así que el máximo total es ${fmt(cap, currency)}.`,
  )))
  const resultsRows = tiers
    .map(t => Number.isFinite(t.to)
      ? `<tr><td>${L(`Clients ${t.from} to ${t.to}`, `Clientes ${t.from} a ${t.to}`)}</td><td style="color:#777;font-size:9.5pt">${L('per new client', 'por cliente nuevo')} · ${L('max', 'máx.')} ${fmt((t.to - t.from + 1) * t.price, currency)}</td><td>${fmt(t.price, currency)}</td></tr>`
      : `<tr><td>${L('Each new paying client', 'Cada cliente nuevo que pague')}</td><td style="color:#777;font-size:9.5pt">${L('no maximum', 'sin máximo')}</td><td>${fmt(t.price, currency)}</td></tr>`)
    .join('')

  const paymentRows = (p.paymentSchedule ?? [])
    .map(m => `<tr><td>${escapeHtml(m.label)}</td><td style="color:#777;font-size:9.5pt">${escapeHtml(m.note ?? '')}</td><td>${fmt(m.amount, currency)}</td></tr>`)
    .join('')

  const sigContent = signed
    ? (() => {
        const name = escapeHtml(signerName || p.signerName || p.clientName)

        const dateStr = signerDate || (p.signedAt ? new Date(p.signedAt).toLocaleString('en-US', {
          timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }) + ' (UTC)' : '')
        const imgTag = p.signerSignature
          ? `<img class="sig-img" src="${p.signerSignature}" alt="Signature" />`
          : `<div class="sig-box-cursive">${name}</div>`
        return `<div class="sig-box">
          <div class="sig-box-label">Signed by Client</div>
          ${imgTag}
          <div class="sig-box-name">${name}</div>
          <div class="sig-box-date">Electronically signed${dateStr ? ' · ' + escapeHtml(dateStr) : ''}</div>
        </div>`
      })()
    : `<div style="border:1.5px dashed #d4b8ff;border-radius:12px;padding:32px 22px;text-align:center;color:#bbb;font-size:9pt;margin-bottom:20px;">
        Signature pending, client signs digitally at the proposal link
       </div>`

  return `<!DOCTYPE html>
<html lang="${es ? 'es' : 'en'}">
<head>
<meta charset="UTF-8"/>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="wrap">


  <div class="p1-header">
    <div>
      <div class="brand-name">${ISSUER.name}</div>
      <div class="brand-meta">
        ${[ISSUER.address, [ISSUER.email, ISSUER.phone].filter(Boolean).join(' &nbsp;·&nbsp; '), ISSUER.website].filter(Boolean).join('<br>')}
      </div>
    </div>
    <div class="doc-type">
      <div class="doc-label">${L('Proposal', 'Propuesta')}</div>
      <div class="doc-ref">${p.ref}</div>
    </div>
  </div>

  <div class="p1-meta">
    <div class="meta-col">
      <div class="meta-label">${L('Prepared For', 'Preparado para')}</div>
      <div class="meta-value">${escapeHtml(p.clientName)}${p.clientCompany ? ` · ${escapeHtml(p.clientCompany)}` : ''}</div>
      ${p.clientEmail ? `<div class="meta-sub">${escapeHtml(p.clientEmail)}</div>` : ''}
    </div>
    <div class="meta-col">
      <div class="meta-label">${L('Date Issued', 'Fecha')}</div>
      <div class="meta-value">${fmtDate(p.createdAt.split('T')[0])}</div>
    </div>
    <div class="meta-col">
      <div class="meta-label">${L('Valid Until', 'Válido hasta')}</div>
      <div class="meta-value">${fmtDate(validUntil)}</div>
    </div>
    <div class="meta-col">
      <div class="meta-label">${results ? L('Payment', 'Pago') : 'Total Value'}</div>
      <div class="meta-value" style="color:#7c3aed">${results ? (capped ? L('By results, max ', 'Por resultados, máx. ') + fmt(cap, currency) : fmt(flatFee, currency) + L(' per new client', ' por cliente nuevo')) : fmt(p.total, currency)}</div>
    </div>
  </div>

  <div class="p1-title">${escapeHtml(p.title)}</div>
  <div class="p1-intro">${escapeHtml(p.intro)}</div>

  ${p.services?.length ? `
  <div class="section-block">
    <div class="section-tag">${L('Scope of Work', 'Alcance del trabajo')}</div>
    <ul class="scope-list">${scopeHtml}</ul>
  </div>` : ''}


  <hr class="section-divider">

  ${p.deliverables?.length ? `
  <div class="section-block">
    <div class="section-tag">${L('Deliverables', 'Entregables')}</div>
    <div class="section-title">${L("What We'll Deliver", 'Lo que entregamos')}</div>
    <ul class="deliverables-list">${deliverablesHtml}</ul>
  </div>
  <hr class="rule">` : ''}

  <div class="section-block">
    <div class="section-tag">${L('Investment', 'Inversión')}</div>
    <div class="section-title">${results ? L('Paid by results', 'Pago por resultados') : 'Payment Schedule'}</div>
    ${results ? `<p style="font-size:10pt;color:#555;line-height:1.7;margin:0 0 12px">${resultsIntro}</p>` : ''}
    <table class="payment-table">
      <thead>
        <tr>
          <th>${results ? L('Clients', 'Clientes') : 'Milestone'}</th>
          <th>${results ? L('Notes', 'Notas') : 'Notes'}</th>
          <th>${results ? L('Per client', 'Por cliente') : 'Amount'}</th>
        </tr>
      </thead>
      <tbody>
        ${results ? resultsRows : paymentRows}
        ${results && !capped ? '' : `<tr class="payment-total-row">
          <td colspan="2"><strong>${results ? L('Most it can ever be', 'Máximo posible') : 'Total'}</strong></td>
          <td>${fmt(results ? cap : p.total, currency)}</td>
        </tr>`}
      </tbody>
    </table>
  </div>

  <hr class="rule">

  <div class="section-block">
    <div class="section-tag">${L('Terms', 'Condiciones')}</div>
    <div class="terms-box">
      ${results ? L(
        `<strong>Payment:</strong> Nothing is paid on signing. Each commission invoice is due within 7 days. No VAT applies (international B2B service).<br><strong>Extras:</strong> Anything outside the scope above is quoted separately and paid before the work starts.<br><strong>Validity:</strong> This proposal expires ${fmtDate(validUntil)}.<br><strong>Ownership:</strong> Everything built belongs to the client from day one.<br><strong>Confidentiality:</strong> Both parties keep the terms of this proposal confidential.`,
        `<strong>Pago:</strong> No se paga nada al firmar. Cada factura de comisión se paga dentro de 7 días. Sin IVA (servicio B2B internacional).<br><strong>Extras:</strong> Cualquier trabajo fuera del alcance de arriba se cotiza aparte y se paga antes de empezar.<br><strong>Validez:</strong> Esta propuesta vence el ${fmtDate(validUntil)}.<br><strong>Propiedad:</strong> Todo lo que se construye es del cliente desde el primer día.<br><strong>Confidencialidad:</strong> Ambas partes mantienen confidenciales los términos de esta propuesta.`,
      ) : `<strong>Payment:</strong> Each milestone is due within 7 days of the invoice date. Late payments incur 2% monthly interest. No VAT applies (international B2B service).<br>
      <strong>Validity:</strong> This proposal expires ${fmtDate(validUntil)}.<br>
      <strong>Intellectual Property:</strong> All delivered work becomes property of the client upon receipt of full payment.<br>
      <strong>Confidentiality:</strong> Both parties agree to keep the terms of this proposal confidential.`}
    </div>
  </div>

  ${p.bankInfo ? `
  <div class="section-block">
    <div class="bank-box">
      <div class="bank-box-title">Payment Instructions</div>
      <div class="bank-box-body">${escapeHtml(p.bankInfo).replace(/\n/g, '<br>')}</div>
    </div>
  </div>` : `
  <div class="section-block">
    <div class="bank-box">
      <div class="bank-box-title">Payment Details</div>
      <div class="bank-box-body">
        ${[ISSUER.accountName, ISSUER.bank, ISSUER.iban && `IBAN: ${ISSUER.iban}`, ISSUER.swift && `SWIFT/BIC: ${ISSUER.swift}`].filter(Boolean).join('<br>') || 'Payment details are on your invoice.'}
      </div>
    </div>
  </div>`}


  <hr class="section-divider">

  <div class="section-tag">${L('Agreement', 'Acuerdo')}</div>
  <div class="section-title">${L('Acceptance &amp; Signature', 'Aceptación y firma')}</div>

  <div class="sig-intro">
    ${L(`By signing below, both parties agree to the scope, deliverables, payment schedule, and terms outlined in this proposal (${p.ref}). This document constitutes a binding service agreement.`, `Al firmar, ambas partes aceptan el alcance, los entregables, la forma de pago y las condiciones de esta propuesta (${p.ref}). Este documento es un acuerdo de servicio vinculante.`)}
  </div>

  <div class="sig-parties">
    <div class="sig-party">
      <div class="sig-party-label">Service Provider</div>
      <div class="sig-party-name">${ISSUER.name}</div>
      <div class="sig-party-sub">${ISSUER.email}</div>
      <div class="sig-line">Authorized · ${BRAND.owner}</div>
    </div>
    <div class="sig-party">
      <div class="sig-party-label">Client</div>
      <div class="sig-party-name">${escapeHtml(p.clientName)}</div>
      <div class="sig-party-sub">${escapeHtml(p.clientEmail)}${p.clientCompany ? ` · ${escapeHtml(p.clientCompany)}` : ''}</div>
      <div class="sig-line">Authorized representative</div>
    </div>
  </div>

  ${sigContent}

  ${p.notes ? `<div class="terms-box" style="margin-top:16px"><strong>Notes:</strong> ${escapeHtml(p.notes)}</div>` : ''}

  <div class="page-footer">
    <div>${ISSUER.name} &nbsp;·&nbsp; ${p.ref} &nbsp;·&nbsp; ${ISSUER.email}</div>
    <div>${ISSUER.website}</div>
  </div>

</div>
</body>
</html>`
}

async function pdfShift(html: string): Promise<Buffer> {
  const apiKey = process.env.PDFSHIFT_API_KEY
  if (!apiKey) throw new Error('PDFSHIFT_API_KEY is not configured')

  const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: html,
      format: 'Letter',
      margin: '0',
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`PDFShift ${res.status}: ${detail.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const token = sp.get('token')
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 })

  const signed = sp.get('signed') === '1'
  const signerName = sp.get('signer') ?? ''
  const signerDate = sp.get('date') ?? ''

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await sb.from('proposals').select('*').eq('token', token).single()
    if (error || !data) return NextResponse.json({ error: 'Proposal not found', detail: error?.message }, { status: 404 })

    const p: Proposal & { signerSignature?: string } = {
      id: data.id, token: data.token, ref: data.ref,
      clientName: data.client_name, clientEmail: data.client_email,
      clientCompany: data.client_company ?? undefined,
      title: data.title, intro: data.intro,
      services: data.services ?? [],
      deliverables: data.deliverables ?? [],
      paymentSchedule: data.payment_schedule ?? [],
      total: data.total, currency: data.currency,
      validDays: data.valid_days ?? 14,
      status: data.status,
      bankInfo: data.bank_info ?? undefined,
      notes: data.notes ?? undefined,
      createdAt: data.created_at,
      sentAt: data.sent_at ?? undefined,
      signedAt: data.signed_at ?? undefined,
      signerName: data.signer_name ?? undefined,
      signerSignature: data.signer_signature ?? undefined,
    }

    const html = buildProposalHtml(p, signed, signerName, signerDate)
    const pdf = await pdfShift(html)
    const filename = `Proposal-${p.ref}${signed ? '-signed' : ''}.pdf`

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Failed to generate PDF', detail: message }, { status: 500 })
  }
}
