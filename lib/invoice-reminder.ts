import { paymentDetailsText } from './payment-details'

export type ReminderStage = 'due-soon' | 'just-late' | 'chase'

export function reminderStageFor(daysPastDue: number): ReminderStage {
  if (daysPastDue < 0) return 'due-soon'
  if (daysPastDue <= 7) return 'just-late'
  return 'chase'
}

export interface ReminderCopy {
  subject: string
  heading: string
  body: string
}

export function invoiceReminderCopy(input: {
  firstName: string
  number: string
  amount: string
  dueLabel: string
  daysPastDue: number
  payUrl?: string
}): ReminderCopy {
  const { firstName, number, amount, dueLabel, daysPastDue, payUrl } = input
  const stage = reminderStageFor(daysPastDue)
  const name = firstName.trim() || 'there'

  const how = `<p style="margin:0 0 8px;font-size:14px;color:#6b6b7b;">How to pay</p>
<pre style="margin:0 0 18px;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.7;color:#2f2a3d;white-space:pre-wrap;">${paymentDetailsText()}</pre>`

  if (stage === 'due-soon') {
    return {
      subject: `Invoice ${number} is due ${dueLabel}`,
      heading: 'A heads up',
      body: `<p style="margin:0 0 16px;">Hi ${name},</p>
<p style="margin:0 0 16px;">Invoice <strong>${number}</strong> for <strong>${amount}</strong> is due ${dueLabel}. Nothing is late, this is just so it does not land as a surprise.</p>
${how}
<p style="margin:0;">If it is already on its way, ignore this. A transfer takes a day or two to show up on my side.</p>`,
    }
  }

  if (stage === 'just-late') {
    return {
      subject: `Invoice ${number}, ${amount}`,
      heading: 'Just a nudge',
      body: `<p style="margin:0 0 16px;">Hi ${name},</p>
<p style="margin:0 0 16px;">Invoice <strong>${number}</strong> for <strong>${amount}</strong> was due ${dueLabel} and I have not seen it come through yet.</p>
<p style="margin:0 0 16px;">Most likely it is either on its way or sitting in a pile, both of which are fine. If something about the invoice needs changing, tell me and I will fix it rather than chase it.</p>
${how}`,
    }
  }

  return {
    subject: `Invoice ${number} is still open`,
    heading: 'Still open',
    body: `<p style="margin:0 0 16px;">Hi ${name},</p>
<p style="margin:0 0 16px;">Invoice <strong>${number}</strong> for <strong>${amount}</strong> was due ${dueLabel}, which is ${daysPastDue} day${daysPastDue === 1 ? '' : 's'} ago now.</p>
<p style="margin:0 0 16px;">I would rather ask than assume: is there anything holding it up? If the timing is difficult, say so and we will find something that works. If it was simply missed, the details are below.</p>
${how}
<p style="margin:0;">And if you have already paid, let me know the date and I will find it on my side.</p>`,
    ...(payUrl ? {} : {}),
  }
}
