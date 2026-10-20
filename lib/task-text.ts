export function isHtml(s: string | null | undefined): boolean {
  return /<\/?[a-z][^>]*>/i.test(s ?? '')
}

export function descriptionToText(html: string | null | undefined): string {
  const s = html ?? ''
  if (!isHtml(s)) return s.trim()
  return s
    .replace(/\r?\n/g, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function textToHtml(text: string): string {
  if (!text) return ''
  if (isHtml(text)) return text
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.split(/\n/).map(l => `<p>${l || '<br>'}</p>`).join('')
}
