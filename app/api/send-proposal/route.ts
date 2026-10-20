import { BRAND } from '@/lib/brand'
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'
import { escapeHtml } from '@/lib/escape-html'
import { EMAIL_FROM, OWNER_EMAIL, SITE_URL, documentShell, scrubClientCopy } from '@/lib/email'

export const runtime = 'nodejs'

const FROM = EMAIL_FROM
const NOTIFY_EMAIL = OWNER_EMAIL
const SITE = SITE_URL

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { token, ref, clientName, clientEmail, clientCompany, title } = body

    if (!token || !clientEmail) return NextResponse.json({ error: 'missing token or clientEmail' }, { status: 400 })

    const key = process.env.RESEND_API_KEY
    if (!key) return NextResponse.json({ ok: true, skipped: 'no key' })

    const signingLink = `${SITE}/proposal/${encodeURIComponent(String(token))}`

    const safeName = String(clientName ?? '').trim()
    const firstName = escapeHtml(safeName.split(/\s+/)[0] || 'there')
    const eRef = escapeHtml(String(ref ?? '').trim())
    const eTitle = escapeHtml(scrubClientCopy(title) || 'your proposal')
    const eCompany = escapeHtml(String(clientCompany ?? '').trim())

    const card = `
<table role="presentation" class="e-wrap" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:640px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#241a33;line-height:1.7;">
  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#12002a" style="background-color:#12002a;border-radius:12px 12px 0 0;">
      <tr>
        <td class="e-hpad" style="padding:28px 32px;" valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="padding-right:14px;">
              <img src="${SITE}/logo.png" width="52" height="52" alt="${BRAND.name}" style="display:block;border:0;border-radius:11px;" />
            </td>
            <td valign="middle">
              <div class="e-brand" style="color:#ffffff;font-weight:800;font-size:16px;line-height:1.2;">${BRAND.name}</div>
              <div style="color:#c4b5fd;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Service proposal</div>
            </td>
          </tr></table>
        </td>
        ${eRef ? `<td class="e-hpad" style="padding:28px 32px;text-align:right;" valign="middle" align="right">
          <div style="color:#ffffff;font-weight:800;font-size:20px;line-height:1.2;">${eRef}</div>
        </td>` : ''}
      </tr>
    </table>
  </td></tr>

  <tr><td class="e-body" bgcolor="#ffffff" style="background-color:#ffffff;padding:36px;border:1px solid #ede8fb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 20px;font-size:15px;color:#0f0020;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;font-size:14.5px;color:#4a4359;line-height:1.75;">
      I have put together a proposal for ${eCompany ? `<strong>${eCompany}</strong>` : 'you'}, <strong>${eTitle}</strong>.
      The full scope, the payment schedule and the terms are on the page behind the button.
    </p>
    <p style="margin:0 0 8px;font-size:14.5px;color:#4a4359;line-height:1.75;">
      When you are ready, you can sign directly on that page. I am notified the moment you do, your first invoice goes out with the payment details, and we begin as soon as it is settled.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 30px;">
      <tr><td bgcolor="#7b2fff" style="background-color:#7b2fff;border-radius:100px;">
        <a href="${signingLink}" class="e-cta" style="display:inline-block;color:#ffffff;font-weight:700;font-size:15px;padding:16px 36px;border-radius:100px;text-decoration:none;letter-spacing:0.2px;">Review and sign the proposal</a>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#5f5670;margin:0 0 6px;">Or copy this link into your browser:</p>
    <p style="font-size:12.5px;color:#7b2fff;margin:0 0 28px;word-break:break-all;">${signingLink}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #f0eafc;">
      <tr><td style="padding-top:20px;">
        <p style="font-size:13px;color:#5f5670;margin:0 0 4px;">Questions? Reply to this email and it comes straight back to me.</p>
        <p style="font-size:13.5px;color:#241a33;margin:0;font-weight:600;">${BRAND.owner} &middot; ${BRAND.name}</p>
        <p style="font-size:12px;color:#8b839a;margin:4px 0 0;">${BRAND.email} &middot; ${BRAND.website.replace(/^https?:\/\//, '')}</p>
      </td></tr>
    </table>
  </td></tr>
</table>`

    const html = documentShell({
      title: `Your proposal from ${BRAND.name}`,
      preview: `${scrubClientCopy(title) || 'Your proposal'}. Review, then sign on the page.`,
      card,
    })

    const sends = [
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [clientEmail],
          reply_to: NOTIFY_EMAIL,
          subject: `Your proposal from ${BRAND.name}${title ? `: ${scrubClientCopy(title)}` : ''}`,
          html,
        }),
      }),

    ]

    await Promise.allSettled(sends)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to send proposal' }, { status: 500 })
  }
}
