import type { PaymentMilestone, Currency } from '@/lib/crm-types'
import { BRAND, bankInfoText } from '@/lib/brand'

export const BANK_INFO = bankInfoText()

export type Template = {
  id: string
  icon: string
  name: string

  offerName?: string

  notIncluded?: string[]
  tagline: string
  color: string
  titleFn: (name: string, company: string) => string
  introFn: (name: string, company: string) => string
  services: string[]
  deliverables: string[]
  schedule: PaymentMilestone[]

  oneTime?: boolean
  currency: Currency
  validDays: number
}

export function withScope(tpl: Template, intro: string): string {
  if (!tpl.notIncluded?.length) return intro
  return `${intro}\n\nWhat this does not include\n${tpl.notIncluded.map(l => `\u2022 ${l}`).join('\n')}`
}

export type TemplateFields = {
  title: string
  intro: string
  services: string[]
  deliverables: string[]
  milestones: PaymentMilestone[]
  currency: Currency
  oneTime: boolean
  validDays: number
}

export function templateFields(t: Template, clientName: string, clientCompany?: string): TemplateFields {

  const co = clientCompany ?? ''
  return {
    title: t.titleFn(clientName, co),
    intro: withScope(t, t.introFn(clientName, co)),
    services: [...t.services],
    deliverables: t.deliverables.length ? [...t.deliverables] : [''],

    milestones: t.schedule.length ? t.schedule.map(m => ({ ...m })) : [{ label: '', amount: 0 }],
    currency: t.currency,
    oneTime: t.oneTime === true,
    validDays: t.validDays,
  }
}

export function matchTemplate(p: { title: string; offerName?: string }): Template | undefined {
  const hay = `${p.offerName ?? ''} ${p.title}`.toLowerCase()
  return TEMPLATES.find(t => hay.includes((t.offerName ?? t.name).toLowerCase()))
      ?? TEMPLATES.find(t => hay.includes(t.name.toLowerCase()))
}

export const TEMPLATES: Template[] = [
  {
    id: 'group-coaching',
    icon: 'ti-users-group',
    name: 'Group Coaching',
    offerName: 'Group Coaching Program',
    tagline: 'A seat in the group program, billed monthly',
    color: 'var(--os-accent)',
    titleFn: (n) => `${n}: Group Coaching Program`,
    introFn: (n) => `${n}, thank you for applying. This proposal confirms your seat in the group coaching program.\n\nWe meet live as a group, you get the full material, and you work on your goals with people who are on the same path. Your seat is confirmed once this proposal is signed and the first payment is received.`,
    services: [
      'Live group coaching calls',
      'All program material and recordings',
      'The private group chat',
    ],
    deliverables: [
      'A clear plan for the length of the program',
      'Your progress reviewed on every call',
    ],
    notIncluded: [
      'One to one sessions (available separately)',
      'Anything not listed above, quoted and paid separately',
    ],
    schedule: [
      { label: 'Month 1', amount: 0, note: 'Due on signing. Confirms your seat.' },
      { label: 'Month 2', amount: 0, note: 'Billed one month after signing.' },
      { label: 'Month 3', amount: 0, note: 'Billed two months after signing.' },
    ],
    currency: BRAND.currency as Currency,
    validDays: 7,
  },
  {
    id: 'group-coaching-premium',
    icon: 'ti-crown',
    name: 'Group Coaching Premium',
    offerName: 'Group Coaching Program (Premium)',
    tagline: 'A Premium seat: the group program plus personal time',
    color: 'var(--os-warn)',
    titleFn: (n) => `${n}: Group Coaching Program, Premium seat`,
    introFn: (n) => `${n}, this proposal confirms one of the limited Premium seats in the group coaching program.\n\nYou get everything in the group program, plus personal one to one time so the work fits your exact situation. Premium seats are limited, so your seat is held once this proposal is signed and the first payment is received.`,
    services: [
      'Everything in the group program',
      'Personal one to one calls',
      'Direct message access between calls',
    ],
    deliverables: [
      'A personal plan written with you on the first call',
      'Your progress reviewed one to one',
    ],
    notIncluded: [
      'Extra one to one sessions beyond the package, quoted and paid separately',
      'Anything not listed above, quoted and paid separately',
    ],
    schedule: [
      { label: 'Month 1', amount: 0, note: 'Due on signing. Holds your Premium seat.' },
      { label: 'Month 2', amount: 0, note: 'Billed one month after signing.' },
      { label: 'Month 3', amount: 0, note: 'Billed two months after signing.' },
    ],
    currency: BRAND.currency as Currency,
    validDays: 7,
  },
  {
    id: 'one-to-one',
    icon: 'ti-user',
    name: 'One to one coaching',
    tagline: 'Private coaching, paid in full upfront',
    color: 'var(--os-good)',
    titleFn: (n) => `${n}: One to one coaching`,
    introFn: (n) => `${n}, this proposal covers private one to one coaching, built around your goals.`,
    services: ['Private one to one calls', 'Notes and action steps after every call'],
    deliverables: [''],
    schedule: [{ label: 'On signing', amount: 0, note: 'Covers the full package.' }],
    oneTime: true,
    currency: BRAND.currency as Currency,
    validDays: 14,
  },
  {
    id: 'custom',
    icon: 'ti-pencil',
    name: 'Custom',
    tagline: 'Start blank and build exactly what the client needs',
    color: 'var(--os-text-faint)',
    titleFn: () => '',
    introFn: () => '',
    services: [],
    deliverables: [''],
    schedule: [{ label: '', amount: 0, note: '' }],
    currency: BRAND.currency as Currency,
    validDays: 14,
  },
]
