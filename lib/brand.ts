const v = (value: string | undefined, fallback = '') => (value ?? '').trim() || fallback

export const BRAND = {

  name: v(process.env.NEXT_PUBLIC_BUSINESS_NAME, 'Your Business'),

  tagline: v(process.env.NEXT_PUBLIC_DASHBOARD_LABEL, 'Dashboard'),

  owner: v(process.env.NEXT_PUBLIC_OWNER_NAME, 'Owner'),

  ownerRole: v(process.env.NEXT_PUBLIC_OWNER_ROLE, 'Founder'),

  legalName: v(process.env.NEXT_PUBLIC_LEGAL_NAME),

  address: v(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS),

  taxId: v(process.env.NEXT_PUBLIC_TAX_ID),

  email: v(process.env.NEXT_PUBLIC_CONTACT_EMAIL),

  phone: v(process.env.NEXT_PUBLIC_CONTACT_PHONE),

  website: v(process.env.NEXT_PUBLIC_SITE_URL, 'http://localhost:3000').replace(/\/+$/, ''),

  logo: v(process.env.NEXT_PUBLIC_LOGO_URL, '/logo.png'),

  currency: (v(process.env.NEXT_PUBLIC_DEFAULT_CURRENCY, 'EUR').toUpperCase() === 'USD' ? 'USD' : 'EUR') as 'EUR' | 'USD',

  timeZone: v(process.env.NEXT_PUBLIC_TIME_ZONE, 'Europe/Berlin'),

  communityUrl: v(process.env.NEXT_PUBLIC_COMMUNITY_URL),
} as const

export const BANK = {
  accountName: v(process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME),
  bankName: v(process.env.NEXT_PUBLIC_BANK_NAME),
  iban: v(process.env.NEXT_PUBLIC_BANK_IBAN),
  bic: v(process.env.NEXT_PUBLIC_BANK_BIC),
  note: v(process.env.NEXT_PUBLIC_BANK_NOTE),
}

export const hasBank = () => Boolean(BANK.iban || BANK.accountName)

export function bankInfoText(): string {
  if (!hasBank()) return ''
  return [
    BANK.accountName && `Account name: ${BANK.accountName}`,
    BANK.bankName && `Bank: ${BANK.bankName}`,
    BANK.iban && `IBAN: ${BANK.iban}`,
    BANK.bic && `BIC/SWIFT: ${BANK.bic}`,
    BANK.note,
  ].filter(Boolean).join('\n')
}

export const documentName = () => BRAND.legalName || BRAND.name

export const ISSUER = {
  name: BRAND.name,
  legal: BRAND.legalName,
  address: BRAND.address,
  email: BRAND.email,
  phone: BRAND.phone,
  website: BRAND.website.replace(/^https?:\/\//, ''),
  taxId: BRAND.taxId,
  iban: BANK.iban,
  swift: BANK.bic,
  bank: BANK.bankName,
  accountName: BANK.accountName,
  crypto: '',
}

// WhatsApp link from NEXT_PUBLIC_CONTACT_PHONE; falls back to email when no phone is set.
export const CONTACT_URL = BRAND.phone.replace(/\D/g, '')
  ? `https://wa.me/${BRAND.phone.replace(/\D/g, '')}`
  : `mailto:${BRAND.email}`
