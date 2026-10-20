import type { Metadata } from 'next'
import { Oswald, Inter } from 'next/font/google'
import NalieClient from './NalieClient'

// Reliable Man, Nalie's landing page, ENGLISH (the main page).
// The German page is app/nalie-de/page.tsx. Self-contained: see README.md.

const display = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--rm-display', display: 'swap' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--rm-body', display: 'swap' })

const TITLE = 'Reliable Man | Become the man who delivers'
const DESC = 'For the eldest son who had to grow up too fast. Structure, routine and clear steps to carry family, money and success without breaking. Coaching with Nalie, by application only.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { languages: { en: '/nalie', de: '/nalie-de' } },
  openGraph: { title: TITLE, description: DESC, siteName: 'Reliable Man', type: 'website', locale: 'en_US' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}

export default function NaliePage() {
  return (
    <div className={`${display.variable} ${body.variable}`}>
      <NalieClient lang="en" />
    </div>
  )
}
