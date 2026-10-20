import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<NextResponse> {
  const h = req.headers
  const raw = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry') ?? ''

  const country = /^[A-Za-z]{2}$/.test(raw) && raw.toUpperCase() !== 'XX' ? raw.toUpperCase() : null
  return NextResponse.json({ country }, { headers: { 'Cache-Control': 'no-store' } })
}
