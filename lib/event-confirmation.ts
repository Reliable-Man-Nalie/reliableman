import { personalReasonLine, applyTemplate } from '@/lib/event-email-defaults'
import { escapeHtml } from '@/lib/escape-html'
import { eventTimeRangesLine } from '@/lib/event-time'
import { EVENT_WHATSAPP_URL, isCommunityLinkSet, COMMUNITY_BODY, COMMUNITY_CTA } from '@/lib/event-community'
import { BRAND } from '@/lib/brand'
import { SITE_URL, detailRows, emailShell, signature, weekdayDate } from '@/lib/email'

export function isPaidEvent(event: { price?: unknown }): boolean {
  return Number(event?.price) > 0
}

function defaultConfirmationBody(vars: { name: string; eventTitle: string; date: string; time: string; joinUrl: string; ticketCode: string; eventUrl: string; notes?: string }): string {

  const group = isCommunityLinkSet()
    ? `<div style="background:#f1fbf5;border:1px solid #b7e4c7;border-radius:12px;padding:20px 22px;margin:0 0 22px;">
  <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1f8a5b;text-transform:uppercase;letter-spacing:1px;">Do this now</p>
  <p style="margin:0 0 12px;font-size:14.5px;line-height:1.65;color:#4a4459;">${COMMUNITY_BODY}</p>
  <a href="${EVENT_WHATSAPP_URL}" style="display:inline-block;background:#25D366;color:#042a14;font-weight:800;font-size:15px;padding:13px 26px;border-radius:999px;text-decoration:none;">${COMMUNITY_CTA}</a>
</div>`
    : ''

  const join = vars.joinUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 24px;">
  <tr><td bgcolor="#7C3AED" style="background-color:#7C3AED;border-radius:12px;">
    <a href="${vars.joinUrl}" style="display:inline-block;padding:17px 42px;font-family:Helvetica,Arial,sans-serif;font-size:16.5px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">Join the call</a>
  </td></tr>
</table>
<p style="margin:0 0 22px;text-align:center;font-size:13px;color:#8b839a;">Same link on the day. Save this email.</p>`
    : `<p style="margin:0 0 20px;">The joining link follows by email before we start.</p>`

  return `<p style="margin:0 0 16px;">Hi ${vars.name},</p>
<p style="margin:0 0 14px;">Your seat for <strong>${vars.eventTitle}</strong> is confirmed.</p>
${personalReasonLine(vars.notes)}

${detailRows([['Date', vars.date], ['Time', vars.time]])}
${group}
${join}
<p style="margin:0 0 20px;">Questions before the day can go straight back to this email, it reaches a real person.</p>

<div style="background:#F3F0EA;border:1px solid #e7dffb;border-radius:10px;padding:16px 18px;margin:0 0 20px;">
  <p style="margin:0;font-size:14px;line-height:1.65;color:#4a4459;">One small favour: if this landed in <strong>spam or promotions</strong>, please mark it as <strong>not spam</strong> and add this address to your contacts. That is what makes sure the reminder before we go live actually reaches you.</p>
</div>
`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventRow = any

export function buildRegistrantConfirmation(
  event: EventRow,
  who: { name: string; ticketCode: string; notes?: string },
): { subject: string; html: string } {

  const eTitle = escapeHtml(event.title || 'Event')
  const vars = {
    name: escapeHtml(who.name),
    eventTitle: eTitle,
    date: escapeHtml(weekdayDate(event.date, 'Date to be confirmed')),

    time: escapeHtml(
      eventTimeRangesLine(String(event.date || ''), String(event.time || '').trim(), String(event.end_time || event.endTime || '').trim() || undefined, String(event.timezone || BRAND.timeZone))
        || String(event.time || '').trim()
        || 'Time to be confirmed'
    ),

    joinUrl: (String(event.location_name || '').match(/https?:\/\/[^\s<"']+/) ?? [''])[0],
    ticketCode: escapeHtml(who.ticketCode),

    eventUrl: `${SITE_URL}/events/${encodeURIComponent(String(event.slug || '').trim())}`,
  }

  const templated = String(event.email_confirmation || '').trim()
  const body =
    (templated ? applyTemplate(templated, vars) : defaultConfirmationBody({ ...vars, notes: who.notes }))
    + signature()

  return {
    subject: `You are registered: ${event.title}`,
    html: emailShell({
      title: event.title || 'You are registered',
      preview: `Ticket ${who.ticketCode} \u00b7 ${String(vars.date)} \u00b7 ${String(vars.time)}`,
      body,
    }),
  }
}
