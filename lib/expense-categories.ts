import type { ExpenseCategory } from './crm-types'

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'software',
  'equipment',
  'workspace',
  'marketing',
  'freelancer',
  'personnel',
  'fees',
  'operations',
  'other',
]

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  software: 'Software and subscriptions',
  equipment: 'Equipment and hardware',
  workspace: 'Coworking and workspace',
  marketing: 'Marketing and ads',
  freelancer: 'Freelancers and partners',
  personnel: 'Team',
  fees: 'Bank and card fees',
  operations: 'Operations',
  other: 'Other',
}

export const CATEGORY_HINT =
  'software = subscriptions, apps, hosting, domains, AI tools; equipment = laptops, phones, headphones, tech rental; workspace = coworking, office, desk rent; marketing = ads, promotion; freelancer = a person paid for work; personnel = staff; fees = bank, card and payment fees, bank plan; operations = travel and anything else needed to run the business; other = anything else.'
