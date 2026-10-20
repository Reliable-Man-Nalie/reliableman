import { NextRequest, NextResponse } from 'next/server'
import { channelTag } from '@/lib/lead-attribution'
import { detectSpam, SPAM_REJECTION } from '@/lib/anti-spam'
import { escapeHtml } from '@/lib/escape-html'
import {
  EMAIL_FROM, INTERNAL_FROM, OWNER_EMAIL, SITE_URL,
  detailRows, emailShell, quoteBlock,
} from '@/lib/email'
import { BRAND } from '@/lib/brand'
import { SPAM_TAG, leadVerdict } from '@/lib/apply-guard'
import { funnelIdFromPath, recordFunnelLead } from '@/lib/funnel-log'
import { sendCapiEvent } from '@/lib/meta-capi'

type LeadInput = {
  name?: string; email?: string; whatsapp?: string; business?: string
  message?: string; notes?: string; source?: string; quarantined?: boolean; spamReasons?: string[]
}

async function sendEmails(lead: LeadInput): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const send = (payload: Record<string, unknown>) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

  const firstName = (lead.name || '').trim().split(/\s+/)[0] || 'there'
  const clientHtml = emailShell({
    title: `Thanks, ${escapeHtml(firstName)}`,
    preview: 'We received your message.',
    body: `<p style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;">Thank you for reaching out to ${escapeHtml(BRAND.name)}. Your message is in and you will hear back personally, usually within one working day.</p>`,
    cta: { label: `Visit ${BRAND.name}`, href: SITE_URL },
  })

  const notifyHtml = emailShell({
    title: 'New lead',
    preview: `${lead.name || 'Unknown'}${lead.business ? `, ${lead.business}` : ''}`,
    showFooterLinks: false,
    body: detailRows([
      ['Name', lead.name],
      ['Business', lead.business],
      ['WhatsApp', lead.whatsapp],
      ['Email', lead.email],
      ['Source', lead.source],
    ])
      + quoteBlock('What they sent', lead.message || lead.notes || '')
      + (lead.quarantined
        ? `<p style="margin:0 0 10px;padding:10px 12px;border-radius:8px;background:#fdf2f2;color:#B42318;font-size:12.5px;font-weight:700;">Flagged as likely spam${lead.spamReasons?.length ? ` (${escapeHtml(lead.spamReasons.join(', '))})` : ''}. No auto-reply was sent. If this is a real person, reply yourself.</p>`
        : '')
      + `<p style="margin:0;font-size:12.5px;color:#8b839a;">It is on your pipeline at ${escapeHtml(SITE_URL)}/os/deals.</p>`,
  })

  await Promise.allSettled([
    lead.email && !lead.quarantined
      ? send({ from: EMAIL_FROM, to: [lead.email], reply_to: OWNER_EMAIL, subject: `Thanks for reaching out to ${BRAND.name}`, html: clientHtml })
      : Promise.resolve(),
    process.env.LEAD_NOTIFY_OFF === '1' || !OWNER_EMAIL
      ? Promise.resolve()
      : send({
        from: INTERNAL_FROM,
        to: [process.env.LEAD_NOTIFY_EMAIL || OWNER_EMAIL],
        subject: `${lead.quarantined ? '[Likely spam] ' : ''}New lead: ${lead.name || 'Unknown'}${lead.business ? ` (${lead.business})` : ''}`,
        html: notifyHtml,
      }),
  ])
}

// Lets the landing page on another domain post to this route.
// LEAD_ALLOWED_ORIGINS = comma-separated list, e.g. https://www.mysite.com,https://mysite.com
function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const allowed = (process.env.LEAD_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!origin || !allowed.includes(origin)) return {}
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  if (detectSpam(body).spam) {
    return NextResponse.json(SPAM_REJECTION.body, { status: SPAM_REJECTION.status, headers: corsHeaders(req) })
  }

  const { name, email, whatsapp, business, message, notes, eventId, fbp, fbc, pageUrl, source, visitorId, referrer } = body
  if (!name && !email && !whatsapp) return NextResponse.json({ error: 'missing contact' }, { status: 400, headers: corsHeaders(req) })

  let verdict: ReturnType<typeof leadVerdict>
  try {
    verdict = leadVerdict({ name, business, email }, body)
  } catch {
    verdict = { level: 'clean', reasons: [] }
  }
  const isSpam = verdict.level === 'spam'

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  const userAgent = req.headers.get('user-agent') ?? ''

  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('host') ?? ''
  const crm = fetch(`${proto}://${host}/api/crm-lead`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, email, whatsapp, company: business, source: source || 'website form',
      notes: notes || message || undefined,
      tags: (() => {
        const t: string[] = Array.isArray(body.tags) ? body.tags.filter((x: unknown): x is string => typeof x === 'string' && x.length <= 40).slice(0, 8) : []
        if (isSpam) t.push(SPAM_TAG)
        const ch = channelTag({ fbc, pageUrl, referrer })
        if (ch) t.push(ch)
        return t.length ? t : undefined
      })(),
      spamReasons: isSpam ? verdict.reasons : undefined,
      visitorId, pageUrl, referrer,
      countedByCaller: true,
    }),
  }).catch(() => {})

  await Promise.allSettled([
    crm,
    isSpam ? Promise.resolve() : sendCapiEvent({
      eventName: 'Lead',
      eventId: typeof eventId === 'string' && eventId ? eventId : `lead-${Date.now()}`,
      email, name, phone: whatsapp, ip, userAgent,
      fbp: fbp || req.cookies.get('_fbp')?.value,
      fbc: fbc || req.cookies.get('_fbc')?.value,
      pageUrl: pageUrl || req.headers.get('referer') || undefined,
      customData: { content_name: source || 'website form' },
    }).catch(() => {}),
    sendEmails({ name, email, whatsapp, business, message, notes, source, quarantined: isSpam, spamReasons: verdict.reasons }).catch(() => {}),
    isSpam ? Promise.resolve() : recordFunnelLead({
      funnelId: funnelIdFromPath(pageUrl || req.headers.get('referer'), source),
      visitorId, path: pageUrl, referrer,
    }),
  ])
  return NextResponse.json({ ok: true }, { headers: corsHeaders(req) })
}
