'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { useConsentGranted } from '@/lib/consent'
import { usePrivateSurface } from '@/lib/private-surfaces'

export const META_PIXEL_IDS: string[] = (process.env.NEXT_PUBLIC_META_PIXEL_IDS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

export const META_PIXEL_ID = META_PIXEL_IDS[0]

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

export function trackEvent(event: string, params?: Record<string, unknown>, options?: { eventID: string }) {
  if (typeof window !== 'undefined' && window.fbq) {
    if (options) window.fbq('track', event, params, options)
    else window.fbq('track', event, params)
  }
}

export default function MetaPixel() {
  const pathname = usePathname()
  const granted = useConsentGranted('marketing')
  const priv = usePrivateSurface(pathname)

  useEffect(() => {
    if (granted && !priv && window.fbq) window.fbq('track', 'PageView')
  }, [pathname, granted, priv])

  if (!granted || priv || META_PIXEL_IDS.length === 0) return null

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
${META_PIXEL_IDS.map(id => `fbq('init', '${id}');`).join('\n')}
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        <img height="1" width="1" style={{ display: 'none' }} alt="" src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`} />
      </noscript>
    </>
  )
}
