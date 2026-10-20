const FALLBACK = 'https://chat.whatsapp.com/Ct8FWVAe9tO3XHeCnHcWuh'

export const EVENT_WHATSAPP_URL: string = FALLBACK

const GROUP_ENABLED = true

export function isCommunityLinkSet(): boolean {
  if (!GROUP_ENABLED) return false
  return /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(EVENT_WHATSAPP_URL)
}

export const COMMUNITY_HEADING = 'One more step, and it is the one that matters'

export const COMMUNITY_BODY =
  'Everyone attending is in the WhatsApp group. That is where the joining link gets posted on the day, where I answer questions before we start, and where the replay lands afterwards. If you are only in one place, be in this one.'

export const COMMUNITY_CTA = 'Join the event group'
