import { createHash } from 'crypto'
export { registrationEventId } from './registration-event-id'

const PIXEL_IDS: string[] = (process.env.NEXT_PUBLIC_META_PIXEL_IDS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

function sha256(v: string): string {
  return createHash('sha256').update(v.trim().toLowerCase()).digest('hex')
}

export type CapiEvent = {
  eventName: string
  eventId: string
  email?: string
  name?: string
  phone?: string
  ip?: string
  userAgent?: string
  fbp?: string
  fbc?: string
  pageUrl?: string
  customData?: Record<string, unknown>
}

export async function sendCapiEvent(e: CapiEvent): Promise<void> {
  const token = process.env.META_CAPI_TOKEN
  if (!token) return
  const [firstName, ...rest] = (e.name || '').trim().split(/\s+/)
  const lastName = rest.join(' ')
  const digits = (e.phone || '').replace(/[^0-9]/g, '')
  const data = [{
    event_name: e.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: e.eventId,
    event_source_url: e.pageUrl || undefined,
    action_source: 'website',
    user_data: {
      em: e.email ? [sha256(e.email)] : undefined,
      fn: firstName ? [sha256(firstName)] : undefined,
      ln: lastName ? [sha256(lastName)] : undefined,
      ph: digits ? [sha256(digits)] : undefined,
      client_ip_address: e.ip || undefined,
      client_user_agent: e.userAgent || undefined,
      fbp: e.fbp || undefined,
      fbc: e.fbc || undefined,
    },
    custom_data: e.customData,
  }]
  await Promise.all(PIXEL_IDS.map(async id => {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${id}/events?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      })
      if (!res.ok) console.error(`[meta-capi] ${e.eventName} to ${id} refused ${res.status}: ${(await res.text()).slice(0, 300)}`)
    } catch (err) {
      console.error(`[meta-capi] ${e.eventName} to ${id} failed`, err)
    }
  }))
}

