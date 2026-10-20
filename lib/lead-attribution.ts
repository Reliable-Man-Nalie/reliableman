export const CHANNEL_TAGS = ['Meta ad', 'Google ad', 'Social (organic)', 'Search (organic)'] as const

export function channelTag(input: { fbc?: string | null; pageUrl?: string | null; referrer?: string | null }): string | null {
  const url = String(input.pageUrl ?? '').toLowerCase()
  const ref = String(input.referrer ?? '').toLowerCase()
  if (input.fbc || /[?&]fbclid=/.test(url) || /utm_source=(facebook|fb|instagram|ig|meta)\b/.test(url)) return 'Meta ad'
  if (/[?&](gclid|gbraid|wbraid)=/.test(url) || /utm_source=google.*utm_medium=(cpc|ppc|paid)/.test(url)) return 'Google ad'
  if (/(facebook|instagram|linkedin|tiktok|youtube|t\.co|twitter|x\.com)/.test(ref)) return 'Social (organic)'
  if (/(google|bing|duckduckgo|yahoo)\./.test(ref)) return 'Search (organic)'
  return null
}
