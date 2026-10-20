import type { Metadata } from 'next'

// Paid-ad landing page: kept out of search. Remove robots below to index it.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function NalieLayout({ children }: { children: React.ReactNode }) {
  return children
}
