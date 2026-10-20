'use client'

import { useSyncExternalStore } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export const OS_PRIVACY_KEY = 'bos-os-privacy'
const ATTR = 'data-bos-privacy'

export const PRIVACY_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem('${OS_PRIVACY_KEY}')==='on')document.documentElement.setAttribute('${ATTR}','on')}catch(e){}})()`

const listeners = new Set<() => void>()
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }
const read = () => document.documentElement.getAttribute(ATTR) === 'on'

export function setPrivacy(next: boolean) {
  const root = document.documentElement
  if (next) root.setAttribute(ATTR, 'on')
  else root.removeAttribute(ATTR)
  try { localStorage.setItem(OS_PRIVACY_KEY, next ? 'on' : 'off') } catch { /* private mode */ }
  listeners.forEach(l => l())
}

export default function PrivacyToggle() {
  const on = useSyncExternalStore(subscribe, read, () => false)
  const flip = () => setPrivacy(!on)

  const hint = on ? 'Show client names' : 'Hide client names'
  return (
    <button
      type="button"
      onClick={flip}
      className={`os-privacy-toggle${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-label={hint}
      title={hint}
    >
      {on ? <EyeOff size={17} strokeWidth={2} aria-hidden="true" /> : <Eye size={17} strokeWidth={2} aria-hidden="true" />}
      <span className="os-privacy-label">{on ? 'Hidden' : 'Hide'}</span>
    </button>
  )
}
