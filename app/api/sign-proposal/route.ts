import { BRAND, CONTACT_URL } from '@/lib/brand'
import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/escape-html'
import { EMAIL_FROM, INTERNAL_FROM, OWNER_EMAIL, documentShell, longDate, moneyRounded, scrubClientCopy } from '@/lib/email'
import { SITE as LAUNCH } from '@/lib/site'
import { isResultsBased, proposalLang, resultsTiers } from '@/lib/results-billing'

export const runtime = 'nodejs'
export const maxDuration = 60

const FROM = EMAIL_FROM
const NOTIFY_EMAIL = OWNER_EMAIL

function randHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  let s = ''
  for (const b of a) s += b.toString(16).padStart(2, '0')
  return s
}

async function buildSignedPdf(req: NextRequest, token: string, signer: string, date: string): Promise<string | null> {
  if (!token) return null
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`
    const q = new URLSearchParams({ token, signed: '1', signer, date })
    const res = await fetch(`${base}/api/proposal-pdf?${q.toString()}`)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  } catch {
    return null
  }
}

async function sendEmail(key: string, payload: Record<string, unknown>) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const token: string = typeof body.token === 'string' ? body.token : ''
    const signerNameRaw: string = typeof body.signerName === 'string' ? body.signerName.slice(0, 120) : ''
    const signerEmailRaw: string = typeof body.signerEmail === 'string' ? body.signerEmail.slice(0, 254) : ''

    const sigImgRaw: string | null = (
      typeof body.signatureImg === 'string' &&
      body.signatureImg.startsWith('data:image/png;base64,') &&
      body.signatureImg.length < 200_000
    ) ? body.signatureImg : null
    if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 })
    if (signerEmailRaw && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signerEmailRaw)) {
      return NextResponse.json({ error: 'invalid signer email' }, { status: 400 })
    }

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!sbUrl || !sbKey) return NextResponse.json({ error: 'supabase not configured' }, { status: 500 })
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(sbUrl, sbKey)
    const { data: rows } = await sb.from('proposals').select('*').eq('token', token).limit(1)
    const p = rows && rows.length ? rows[0] : null
    if (!p) return NextResponse.json({ error: 'proposal not found' }, { status: 404 })

    const currentStatus = String(p.status ?? '')
    if (currentStatus === 'void' || currentStatus === 'declined') {
      return NextResponse.json({
        error: 'This agreement is no longer active. Please get in touch for a current one.',
      }, { status: 409 })
    }

    const proposalId: string = p.id
    const proposalRef: string = p.ref ?? ''
    const clientName: string = p.client_name ?? ''
    const clientEmail: string = p.client_email ?? ''
    const clientCompany: string = p.client_company ?? ''

    const clientPhone: string = p.client_phone ?? ''
    const clientAddress: string = p.client_address ?? ''
    const title: string = p.title ?? ''
    const total = p.total ?? ''
    const currency: string = p.currency ?? 'USD'
    const bankInfo: string = p.bank_info ?? ''

    const payMethods: string[] | null = Array.isArray(p.payment_methods) ? p.payment_methods : null

    const storedSigner = String(p.signer_name ?? '').trim()
    const signerName: string = (currentStatus === 'signed' && storedSigner)
      ? storedSigner
      : (signerNameRaw || clientName)
    const signerEmail: string = signerEmailRaw || clientEmail

    const schedule = Array.isArray(p.payment_schedule) ? p.payment_schedule : []
    const firstPhase = schedule[0] ?? null
    const monthlyAmount: number = firstPhase?.amount ?? (typeof total === 'number' ? total : Number(total) || 0)

    const evenSchedule = schedule.length > 1
      && schedule.every((m: { amount?: number }) => (m.amount ?? 0) === (schedule[0].amount ?? 0))
    const isOneTime: boolean = typeof p.one_time === 'boolean' ? p.one_time : !evenSchedule

    const results = isResultsBased({ paymentSchedule: schedule })
    const lang = proposalLang({ paymentSchedule: schedule })
    const es = lang === 'es'
    const tierLine = () => resultsTiers(schedule)
      .map(t => !Number.isFinite(t.to)
        ? (es ? `${fmtMoney(t.price)} por cliente nuevo que pague` : `${fmtMoney(t.price)} per new paying client`)
        : es ? `${fmtMoney(t.price)} por cliente (${t.from} a ${t.to})` : `${fmtMoney(t.price)} per client (${t.from} to ${t.to})`)
      .join(', ')
    const feeLabel = results ? (es ? 'Pago' : 'Payment') : isOneTime ? 'Project fee' : 'Monthly retainer'
    const feeValue = (n: number) => results
      ? (es ? `Nada por adelantado. ${tierLine()}` : `Nothing upfront. ${tierLine()}`)
      : (isOneTime ? fmtMoney(n) : `${fmtMoney(n)}/mo`)

    const fmtMoney = (n: number) => moneyRounded(n, currency, 'to be confirmed')

    const signedAtDate = p.signed_at ? new Date(String(p.signed_at)) : new Date()
    const signedAt = (Number.isNaN(signedAtDate.getTime()) ? new Date() : signedAtDate).toLocaleString('en-US', {
      timeZone: 'UTC', month: 'long', day: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    const alreadySigned = currentStatus === 'signed' && !!p.signed_at
    if (!alreadySigned) {

      const updatePayload: Record<string, unknown> = { status: 'signed', signed_at: new Date().toISOString(), signer_name: signerName }
      if (sigImgRaw) updatePayload.signer_signature = sigImgRaw
      await sb.from('proposals').update(updatePayload).eq('token', token)
    }

    try {
      const signerEmail = (p.client_email ?? '').trim()
      if (signerEmail) {
        const schedule = Array.isArray(p.payment_schedule) ? p.payment_schedule : []
        const amounts = schedule.map((m: { amount?: number }) => m.amount ?? 0)

        const even = !isOneTime && amounts.length > 1 && amounts.every((a: number) => a === amounts[0])
        const { data: existingClient } = await sb
          .from('clients').select('id, monthly_amount').ilike('email', signerEmail).limit(1)

        const money = {
          monthly_amount: even ? amounts[0] : null,
          currency: p.currency ?? 'USD',
          plan_name: p.title ?? null,
        }

        if (existingClient && existingClient.length) {
          await sb.from('clients').update({
            ...money, status: 'active',
          }).eq('id', existingClient[0].id)
        } else {
          await sb.from('clients').insert({
            id: 'vc-' + randHex(16),
            deal_id: p.deal_id ?? null,
            name: p.client_name ?? signerEmail,
            email: signerEmail,
            phone: p.client_phone ?? null,
            company: p.client_company ?? null,
            program: p.title ?? null,
            status: 'active',
            delivery_stage: 'Kickoff Call',
            enrolled_program_ids: [],
            started_at: new Date().toISOString(),
            token: randHex(32),
            created_at: new Date().toISOString(),
            ...money,
          })
        }
      }
    } catch (err) {

      console.error('sign-proposal: could not create client record', err)
    }

    let invoiceNumber: string | null = null
    let invoiceId: string | null = null
    let invoiceDueStr: string | null = null

    let invoiceError: string | null = null
    const invoiceLabel: string = firstPhase?.label ?? 'First month retainer'
    try {
      const { data: existingInv } = await sb.from('invoices').select('id, number, due_date').eq('proposal_id', proposalId).eq('phase_index', 0).limit(1)
      if (existingInv && existingInv.length) {
        invoiceNumber = existingInv[0].number
        invoiceId = existingInv[0].id
        invoiceDueStr = existingInv[0].due_date ?? null
        if (!p.linked_invoice_id) await sb.from('proposals').update({ linked_invoice_id: existingInv[0].id }).eq('id', proposalId)
      } else if (firstPhase && !results && (Number(firstPhase.amount) || 0) > 0) {

        const { data: allInv } = await sb.from('invoices').select('number')
        const nums = (allInv ?? []).map(r => parseInt(r.number, 10)).filter(n => !isNaN(n))
        invoiceNumber = nums.length ? String(Math.max(...nums) + 1) : `${new Date().getFullYear()}126`
        const invId = randHex(12)
        const today = new Date()
        const due = new Date(today); due.setDate(due.getDate() + 7)
        invoiceDueStr = due.toISOString().slice(0, 10)
        const lineId = randHex(8)
        const invRow = {
          id: invId, number: invoiceNumber,
          payment_methods: payMethods,
          client_name: clientName, client_email: clientEmail, client_company: clientCompany || null,
          client_phone: clientPhone || null, client_address: clientAddress || null,
          project_title: title,

          line_items: [{
            id: lineId,
            name: title,
            description: schedule.length > 1
              ? `${firstPhase.label}. Full scope and timeline in the signed proposal ${proposalRef}.`
              : `As agreed in the signed proposal ${proposalRef}.`,
            quantity: 1,
            price: firstPhase.amount,
          }],
          taxes: 0, amount_paid: 0, currency, status: 'sent',
          notes: [
            schedule.length > 1
              ? `${firstPhase.label} of ${schedule.length}, per the signed agreement.`
              : 'Full payment, per the signed agreement.',
            token ? `The signed proposal, with the complete scope and timeline: ${LAUNCH.siteUrl}/proposal/${token}` : '',
            'Signed on ' + signedAt + '.',
          ].filter(Boolean).join('\n'),
          issue_date: today.toISOString().slice(0, 10), due_date: invoiceDueStr,
          created_at: today.toISOString(), sent_at: today.toISOString(), paid_at: null,
          proposal_id: proposalId, phase_index: 0,
        }

        let row: Record<string, unknown> = { ...invRow }
        let invErr = (await sb.from('invoices').insert(row)).error
        for (let attempt = 0; attempt < 4 && invErr; attempt++) {
          const missing = /'([^']+)' column/.exec(invErr.message)?.[1]
          if (!missing || !(missing in row)) break
          console.error(`sign-proposal: invoices.${missing} does not exist. Retrying without it, and a Supabase migration is pending.`)
          const stripped: Record<string, unknown> = {}
          for (const k of Object.keys(row)) if (k !== missing) stripped[k] = row[k]
          row = stripped
          invErr = (await sb.from('invoices').insert(row)).error
        }
        if (invErr) {

          invoiceError = invErr.message
          invoiceNumber = null
          console.error('sign-proposal: could not create the first invoice', invErr)
        } else {
          invoiceId = invId
          await sb.from('proposals').update({ linked_invoice_id: invId }).eq('id', proposalId)
        }
      }
    } catch (err) {

      invoiceError = String(err)
      invoiceNumber = null
      console.error('sign-proposal: invoice creation failed', err)
    }

    const key = process.env.RESEND_API_KEY
    if (key) {
      const firstName = escapeHtml(String(signerName || clientName || '').trim().split(/\s+/)[0] || 'there')
      const eRef = escapeHtml(proposalRef || 'your agreement')

      const cleanTitle = scrubClientCopy(title) || 'our engagement'
      const eTitle = escapeHtml(cleanTitle)
      const eClientName = escapeHtml(clientName)
      const eClientCompany = escapeHtml(clientCompany)
      const eSignerName = escapeHtml(signerName)
      const eSignerEmail = escapeHtml(signerEmail)
      const eClientEmail = escapeHtml(clientEmail)

      const resultsClientHtml = documentShell({
        title: es ? `Firmado y confirmado: ${proposalRef || 'tu acuerdo'}` : `Signed and confirmed: ${proposalRef || 'your agreement'}`,
        preview: es ? 'Tu acuerdo está firmado. No hay nada que pagar hoy.' : 'Your agreement is signed. Nothing to pay today.',
        card: `
<table role="presentation" class="e-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#241a33;line-height:1.75;">
  <tr><td class="e-hpad" bgcolor="#212A4D" style="background-color:#212A4D;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <img src="${BRAND.website}/logo.png" width="64" height="64" alt="${BRAND.name}" style="border:0;border-radius:13px;display:block;margin:0 auto 12px;" />
    <div style="color:#c4b5fd;font-size:11px;font-weight:700;letter-spacing:3px;">${BRAND.name}</div>
  </td></tr>
  <tr><td class="e-body" bgcolor="#ffffff" style="background-color:#ffffff;padding:36px 32px;border:1px solid #ede8fb;border-top:none;border-radius:0 0 12px 12px;">
    <h2 style="font-size:22px;font-weight:800;color:#0f0020;margin:0 0 12px;">${es ? `Listo, ${firstName}.` : `You are in, ${firstName}.`}</h2>
    <p style="color:#4a4359;margin:0 0 20px;">${es ? `Tu acuerdo <strong>${eTitle}</strong> está firmado y recibido. Este es el resumen:` : `Your agreement for <strong>${eTitle}</strong> has been signed and received. Here is the summary:`}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">${es ? 'Referencia' : 'Reference'}</td><td style="padding:8px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${eRef}</td></tr>
      <tr><td style="padding:8px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">${es ? 'Cliente' : 'Client'}</td><td style="padding:8px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${eClientName}${clientCompany ? ` / ${eClientCompany}` : ''}</td></tr>
      <tr><td style="padding:8px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">${escapeHtml(feeLabel)}</td><td style="padding:8px 0;font-weight:600;color:#7C3AED;border-bottom:1px solid #f0eafc;text-align:right;">${escapeHtml(feeValue(0))}</td></tr>
      <tr><td style="padding:8px 0;color:#7b7288;">${es ? 'Firmado' : 'Signed'}</td><td style="padding:8px 0;font-weight:600;color:#241a33;text-align:right;">${escapeHtml(signedAt)} (UTC)</td></tr>
    </table>
    <p style="color:#4a4359;margin:0 0 8px;">${es
      ? 'Hoy no hay nada que pagar. Cada mes te envío una factura solo por los clientes nuevos que entraron por el sistema, según los tramos del acuerdo.'
      : 'There is nothing to pay today. Each month I send you an invoice only for the new clients the system brought in, at the tiers in the agreement.'}</p>
    <p style="color:#4a4359;margin:0 0 8px;">${es
      ? 'Para empezar necesito: tu cuenta de Claude Pro, acceso de administrador a tu página de Facebook, y la información de tu oferta y de lo que más les duele a tus clientes. Con eso reservamos la primera sesión.'
      : 'To start I need: your Claude Pro account, admin access to your Facebook page, and the details of your offer and what your clients struggle with most. With that we book the first session.'}</p>
    <p style="color:#4a4359;margin:0 0 24px;">${es ? 'Tu copia firmada va adjunta. Cualquier duda, responde a este correo o escríbeme.' : 'Your signed copy is attached. Any question, reply to this email or message me.'}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#25D366" style="background-color:#25D366;border-radius:100px;">
      <a href="${CONTACT_URL}" class="e-cta" style="display:inline-block;color:#ffffff;font-weight:700;font-size:15px;padding:14px 26px;border-radius:100px;text-decoration:none;">${es ? `Escribir a ${BRAND.owner}` : `Message ${BRAND.owner}`}</a>
    </td></tr></table>
    <p style="margin:32px 0 0;font-size:12px;color:#8b839a;">${BRAND.name} &middot; ${BRAND.email} &middot; ${BRAND.website.replace(/^https?:\/\//, '')}</p>
  </td></tr>
</table>`,
      })

      const clientHtml = documentShell({
        title: `Signed and confirmed: ${proposalRef || 'your agreement'}`,
        preview: `Your agreement for ${cleanTitle} is signed. Your first invoice follows separately.`,
        card: `
<table role="presentation" class="e-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#241a33;line-height:1.75;">
  <tr><td class="e-hpad" bgcolor="#212A4D" style="background-color:#212A4D;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <img src="${BRAND.website}/logo.png" width="64" height="64" alt="${BRAND.name}" style="border:0;border-radius:13px;display:block;margin:0 auto 12px;" />
    <div style="color:#c4b5fd;font-size:11px;font-weight:700;letter-spacing:3px;">${BRAND.name}</div>
  </td></tr>
  <tr><td class="e-body" bgcolor="#ffffff" style="background-color:#ffffff;padding:36px 32px;border:1px solid #ede8fb;border-top:none;border-radius:0 0 12px 12px;">
    <h2 style="font-size:22px;font-weight:800;color:#0f0020;margin:0 0 12px;">You are in, ${firstName}.</h2>
    <p style="color:#4a4359;margin:0 0 20px;">Your agreement for <strong>${eTitle}</strong> has been signed and received. Here is a summary of what we agreed to:</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">Reference</td><td style="padding:8px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${eRef}</td></tr>
      <tr><td style="padding:8px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">Client</td><td style="padding:8px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${eClientName}${clientCompany ? ` / ${eClientCompany}` : ''}</td></tr>
      <tr><td style="padding:8px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">Engagement</td><td style="padding:8px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${eTitle}</td></tr>
      <tr><td style="padding:8px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">${feeLabel}</td><td style="padding:8px 0;font-weight:700;color:#7C3AED;border-bottom:1px solid #f0eafc;text-align:right;">${escapeHtml(feeValue(monthlyAmount))}</td></tr>
      <tr><td style="padding:8px 0;color:#7b7288;">Signed</td><td style="padding:8px 0;font-weight:600;color:#241a33;text-align:right;">${escapeHtml(signedAt)} (UTC)</td></tr>
    </table>
    <p style="color:#4a4359;margin:0 0 8px;">Your first invoice is on its way in a separate email right now, with the payment details. Once it is settled, we get started.</p>
    <p style="color:#4a4359;margin:0 0 24px;">Questions in the meantime? Just reply to this email, or reach me on WhatsApp.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#25D366" style="background-color:#25D366;border-radius:100px;">
      <a href="${CONTACT_URL}" class="e-cta" style="display:inline-block;color:#ffffff;font-weight:700;font-size:15px;padding:14px 26px;border-radius:100px;text-decoration:none;">Message ${BRAND.owner}</a>
    </td></tr></table>
    <p style="margin:32px 0 0;font-size:12px;color:#8b839a;">${BRAND.name} &middot; ${BRAND.email} &middot; ${BRAND.website.replace(/^https?:\/\//, '')}</p>
  </td></tr>
</table>`,
      })

      const notifyHtml = documentShell({
        title: `Proposal signed: ${proposalRef}`,
        preview: `${clientName} signed ${cleanTitle}.`,
        card: `
<table role="presentation" class="e-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #ede8fb;border-radius:12px;padding:28px 32px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#241a33;line-height:1.7;">
    <h2 style="font-size:20px;color:#0f0020;margin:0 0 16px;">Proposal signed: ${eRef}</h2>
    <table role="presentation" style="border-collapse:collapse;font-size:14px;width:100%;">
      ${[
        ['Client', `${eClientName}${clientCompany ? ` / ${eClientCompany}` : ''}`],
        ['Email', eClientEmail],
        ['Signed by', `${eSignerName} (${eSignerEmail})`],
        ['Title', eTitle],
        [feeLabel, escapeHtml(feeValue(monthlyAmount))],
        ['Proposal ID', escapeHtml(proposalId ?? proposalRef)],
        ['Signed at', `${escapeHtml(signedAt)} (UTC)`],
      ].map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#7b7288;white-space:nowrap;">${k}</td><td style="padding:6px 0;font-weight:600;color:#241a33;">${v}</td></tr>`).join('')}
    </table>
    ${invoiceError
      ? `<p style="margin-top:20px;padding:14px 16px;background:#fff4f4;border:1px solid #f5c2c2;border-radius:8px;color:#8a1c1c;font-size:13px;line-height:1.6;"><strong>The invoice was NOT created and the client has not been billed.</strong><br>${escapeHtml(invoiceError)}<br><br>Their signed copy is attached and the agreement stands. Raise the invoice by hand: /os/proposals, open ${eRef}, then Convert to invoice.</p>`
      : !invoiceId
        ? `<p style="margin-top:20px;color:#8b839a;font-size:12px;">${results ? 'Paid by results: nothing was billed on signing. Each month, open this proposal in /os/proposals and use Invoice new clients to raise the commission as a draft.' : 'Nothing is due on signing, so no invoice was raised.'} Their signed copy is attached.</p>`
        : `<p style="margin-top:20px;color:#8b839a;font-size:12px;">First invoice ${invoiceNumber ? `(#${escapeHtml(invoiceNumber)}) ` : ''}was auto-generated and sent to the client. Their signed copy is attached. Manage it at /os/invoices.</p>`}
  </td></tr>
</table>`,
      })

      const eInvNum = escapeHtml(invoiceNumber ?? '')
      const eInvLabel = escapeHtml(scrubClientCopy(invoiceLabel) || 'First month retainer')
      const eBank = escapeHtml(bankInfo)
      const invDueLabel = longDate(invoiceDueStr, '')
      const invoiceHtml = documentShell({
        title: `Your first invoice from ${BRAND.name}`,
        preview: `${fmtMoney(monthlyAmount)}${invDueLabel ? `, due ${invDueLabel}` : ''}. Payment details inside.`,
        card: `
<table role="presentation" class="e-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#241a33;line-height:1.7;">
  <tr><td bgcolor="#212A4D" style="background-color:#212A4D;padding:26px 30px;border-radius:12px 12px 0 0;text-align:center;">
    <img src="${BRAND.website}/logo.png" width="56" height="56" alt="${BRAND.name}" style="border:0;border-radius:12px;display:block;margin:0 auto 10px;" />
    <div style="color:#c4b5fd;font-size:11px;font-weight:700;letter-spacing:2px;">Invoice${eInvNum ? ` #${eInvNum}` : ''}</div>
  </td></tr>
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:34px 30px;border:1px solid #ede8fb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="color:#4a4359;margin:0 0 20px;">Hi ${firstName}, here is your first invoice for <strong>${eTitle}</strong>.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:22px;">
      <tr><td style="padding:9px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">${eInvLabel}</td><td style="padding:9px 0;font-weight:700;color:#7C3AED;border-bottom:1px solid #f0eafc;text-align:right;">${escapeHtml(fmtMoney(monthlyAmount))}</td></tr>
      ${invDueLabel ? `<tr><td style="padding:9px 0;color:#7b7288;">Due</td><td style="padding:9px 0;font-weight:600;color:#241a33;text-align:right;">${escapeHtml(invDueLabel)}</td></tr>` : ''}
    </table>
    ${bankInfo ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;"><tr><td><div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#8b839a;margin-bottom:8px;">Payment details</div><div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#4a4359;white-space:pre-wrap;background:#faf8ff;border:1px solid #ede8fb;border-radius:8px;padding:14px 16px;line-height:1.8;">${eBank}</div></td></tr></table>` : ''}
    ${invoiceId ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px;"><tr><td bgcolor="#7C3AED" style="background-color:#7C3AED;border-radius:100px;"><a href="${BRAND.website}/invoice/${encodeURIComponent(invoiceId)}" style="display:inline-block;color:#ffffff;font-weight:700;font-size:15px;padding:14px 30px;border-radius:100px;text-decoration:none;">View and pay invoice</a></td></tr></table>` : ''}
    <p style="margin:0;font-size:12px;color:#8b839a;text-align:center;">Net 7. Late payments incur 2% monthly interest.</p>
    <p style="margin:6px 0 0;font-size:12px;color:#8b839a;text-align:center;">${BRAND.name} &middot; ${BRAND.email}</p>
  </td></tr>
</table>`,
      })

      const signedPdfBase64 = await buildSignedPdf(req, token, signerName || clientName, `${signedAt} (UTC)`)
      const refSlug = (proposalRef || 'agreement').replace(/[^A-Za-z0-9._-]+/g, '-')
      const signedAttachments = signedPdfBase64
        ? [{ filename: `Proposal-${refSlug}-signed.pdf`, content: signedPdfBase64 }]
        : undefined

      const kickName = (clientName || '').trim().split(/\s+/)[0] || 'there'
      const company = (clientCompany || '').trim()
      const forCompany = company ? ` for ${escapeHtml(company)}` : ''
      const kickoffHtml = documentShell({
        title: 'What I need from you to get started',
        preview: 'Your files, your domain and one subscription, so we can start.',
        card: `
    <p style="margin:0 0 16px;font-size:15.5px;line-height:1.7;color:#2f2a3d;">Hi ${escapeHtml(kickName)},</p>
    <p style="margin:0 0 16px;font-size:15.5px;line-height:1.7;color:#2f2a3d;">Thank you for signing, and thank you for the conversation. I really enjoyed hearing about${company ? ' ' + escapeHtml(company) : ' your business'} and I am looking forward to building this${forCompany}.</p>
    <p style="margin:0 0 20px;font-size:15.5px;line-height:1.7;color:#2f2a3d;">Here is everything I need from you so we can start. None of it is urgent today, but the sooner it arrives, the sooner your setup call turns into a finished site.</p>

    <div style="background:#faf8ff;border:1px solid #ede8fb;border-radius:10px;padding:20px 22px;margin:0 0 20px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;">1. Your images and videos</p>
      <p style="margin:0 0 10px;font-size:14.5px;line-height:1.65;color:#4a4459;">Photos of you, your space, your work, your team, and any video you would like on the site. I need the <strong>original full quality files</strong>, not anything already posted to Instagram or Facebook. Social platforms compress heavily, and a compressed photo looks soft and pixelated the moment it fills a laptop screen.</p>
      <p style="margin:0 0 10px;font-size:14.5px;line-height:1.65;color:#4a4459;"><strong>Please do not attach them to an email.</strong> Email silently shrinks images and will not carry video at all. Use one of these instead, both free:</p>
      <p style="margin:0 0 16px;font-size:14.5px;line-height:1.75;color:#4a4459;">
        <strong>Google Drive</strong> (best if you have a lot, or will send more later): go to <a href="https://drive.google.com" style="color:#7c3aed;font-weight:600;">drive.google.com</a>, make a new folder, drop everything in, then click Share, set it to <em>Anyone with the link</em>, and send me that link.<br>
        <strong>WeTransfer</strong> (easiest for a one off): go to <a href="https://wetransfer.com" style="color:#7c3aed;font-weight:600;">wetransfer.com</a>, drag your files in, enter my email, and send. No account needed.
      </p>

      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;">2. Your logo and brand files</p>
      <p style="margin:0 0 16px;font-size:14.5px;line-height:1.65;color:#4a4459;">If you have a logo, send the original file. If you have brand colours or fonts you already use, send those too. If you have none of this, that is completely fine and we will sort it on the call.</p>

      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;">3. Access to your domain</p>
      <p style="margin:0 0 10px;font-size:14.5px;line-height:1.65;color:#4a4459;">I need to point your web address at the finished site. <strong>Just reply and tell me where you bought the domain</strong>, for example GoDaddy, Namecheap, Squarespace, Google Domains or Hostinger, and I will send you the exact click by click steps for that company.</p>
      <p style="margin:0 0 16px;font-size:14.5px;line-height:1.65;color:#4a4459;">Most of them have an <em>invite a delegate</em> or <em>add user</em> option, which is safer than sharing a password and takes about a minute. If you would rather not give access at all, that is fine too: I will send you two settings to paste in yourself. And if you do not have a domain yet, say so and we will choose one together on the call.</p>

      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;">4. Access to your business email</p>
      <p style="margin:0 0 10px;font-size:14.5px;line-height:1.65;color:#4a4459;">For the build period only. This lets me create your hosting accounts in your name rather than mine, which is what makes the site genuinely yours at the end.</p>
      <p style="margin:0 0 16px;font-size:14.5px;line-height:1.65;color:#4a4459;">If you use Google Workspace, the simplest way is to add me as a delegate: open Gmail, click the gear icon, <em>See all settings</em>, then <em>Accounts</em>, then <em>Grant access to your account</em>, and add my address. I only ever use it to confirm the signup emails for your hosting. <strong>You can remove me the day we finish, in the same place, in one click.</strong></p>

      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;">5. A Claude subscription</p>
      <p style="margin:0 0 10px;font-size:14.5px;line-height:1.65;color:#4a4459;">This is the tool you will use to update your own site after our training session, and it is why you will never need to pay anyone for a small change again.</p>
      <p style="margin:0;font-size:14.5px;line-height:1.65;color:#4a4459;">Sign up at <a href="https://claude.ai/upgrade" style="color:#7c3aed;font-weight:600;">claude.ai/upgrade</a> and choose the <strong>Pro plan, about twenty dollars a month</strong>. Use the same professional email address as your website. You can do it any time before our training call, and it is the only tool you need.</p>
    </div>

    <p style="margin:0 0 16px;font-size:15.5px;line-height:1.7;color:#2f2a3d;"><strong>What happens next:</strong> once you have sent the files above, we book your setup call. About a week after that call your site is built, then we go through it together on the revision call, and finally I show you how to run it yourself.</p>
    <p style="margin:0 0 16px;font-size:15.5px;line-height:1.7;color:#2f2a3d;">Your invoice is in a separate email. You do not need to pay it before sending me the files, so feel free to start gathering them today.</p>
    <p style="margin:0 0 6px;font-size:15.5px;line-height:1.7;color:#2f2a3d;">Anything at all that is unclear, just reply to this email.</p>
    <p style="margin:0;font-size:15.5px;line-height:1.7;color:#2f2a3d;">${BRAND.owner}</p>`,
      })

      const sends = [
        sendEmail(key, {
          from: FROM,
          to: [clientEmail],
          reply_to: NOTIFY_EMAIL,
          subject: results && es ? `Firmado y confirmado: ${proposalRef || cleanTitle}` : `Signed and confirmed: ${proposalRef || cleanTitle}`,

          html: results
            ? resultsClientHtml
            : clientHtml.replace('</table>', '') + kickoffHtml.replace(/^[\s\S]*?<table/, '<table'),
          ...(signedAttachments ? { attachments: signedAttachments } : {}),
        }),
        sendEmail(key, {
          from: INTERNAL_FROM,
          to: [NOTIFY_EMAIL],
          subject: `Proposal signed: ${proposalRef || cleanTitle}, ${clientName || signerEmail}`,
          html: notifyHtml,
          ...(signedAttachments ? { attachments: signedAttachments } : {}),
        }),
      ]

      if (invoiceId) {
        sends.push(sendEmail(key, {
          from: FROM,
          to: [clientEmail],
          reply_to: NOTIFY_EMAIL,
          subject: `Your first invoice${invoiceNumber ? ` #${invoiceNumber}` : ''} from ${BRAND.name}`,
          html: invoiceHtml,
        }))
      }
      await Promise.allSettled(sends)
    }

    return NextResponse.json({ ok: true, invoiceNumber, invoiceId })
  } catch {
    return NextResponse.json({ error: 'Failed to process signature' }, { status: 500 })
  }
}
