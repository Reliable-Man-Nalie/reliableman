export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed'
export type EventFormat = 'in_person' | 'online' | 'hybrid'
export type AttendeeStatus = 'registered' | 'attended' | 'cancelled' | 'no_show' | 'waitlisted'

export interface Speaker {
  id: string
  name: string
  title: string
  bio: string
  photo: string
  linkedin?: string
  instagram?: string
  website?: string
}

export interface AgendaItem {
  id: string
  time: string
  title: string
  description: string
  speakerId?: string
}

export interface FaqItem {
  id: string
  question: string
  answer: string
}

export interface BosEvent {
  id: string
  slug: string
  title: string
  tagline: string
  description: string
  date: string
  time: string
  endTime: string
  timezone: string
  format: EventFormat
  location: string
  locationName: string
  capacity: number
  price: number
  currency: string
  coverImage: string
  thumbnailImage: string
  status: EventStatus
  tags: string[]
  speakers: Speaker[]
  agenda: AgendaItem[]
  faq: FaqItem[]
  waitlistEnabled: boolean
  requiresApproval: boolean
  emailConfirmation: string
  emailReminder: string
  emailFollowUp: string
  reminderHoursBefore: number
  seoTitle: string
  seoDescription: string

  leaveWith?: string[]

  closingLine?: string

  disclaimer?: string

  painPoints?: { title: string; items: string[]; turn?: string }

  team?: { role: string; does: string; icon?: string }[]

  priceFrame?: string

  agendaHeading?: string

  video?: string

  layout?: 'claude-workshop'
  createdAt: string
  updatedAt: string
}

export interface EventAttendee {
  id: string
  eventId: string
  eventTitle: string
  name: string
  email: string
  phone: string
  company: string
  status: AttendeeStatus
  paid: boolean
  paidAt: string
  paidAmount: number
  checkedIn: boolean
  checkedInAt: string
  ticketCode: string
  notes: string
  source: string
  registeredAt: string

  paymentMethod?: string

  proofPath?: string

  proofCheck?: { verdict?: string; reasons?: string[] } | null

  paymentRef?: PaymentRef | null

  referralCode?: string

  referredBy?: string

  referralRewards?: { friendId: string; friendName?: string; amount: number; kind: 'discount' | 'refund' | 'owed' | 'sent'; at: string; refundId?: string }[]
}

export interface PaymentRef {
  via?: 'card' | 'bank-auto' | 'bank-manual' | 'referral' | 'circle'
  stripeSessionId?: string | null
  paymentIntent?: string | null
  currency?: string | null
  livemode?: boolean
  payerEmail?: string | null
  markedBy?: string | null
}
