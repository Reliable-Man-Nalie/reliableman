import { escapeHtml } from './escape-html'
import { BRAND } from './brand'

export const SITE_URL = BRAND.website

export const APPLY_URL = BRAND.website
export const APPLY_LABEL = `Visit ${BRAND.name}`

export const EMAIL_FROM = process.env.EMAIL_FROM || `${BRAND.name} <onboarding@resend.dev>`

export const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || BRAND.email

export const OWNER_EMAIL = process.env.OWNER_EMAIL || BRAND.email
export const WHATSAPP_URL = BRAND.phone ? `https://wa.me/${BRAND.phone.replace(/[^0-9]/g, '')}` : BRAND.website
export const LOGO_URL = /^https?:/.test(BRAND.logo) ? BRAND.logo : `${SITE_URL}${BRAND.logo.startsWith('/') ? '' : '/'}${BRAND.logo}`

const FROM_ADDRESS = (EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? EMAIL_FROM).trim()

export const INTERNAL_FROM = process.env.EMAIL_FROM_INTERNAL || `${BRAND.name} System <${FROM_ADDRESS}>`

function isOwnerInbox(to: string): boolean {
  const t = to.trim().toLowerCase()
  return [OWNER_EMAIL, process.env.LEAD_NOTIFY_EMAIL ?? '']
    .some(o => o && o.trim().toLowerCase() === t)
}

export function fromFor(to: string): string {
  return isOwnerInbox(to) ? INTERNAL_FROM : EMAIL_FROM
}

const REPLY_TO = EMAIL_REPLY_TO

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[email] RESEND_API_KEY is not set, nothing was sent')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromFor(to), to: [to], ...(REPLY_TO ? { reply_to: REPLY_TO } : {}), subject, html }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[email] Resend refused ${res.status} sending to ${to}: ${body.slice(0, 300)}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] send threw', err)
    return false
  }
}

export function money(value: unknown, currency = 'USD', fallback = ''): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  const code = /^[A-Za-z]{3}$/.test(String(currency || '')) ? String(currency).toUpperCase() : 'USD'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: 2 }).format(n)
  } catch {
    return `${code} ${n.toFixed(2)}`
  }
}

export function moneyRounded(value: unknown, currency = 'USD', fallback = ''): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  const code = /^[A-Za-z]{3}$/.test(String(currency || '')) ? String(currency).toUpperCase() : 'USD'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${code} ${Math.round(n)}`
  }
}

export function longDate(value: unknown, fallback = ''): string {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback

  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00Z`) : new Date(raw)
  if (Number.isNaN(d.getTime())) return fallback
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function shortDate(value: unknown, fallback = ''): string {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00Z`) : new Date(raw)
  if (Number.isNaN(d.getTime())) return fallback
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function weekdayDate(value: unknown, fallback = ''): string {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00Z`) : new Date(raw)
  if (Number.isNaN(d.getTime())) return fallback
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function firstNameOf(fullName: unknown, fallback = 'there'): string {
  const first = String(fullName ?? '').trim().split(/\s+/)[0]
  return first || fallback
}

export function orDash(value: unknown, fallback = 'Not given'): string {
  const s = String(value ?? '').trim()
  return s && s !== 'undefined' && s !== 'null' ? s : fallback
}

const PARTNER_NAMES = /(?!)/

export function scrubClientCopy(value: unknown): string {
  const raw = String(value ?? '')
  if (!raw.trim()) return ''
  const cleaned = raw
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !PARTNER_NAMES.test(sentence))
    .join(' ')
  return cleaned
    .replace(/\s*—\s*/g, ', ')
    .replace(/(\d)\s*–\s*(\d)/g, '$1 to $2')
    .replace(/\s*–\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim()
}

const TEXT = '#181A2A'
const MUTED = '#4C4F63'
const FAINT = '#6E7186'
const CARD = '#FFFFFF'
const PAGE = '#F3F0EA'
const LINE = '#E2DFD8'
const HEAD_BG = '#212A4D'
const ACCENT = '#7C3AED'

const ON_NAVY = '#C9A6FF'

export function preheader(text: string): string {
  return `<div style="display:none;font-size:1px;color:${CARD};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${'&#8199;&#65279;&#847; '.repeat(30)}</div>`
}

export type EmailCta = { label: string; href: string }

export function button(cta: EmailCta): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 8px;">
  <tr><td bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:12px;">
    <a href="${cta.href}" class="e-btn" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(cta.label)}</a>
  </td></tr>
</table>`
}

export function linkLine(label: string, href: string): string {
  return `<p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">${escapeHtml(label)}</p>
<p style="margin:0 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;color:${ACCENT};word-break:break-all;">${href}</p>`
}

export function signature(): string {
  return `<p style="margin:26px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:${TEXT};">Kind regards,<br><strong>${escapeHtml(BRAND.owner)}</strong><br><span style="color:${MUTED};font-size:13.5px;">${escapeHtml(BRAND.name)}</span></p>`
}

export function detailRows(rows: Array<[string, unknown]>): string {
  const body = rows
    .filter(([, v]) => String(v ?? '').trim())
    .map(([k, v]) => `<tr>
      <td class="e-row-label" style="padding:7px 16px 7px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${FAINT};vertical-align:top;">${escapeHtml(k)}</td>
      <td class="e-row-value" style="padding:7px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${TEXT};">${escapeHtml(String(v))}</td>
    </tr>`)
    .join('')
  return body ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:0 0 20px;">${body}</table>` : ''
}

