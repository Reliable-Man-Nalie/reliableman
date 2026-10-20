import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'
import { EMAIL_FROM, OWNER_EMAIL } from '@/lib/email'
import { buildReceiptEmail, receiptNumber } from '@/lib/receipt-email'

export const runtime = 'nodejs'
export const maxDuration = 60

const FROM = EMAIL_FROM
const NOTIFY_EMAIL = OWNER_EMAIL

async function buildReceiptPdf(req: NextRequest, id: string, method: string): Promise<string | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`
    const q = new URLSearchParams({ id, method })
    const res = await fetch(`${base}/api/receipt-pdf?${q.toString()}`)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  } catch {
    return null
  }
}

function sendEmail(key: string, payload: Record<string, unknown>) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function POST(req: NextRequest) {

  const secret = process.env.CRON_SECRET
  const internal = !!secret && req.headers.get('x-internal-secret') === secret
  if (!internal && !(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const invoiceId: string = typeof body.invoiceId === 'string' ? body.invoiceId : ''
    const method: string = (typeof body.method === 'string' && body.method.trim() ? body.method.trim() : 'Manual payment').slice(0, 40)

    let bodyPaidAt: string | null = null
    if (typeof body.paidAt === 'string' && body.paidAt.trim()) {
      const t = new Date(body.paidAt).getTime()
      if (Number.isFinite(t) && t <= Date.now() + 86_400_000) bodyPaidAt = new Date(t).toISOString()
    }
    if (!invoiceId) return NextResponse.json({ error: 'missing invoiceId' }, { status: 400 })

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!sbUrl || !sbKey) return NextResponse.json({ error: 'supabase not configured' }, { status: 500 })
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(sbUrl, sbKey)

    const { data: inv, error } = await sb.from('invoices').select('*').eq('id', invoiceId).single()
    if (error || !inv) return NextResponse.json({ error: 'invoice not found' }, { status: 404 })

    const number: string = inv.number ?? ''
    const clientName: string = inv.client_name ?? ''
    const clientEmail: string = inv.client_email ?? ''
    const clientCompany: string = inv.client_company ?? ''
    const projectTitle: string = inv.project_title ?? ''
    const currency: string = inv.currency ?? 'USD'
    const lineItems: { quantity: number; price: number }[] = Array.isArray(inv.line_items) ? inv.line_items : []
    const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.price, 0)
    const total = subtotal + (inv.taxes ?? 0)
    const amountPaid = inv.amount_paid && inv.amount_paid > 0 ? inv.amount_paid : total

    const paidAt: string = bodyPaidAt || inv.paid_at || new Date().toISOString()
    await sb.from('invoices').update({
      status: 'paid', paid_at: paidAt, amount_paid: amountPaid,
    }).eq('id', invoiceId)

    if (!clientEmail) {

      return NextResponse.json({ ok: true, emailed: false, reason: 'no client email' })

    }

    const key = process.env.RESEND_API_KEY
    const rNo = receiptNumber(number)
    if (key) {

      const { receiptHtml } = buildReceiptEmail({
        invoiceId, number, clientName, clientEmail, clientCompany,
        projectTitle, method, amountPaid, currency, paidAt,
      })

      const pdfBase64 = await buildReceiptPdf(req, invoiceId, method)
      const attachments = pdfBase64
        ? [{ filename: `Receipt-${rNo}.pdf`, content: pdfBase64 }]
        : undefined

      const sends = [
        sendEmail(key, {
          from: FROM,
          to: [clientEmail],
          reply_to: NOTIFY_EMAIL,
          subject: `Receipt ${rNo}, payment received, thank you`,
          html: receiptHtml,
          ...(attachments ? { attachments } : {}),
        }),

      ]
      await Promise.allSettled(sends)
    }

    return NextResponse.json({ ok: true, emailed: true, receiptNumber: rNo, paidAt })
  } catch {
    return NextResponse.json({ error: 'Failed to send receipt' }, { status: 500 })
  }
}
