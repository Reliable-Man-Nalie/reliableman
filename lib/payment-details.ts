import { BANK, hasBank } from './brand'

export interface PaymentMethod {
  id: string
  label: string
  enabled: boolean
  lines: string[]
  bestFor?: string
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'bank',
    label: 'Bank transfer',
    enabled: hasBank(),
    bestFor: 'Clients who pay from their bank app.',
    lines: [
      BANK.accountName,
      BANK.bankName && `Bank: ${BANK.bankName}`,
      BANK.iban && `IBAN: ${BANK.iban}`,
      BANK.bic && `SWIFT/BIC: ${BANK.bic}`,
      BANK.note,
    ].filter(Boolean) as string[],
  },
  {
    id: 'card',
    label: 'Card',
    enabled: true,
    bestFor: 'Paying now, from a phone, without a bank app.',
    lines: ['Pay by card with the button on the invoice page.'],
  },
]

export const PAYMENT_TERMS = [
  'Payment is due within 7 days of the invoice date.',
]

export function paymentDetailsText(): string {
  const blocks = PAYMENT_METHODS.filter(m => m.enabled).map(m => `${m.label}\n${m.lines.join('\n')}`)
  return [...blocks, PAYMENT_TERMS.join('\n')].join('\n\n')
}

export interface ReceiptMethod {
  id: string
  label: string
}

export const RECEIPT_METHODS: ReceiptMethod[] = [
  { id: 'bank', label: 'Bank transfer' },
  { id: 'card', label: 'Card (Stripe)' },
  { id: 'cash', label: 'Cash' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'other', label: 'Other (type it in)' },
]

export const RECEIPT_METHOD_MAX = 40
