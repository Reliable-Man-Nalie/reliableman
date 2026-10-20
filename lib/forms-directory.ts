export interface FormDef {
  id: string
  name: string
  url: string        // where the form lives on the site (route). '' = not a public web form.
  sources: string[]  // lead.source values this form's submissions arrive with (lowercased match)
  purpose?: string
}

export const FORM_REGISTRY: FormDef[] = [
  { id: 'event',        name: 'Event Registration',     url: '/events',   sources: ['event-register', 'events-notify'], purpose: 'People who register for an event' },
  { id: 'apply',        name: 'Application',            url: '/apply',    sources: ['apply', 'application'], purpose: 'Program applications from your website' },
  { id: 'booking',      name: 'Booking / Strategy Session', url: '/book-now/strategy', sources: ['booking', 'session'], purpose: 'Paid session booking' },
  { id: 'checkout',     name: 'Checkout / Purchase',      url: '/checkout', sources: ['checkout', 'stripe', 'purchase'], purpose: 'Buyers from Stripe checkout' },
  { id: 'contact',      name: 'Contact Form',             url: '/about',    sources: ['contact'], purpose: 'General contact' },
  { id: 'lead-capture', name: 'Website Lead Form',        url: '/',         sources: ['website', 'lead'], purpose: 'General site lead capture' },
  { id: 'csv',          name: 'CSV Import',               url: '',          sources: ['csv-import', 'csv', 'workshop'], purpose: 'Bulk imported contacts (not a live web form)' },
  { id: 'manual',       name: 'Manual Entry',             url: '',          sources: ['manual', 'referral'], purpose: 'Added by hand in the CRM' },
  { id: 'proposal',     name: 'Proposal Signature',       url: '',          sources: ['proposal-sign', 'proposal'], purpose: 'Signed proposals (not a marketing form)' },
]

export function matchFormId(rawSource: string | undefined): string | null {
  const s = (rawSource ?? '').trim().toLowerCase()
  if (!s) return null
  for (const form of FORM_REGISTRY) {
    if (form.sources.some(key => s.includes(key))) return form.id
  }
  return null
}
