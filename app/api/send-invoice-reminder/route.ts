import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'
import { sendEmail, wrapEmail, SITE_URL } from '@/lib/email'
import { invoiceReminderCopy } from '@/lib/invoice-reminder'
import { serviceDb } from '@/lib/os-supabase'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    invoiceId?: string; number?: string; clientName?: string; clientEmail?: string
    amount?: string; dueLabel?: string; daysPastDue?: number; token?: string
  }

  const to = String(body.clientEmail ?? '').trim()
  if (!to) return NextResponse.json({ ok: false, error: 'This invoice has no client email.' }, { status: 400 })
  if (!body.number) return NextResponse.json({ ok: false, error: 'missing invoice number' }, { status: 400 })

  const copy = invoiceReminderCopy({

    firstName: String(body.clientName ?? '').trim().split(/\s+/)[0] ?? '',
    number: String(body.number),
    amount: String(body.amount ?? ''),
    dueLabel: String(body.dueLabel ?? 'recently'),
    daysPastDue: Number(body.daysPastDue) || 0,
  })

  const html = wrapEmail(
    copy.heading,
    copy.body,

    body.token ? { label: 'Open the invoice', href: `${SITE_URL}/invoice/${body.token}` } : undefined,
    copy.subject,
  )

  const sent = await sendEmail(to, copy.subject, html)
  if (!sent) {

    return NextResponse.json(
      { ok: false, error: `Resend refused the message to ${to}. Nothing was sent.` },
      { status: 502 },
    )
  }

  const sb = await serviceDb()
  if (sb && body.invoiceId) {
    try {
      const { data: row } = await sb.from('invoices')
        .select('reminders').eq('id', body.invoiceId).maybeSingle()
      const log = Array.isArray(row?.reminders) ? row.reminders : []
      await sb.from('invoices').update({
        reminders: [...log, {
          at: new Date().toISOString(),
          to,
          stage: copy.subject,
          daysPastDue: Number(body.daysPastDue) || 0,
        }],

        payment_reminder_at: new Date().toISOString(),
      }).eq('id', body.invoiceId)
    } catch {

    }
  }

  return NextResponse.json({ ok: true, to, stage: copy.subject })
}
