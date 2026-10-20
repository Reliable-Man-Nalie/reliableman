import { BRAND } from '@/lib/brand'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `Live Events | ${BRAND.name}`,
  description: `Live events with ${BRAND.owner}, online and in person.`,

  robots: { index: true, follow: true },

  alternates: { canonical: `${BRAND.website}/events` },
}

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children
}
