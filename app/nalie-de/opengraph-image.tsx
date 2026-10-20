import { ImageResponse } from 'next/og'

// Reliable Man's own share card. Without this file /nalie would inherit the
// Optimize Your Vibe logo card from app/opengraph-image.tsx, so every ad share
// and WhatsApp forward would show the wrong brand.

export const alt = 'Reliable Man. Werde der Mann, der liefert.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '0 96px', background: '#0d0f12', position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', left: 96, top: 110, width: 90, height: 6, background: '#d4a24c', display: 'flex' }} />
        <div style={{ fontSize: 34, letterSpacing: 10, color: '#d4a24c', fontWeight: 700, display: 'flex' }}>RELIABLE MAN</div>
        <div style={{ fontSize: 76, lineHeight: 1.05, color: '#f3eee4', fontWeight: 800, marginTop: 28, display: 'flex', maxWidth: 980 }}>
          Werde der Mann, der liefert.
        </div>
        <div style={{ fontSize: 30, color: '#b9b4aa', marginTop: 28, display: 'flex' }}>Coaching mit Nalie · Nur mit Bewerbung</div>
      </div>
    ),
    size,
  )
}
