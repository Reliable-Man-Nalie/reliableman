import { detailRows, signature, button } from './email'
import { EVENT_WHATSAPP_URL, isCommunityLinkSet, COMMUNITY_CTA } from './event-community'

export function applyTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{{${k}}}`, v), template)
}

const REASON_PHRASES: Record<string, string> = {
  'Build a website for my own business': 'a website for your own business',
  'Get more clients': 'more clients',
  'Automate my business with AI': 'your business automated with AI',
  'Start a business from scratch': 'to start a business from scratch',
  'Sharpen my brand and message': 'a sharper brand and message',
  'Learn how to actually use AI': 'to finally use AI properly',

  'Learn a skill and build freedom': 'a skill that builds your freedom',
}

export function personalReasonLine(notes?: string, when: 'before' | 'after' = 'before'): string {
  try {
    const m = (notes || '').match(/Why they are coming: ([^\n]+)/)
    if (!m) return ''
    const phrases = m[1].split(',').map(x => x.trim()).map(r => REASON_PHRASES[r]).filter(Boolean)
    if (!phrases.length) return ''
    const list = phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
    return when === 'before'
      ? `<p style="margin:0 0 20px;">You told me you are here for <strong>${list}</strong>. That is exactly what this hour is built for, so bring it.</p>`
      : `<p style="margin:0 0 20px;">You came for <strong>${list}</strong>. If the hour moved you closer to it, I want to hear about it.</p>`
  } catch {
    return ''
  }
}

export function programBlock(): string {
  return ''
}

function communityBlock(tone: 'now' | 'day'): string {
  if (!isCommunityLinkSet()) return ''
  const line = tone === 'now'
    ? 'Everyone attending is in the WhatsApp group. That is where the joining link goes on the day, and where I answer questions before we start.'
    : 'Not in the group yet? That is where I post everything on the day, including the link.'
  return `<div style="background:#f1fbf5;border:1px solid #b7e4c7;border-radius:12px;padding:18px 20px;margin:0 0 22px;text-align:center;">
  <p style="margin:0 0 12px;font-size:14.5px;line-height:1.65;color:#4a4459;">${line}</p>
  <a href="${EVENT_WHATSAPP_URL}" class="e-btn" style="display:inline-block;background:#25D366;color:#042a14;font-weight:800;font-size:15px;padding:13px 26px;border-radius:999px;text-decoration:none;">${COMMUNITY_CTA}</a>
</div>`
}

export function defaultConfirmationBody(vars: { name: string; eventTitle: string; date: string; time: string; location: string; ticketCode: string; eventUrl: string }): string {
  return `<p style="margin:0 0 16px;">Hi ${vars.name},</p>
<p style="margin:0 0 14px;">Your seat for <strong>${vars.eventTitle}</strong> is confirmed.</p>
<p style="margin:0 0 20px;">One hour, live: the one AI skill that builds, automates and scales a business. Come with the one thing you are stuck on.</p>

${detailRows([['Date', vars.date], ['Time', vars.time], ['Where', vars.location], ['Ticket', vars.ticketCode]])}
${communityBlock('now')}
<p style="margin:0 0 20px;">Full details are on <a href="${vars.eventUrl}" style="color:#7c3aed;font-weight:600;">your event page</a>, and questions before the day can go straight back to this email, it reaches a real person.</p>
`
}

export function defaultReminderBody(vars: { name: string; eventTitle: string; date: string; time: string; joinUrl: string; notes?: string }, hoursBefore: number): string {

  const lead = hoursBefore >= 24
    ? `<strong>${vars.eventTitle}</strong> is tomorrow.`
    : hoursBefore >= 8
    ? `<strong>${vars.eventTitle}</strong> is today.`
    : hoursBefore >= 4
    ? `<strong>${vars.eventTitle}</strong> starts in a few hours.`
    : hoursBefore >= 2
    ? `<strong>${vars.eventTitle}</strong> starts soon, just a couple hours away.`
    : `<strong>${vars.eventTitle}</strong> starts in about an hour.`

  const join = vars.joinUrl ? button({ label: 'Join the call', href: vars.joinUrl }) : ''

  const group = communityBlock('day')

  return `<p style="margin:0 0 16px;">Hi ${vars.name},</p>
<p style="margin:0 0 20px;">${lead}</p>
${personalReasonLine(vars.notes)}
${detailRows([['Date', vars.date], ['Time', vars.time]])}
${join}
${group}
<p style="margin:0 0 16px;">Come with the one thing you are stuck on. That is what makes a live room worth the seat.</p>
${signature()}`
}

export function defaultFollowUpBody(vars: { name: string; eventTitle: string; notes?: string }): string {
  return `<p style="margin:0 0 16px;">Hi ${vars.name},</p>
${personalReasonLine(vars.notes, 'after')}
<p style="margin:0 0 20px;">Thank you for being in the room for <strong>${vars.eventTitle}</strong>. If anything you heard is already turning into action, reply to this email and tell me what it is, that is genuinely the best part of running these.</p>
<p style="margin:0 0 20px;">If you want to keep going with a group around you, reply to this email and I will tell you how the program works.</p>
${communityBlock('day')}
${signature()}`
}
