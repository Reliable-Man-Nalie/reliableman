import type { Metadata } from 'next'

// A paid-ad landing page for Nalie's brand, so by the owner's rule ("any part of
// funnels should not be indexed") it stays out of search and out of
// app/sitemap.ts. The page file owns title, description and canonical.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function NalieDeLayout({ children }: { children: React.ReactNode }) {
  return children
}
