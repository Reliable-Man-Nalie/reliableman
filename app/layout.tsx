import type { Metadata, Viewport } from 'next'
import { Poppins, Quicksand, Sora, Manrope, Space_Mono } from 'next/font/google'
import './globals.css'
import { BRAND } from '@/lib/brand'

// preload: false keeps these dashboard fonts off the landing page (/nalie), which
// brings its own; pages that use them still load them on first paint.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-poppins', display: 'swap', preload: false })
const quicksand = Quicksand({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-quicksand', display: 'swap', preload: false })

const sora = Sora({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-sora', display: 'swap', preload: false })
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-manrope', display: 'swap', preload: false })
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-space-mono', display: 'swap', preload: false })

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  // Without NEXT_PUBLIC_SITE_URL, Next.js falls back to the Vercel production URL
  // for share images, instead of BRAND's localhost default.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(BRAND.website) : undefined,
  title: BRAND.name,
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${quicksand.variable} ${sora.variable} ${manrope.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
