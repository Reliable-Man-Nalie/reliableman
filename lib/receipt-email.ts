import { BRAND } from '@/lib/brand'
import { escapeHtml } from '@/lib/escape-html'
import { SITE_URL, documentShell, longDate, money, scrubClientCopy } from '@/lib/email'

export interface ReceiptEmailInput {
  invoiceId: string

  number: string
  clientName: string

  clientEmail: string
  clientCompany?: string
  projectTitle?: string

  method: string
  amountPaid: number
  currency: string

  paidAt: string
}

export const receiptNumber = (invoiceNumber: string) => invoiceNumber ? `R-${invoiceNumber}` : 'R-0000'

const fmt = (n: number, currency: string) => money(n, currency, money(0, currency))
const fmtDate = (d: string) => longDate(d, longDate(new Date().toISOString(), ''))

export function buildReceiptEmail(input: ReceiptEmailInput): { receiptHtml: string; notifyHtml: string } {
  const {
    invoiceId, number, clientName, clientEmail, clientCompany = '', projectTitle = '',
    method, amountPaid, currency, paidAt,
  } = input

  const SITE = SITE_URL
  const rNo = receiptNumber(number)
  const firstName = escapeHtml((clientName || 'there').split(' ')[0])
  const eClientName = escapeHtml(clientName)
  const eClientCompany = escapeHtml(clientCompany)

  const cleanProject = scrubClientCopy(projectTitle)
  const eProject = escapeHtml(cleanProject)
  const eRNo = escapeHtml(rNo)
  const eNumber = escapeHtml(number || 'pending')
  const eMethod = escapeHtml(method)
  const paidDate = fmtDate(paidAt)

  const receiptHtml = documentShell({
    title: `Receipt ${rNo}`,
    preview: `${fmt(amountPaid, currency)} received on ${paidDate}. Receipt attached.`,
    card: `
<table role="presentation" class="e-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#241a33;line-height:1.7;">
  <tr><td class="e-hpad" bgcolor="#0d3d1e" style="background-color:#0d3d1e;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <img src="${SITE}/logo.png" width="60" height="60" alt="${BRAND.name}" style="border:0;border-radius:13px;display:block;margin:0 auto 12px;" />
    <div style="display:inline-block;border:2px solid #4ade80;color:#4ade80;border-radius:8px;padding:5px 16px;font-size:15px;font-weight:800;letter-spacing:3px;">PAID</div>
  </td></tr>
  <tr><td class="e-body" bgcolor="#ffffff" style="background-color:#ffffff;padding:36px 32px;border:1px solid #d1fae5;border-top:none;border-radius:0 0 12px 12px;">
    <h2 style="font-size:22px;font-weight:800;color:#0f0020;margin:0 0 8px;">Payment received, thank you ${firstName}.</h2>
    <p style="color:#4a4359;margin:0 0 22px;">This is your official receipt for ${cleanProject ? `<strong>${eProject}</strong>` : `invoice #${eNumber}`}. Keep it for your bookkeeping.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:24px;">
  <tr><td style="padding:9px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">Receipt no.</td><td style="padding:9px 0;font-weight:700;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${eRNo}</td></tr>
  <tr><td style="padding:9px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">For invoice</td><td style="padding:9px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">#${eNumber}</td></tr>
  <tr><td style="padding:9px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">Client</td><td style="padding:9px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${eClientName}${clientCompany ? ` / ${eClientCompany}` : ''}</td></tr>
  <tr><td style="padding:9px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">Payment method</td><td style="padding:9px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${eMethod}</td></tr>
  <tr><td style="padding:9px 0;color:#7b7288;border-bottom:1px solid #f0eafc;">Paid on</td><td style="padding:9px 0;font-weight:600;color:#241a33;border-bottom:1px solid #f0eafc;text-align:right;">${escapeHtml(paidDate)}</td></tr>
  <tr><td style="padding:12px 0;color:#0d3d1e;font-weight:800;font-size:15px;">Amount paid</td><td style="padding:12px 0;font-weight:800;color:#16a34a;font-size:18px;text-align:right;">${fmt(amountPaid, currency)}</td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;">
  <tr><td bgcolor="#16a34a" style="background-color:#16a34a;border-radius:100px;">
    <a href="${SITE}/receipt/${encodeURIComponent(invoiceId)}" class="e-cta" style="display:inline-block;color:#ffffff;font-weight:700;font-size:15px;padding:14px 30px;border-radius:100px;text-decoration:none;">View and download receipt</a>
  </td></tr>
    </table>
    <p style="color:#5f5670;margin:0 0 4px;font-size:13.5px;">Your receipt is also attached to this email as a PDF. If you need anything else, just reply here.</p>
    <p style="margin:28px 0 0;font-size:12px;color:#8b839a;">${BRAND.name} &middot; ${BRAND.email} &middot; ${BRAND.website.replace(/^https?:\/\//, '')}</p>
  </td></tr>
</table>`,
  })

  const notifyHtml = documentShell({
    title: `Receipt sent: ${rNo}`,
    preview: `${clientName || clientEmail}, ${fmt(amountPaid, currency)}`,
    card: `
<table role="presentation" class="e-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #ede8fb;border-radius:12px;padding:28px 32px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#241a33;line-height:1.7;">
    <h2 style="font-size:20px;color:#0f0020;margin:0 0 16px;">Receipt sent: ${eRNo}</h2>
    <table role="presentation" style="border-collapse:collapse;font-size:14px;width:100%;">
  ${[
    ['Client', `${eClientName}${clientCompany ? ` / ${eClientCompany}` : ''}`],
    ['Invoice', `#${eNumber}`],
    ['Amount paid', fmt(amountPaid, currency)],
    ['Method', eMethod],
    ['Paid on', escapeHtml(paidDate)],
  ].map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#7b7288;white-space:nowrap;">${k}</td><td style="padding:6px 0;font-weight:600;color:#241a33;">${v}</td></tr>`).join('')}
    </table>
    <p style="margin-top:18px;color:#8b839a;font-size:12px;">The client has been emailed their receipt. A copy is attached here for your records.</p>
  </td></tr>
</table>`,
  })

  return { receiptHtml, notifyHtml }
}
