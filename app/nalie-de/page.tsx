import type { Metadata } from 'next'
import { Oswald, Inter } from 'next/font/google'
import NalieClient from '../nalie/NalieClient'

// Reliable Man, Nalie's landing page, GERMAN. Same component as /nalie, with
// the German words from app/nalie/content.ts.

const display = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--rm-display', display: 'swap' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--rm-body', display: 'swap' })

const TITLE = 'Reliable Man | Werde der Mann, der liefert'
const DESC = 'Für den ältesten Sohn, der zu früh Mann werden musste. Struktur, Routine und klare Schritte, um Familie, Geld und Erfolg zu tragen, ohne zu zerbrechen. Coaching mit Nalie, nur mit Bewerbung.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { languages: { en: '/nalie', de: '/nalie-de' } },
  openGraph: { title: TITLE, description: DESC, siteName: 'Reliable Man', type: 'website', locale: 'de_DE' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}

export default function NalieDePage() {
  return (
    <div className={`${display.variable} ${body.variable}`}>
      <NalieClient lang="de" />
    </div>
  )
}
