function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement as HTMLElement | null
  const ta = document.createElement('textarea')
  try {
    ta.value = text

    ta.setAttribute('aria-hidden', 'true')
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;pointer-events:none;'
    ta.contentEditable = 'true'
    ta.readOnly = false
    document.body.appendChild(ta)
    const range = document.createRange()
    range.selectNodeContents(ta)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    sel?.removeAllRanges()
    return ok
  } catch {
    return false
  } finally {
    ta.remove()
    try { active?.focus?.({ preventScroll: true }) } catch { /* nothing to restore */ }
  }
}

export function copyText(text: string): Promise<boolean> {
  if (legacyCopy(text)) return Promise.resolve(true)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => false)
    }
  } catch { /* fall through */ }
  return Promise.resolve(false)
}

export type ShareResult = 'copied' | 'shared' | 'cancelled' | 'failed'

export function shareOrCopy(url: string, title?: string): Promise<ShareResult> {

  if (legacyCopy(url)) return Promise.resolve('copied')
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  if (canShare) {
    return navigator.share({ title, url }).then(
      () => 'shared' as const,
      (e: unknown) => (e instanceof Error && e.name === 'AbortError' ? 'cancelled' as const : 'failed' as const),
    )
  }
  return copyText(url).then(ok => (ok ? 'copied' : 'failed'))
}