export function quoteBlock(label: string, text: string): string {
  if (!String(text ?? '').trim()) return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
  <tr><td bgcolor="${PAGE}" style="background-color:${PAGE};border:1px solid ${LINE};border-left:3px solid ${ACCENT};border-radius:0 10px 10px 0;padding:14px 16px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10.5px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${FAINT};margin-bottom:6px;">${escapeHtml(label)}</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:${TEXT};white-space:pre-wrap;">${escapeHtml(text)}</div>
  </td></tr>
</table>`
}

export type ShellOptions = {

  title: string

  preview: string

  body: string
  cta?: EmailCta

  note?: string

  showFooterLinks?: boolean
}

export function emailShell(o: ShellOptions): string {
  const cta = o.cta ? button(o.cta) : ''
  const note = o.note
    ? `<p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.7;color:${FAINT};">${o.note}</p>`
    : ''
  const footerLinks = o.showFooterLinks === false
    ? ''
    : `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};margin-bottom:6px;">
         <a href="${SITE_URL}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(SITE_URL.replace(/^https?:\/\//, ''))}</a>
       </div>`

  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:light;supported-color-schemes:light;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(o.title)}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  body, table, td, div, p, a, h1, h2, h3 { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  /* MOST OF THESE ARE READ ON A PHONE, ON THE DAY, standing up. Everything
     below exists because of how mail clients actually behave on small screens,
     not because of how the desktop preview looks. */
  @media only screen and (max-width:620px) {
    .e-card { width:100% !important; border-radius:0 !important; }
    .e-pad  { padding-left:20px !important; padding-right:20px !important; }
    /* A button 44px tall is a miss with a real thumb, and the join link is the
       only thing some of these emails exist to deliver. */
    .e-btn  { display:block !important; width:100% !important; box-sizing:border-box !important;
              padding-top:18px !important; padding-bottom:18px !important; font-size:17px !important; }
    /* Two-column label/value rows collapse into unreadable slivers at 320px. */
    .e-row-label { display:block !important; width:100% !important; padding:0 0 2px !important; }
    .e-row-value { display:block !important; width:100% !important; padding:0 0 12px !important; }
    h1, .e-title { font-size:22px !important; line-height:1.25 !important; }
  }
  /* Long URLs and addresses push the whole card sideways otherwise, and a
     horizontally scrolling email reads as broken. */
  a, p, td { word-break:break-word; overflow-wrap:break-word; }
</style>
</head>
<body bgcolor="${PAGE}" style="margin:0;padding:0;width:100%;background-color:${PAGE};color:${TEXT};font-family:Helvetica,Arial,sans-serif;">
${preheader(o.preview)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE}" style="background-color:${PAGE};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" class="e-card" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:${CARD};border-radius:20px;border:1px solid ${LINE};">

      <tr><td bgcolor="${HEAD_BG}" class="e-pad" style="background-color:${HEAD_BG};padding:32px 36px;border-radius:20px 20px 0 0;text-align:center;">
        <img src="${LOGO_URL}" width="52" height="52" alt="${escapeHtml(BRAND.name)}" style="display:block;margin:0 auto 6px;border:0;border-radius:11px;" />
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;margin-bottom:10px;font-weight:800;">${escapeHtml(BRAND.name)}</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:800;line-height:1.3;color:#ffffff;">${escapeHtml(o.title)}</div>
      </td></tr>

      <tr><td bgcolor="${CARD}" class="e-pad" style="background-color:${CARD};padding:32px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.75;color:${TEXT};">
        ${o.body}
        ${cta}
        ${note}
      </td></tr>

      <tr><td bgcolor="${PAGE}" class="e-pad" style="background-color:${PAGE};padding:20px 36px;text-align:center;border-top:1px solid ${LINE};border-radius:0 0 20px 20px;">
        ${footerLinks}
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:11.5px;color:${FAINT};">
          ${escapeHtml(BRAND.name)}${EMAIL_REPLY_TO ? ` &middot; <a href="mailto:${EMAIL_REPLY_TO}" style="color:${ACCENT};text-decoration:none;">${EMAIL_REPLY_TO}</a>` : ''}${BRAND.address ? `<br>${escapeHtml(BRAND.address)}` : ''}
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

export function documentShell(o: { title: string; preview: string; card: string }): string {
  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:light;supported-color-schemes:light;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(o.title)}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  body, table, td, div, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  @media only screen and (max-width:640px) {
    .e-wrap { width:100% !important; }
    .e-hpad { padding:22px 20px !important; }
    .e-body { padding:24px 20px !important; }
    .e-num { font-size:17px !important; }
    .e-brand { font-size:15px !important; }
    .e-cta { display:block !important; width:100% !important; box-sizing:border-box !important; }
  }
</style>
</head>
<body bgcolor="${PAGE}" style="margin:0;padding:0;width:100%;background-color:${PAGE};color:${TEXT};font-family:Helvetica,Arial,sans-serif;">
${preheader(o.preview)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE}" style="background-color:${PAGE};">
  <tr><td align="center" style="padding:32px 16px;">${o.card}</td></tr>
</table>
</body>
</html>`
}

export function wrapEmail(title: string, bodyHtml: string, cta?: EmailCta, preview?: string): string {
  return emailShell({ title, preview: preview || title, body: bodyHtml, cta })
}
