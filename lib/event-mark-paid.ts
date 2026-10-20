import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, emailShell, OWNER_EMAIL, SITE_URL } from '@/lib/email'
import { escapeHtml } from '@/lib/escape-html'
import { buildRegistrantConfirmation } from '@/lib/event-confirmation'

export type PaidVia = 'card' | 'bank-auto' | 'bank-manual'

export type MarkPaidResult =
  | { ok: true; turned: true; emailSent: boolean }
  | { ok: true; turned: false } // already paid, or no such ticket
  | { ok: false; error: string }

const VIA_LABEL: Record<PaidVia, string> = {
  'card': 'paid by card',
  'bank-auto': 'paid by bank transfer (Assistant matched the proof)',
  'bank-manual': 'marked paid by hand (bank transfer)',
}

export async function markSeatPaid(
  db: SupabaseClient,
  opts: { ticketCode: string; amount: number; via: PaidVia; ref?: Record<string, unknown> },
): Promise<MarkPaidResult> {
  const ticketCode = opts.ticketCode.trim()
  if (!ticketCode) return { ok: false, error: 'No ticket code.' }

  const patch: Record<string, unknown> = {
    paid: true,
    paid_at: new Date().toISOString(),
    paid_amount: opts.amount,
    payment_method: opts.via === 'card' ? 'card' : 'bank',

    payment_ref: { via: opts.via, ...(opts.ref || {}) },
  }
  let res = await db.from('event_attendees').update(patch)
    .eq('ticket_code', ticketCode).eq('paid', false)
    .select('id, name, email, notes, event_id')

  if (res.error && /payment_method|payment_ref/.test(res.error.message || '')) {
    delete patch.payment_method
    delete patch.payment_ref
    res = await db.from('event_attendees').update(patch)
      .eq('ticket_code', ticketCode).eq('paid', false)
      .select('id, name, email, notes, event_id')
  }
  if (res.error) return { ok: false, error: res.error.message }
  const seat = res.data?.[0]
  if (!seat) return { ok: true, turned: false }

  let emailSent = false
  let title = ''
  try {
    const { data: ev } = await db.from('events').select('*').eq('id', seat.event_id).maybeSingle()
    if (ev) {
      title = String(ev.title || '')
      if (seat.email) {
        const mail = buildRegistrantConfirmation(ev, { name: String(seat.name || ''), ticketCode, notes: String(seat.notes || '') })
        emailSent = await sendEmail(String(seat.email), mail.subject, mail.html)
        if (!emailSent) console.error(`[event-paid] ticket ${ticketCode} paid, confirmation email NOT sent`)
      }
    }
  } catch (e) {
    console.error('[event-paid] confirmation failed', e)
  }

  if (!emailSent && opts.via !== 'bank-manual') {
    try {
      await sendEmail(OWNER_EMAIL, `Paid seat: ${String(seat.name || seat.email)}`, emailShell({
        title: 'A workshop seat was paid',
        preview: 'A paid seat came in',
        showFooterLinks: false,
        body: `<p style="margin:0 0 12px;">${escapeHtml(String(seat.name || ''))} (${escapeHtml(String(seat.email || ''))}) ${VIA_LABEL[opts.via]} for <strong>${escapeHtml(title)}</strong>. Ticket ${escapeHtml(ticketCode)}.${emailSent ? ' Their confirmation with the joining link has been sent.' : ' <strong>Their confirmation email did NOT send</strong>: send them the joining link by hand.'}</p>`
          + (opts.via === 'bank-auto' ? `<p style="margin:0;">Check the transfer actually landed in your bank before the event. The proof is on their row in <a href="${SITE_URL}/os/events/${encodeURIComponent(String(seat.event_id))}">/os/events</a>.</p>` : ''),
      }))
    } catch (e) {
      console.error('[event-paid] owner notification failed', e)
    }
  }

  return { ok: true, turned: true, emailSent }
}
