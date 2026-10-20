'use client'

import { useEffect, useState } from 'react'

export const OS_THEME_KEY = 'bos-os-theme'

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${OS_THEME_KEY}');if(t!=='dark')document.documentElement.setAttribute('data-os-theme','light')}catch(e){document.documentElement.setAttribute('data-os-theme','light')}})()`

export default function ThemeToggle({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  const [light, setLight] = useState(true)

  useEffect(() => {
    setLight(document.documentElement.getAttribute('data-os-theme') === 'light')
  }, [])

  function flip() {
    const next = !light
    setLight(next)
    const root = document.documentElement
    if (next) root.setAttribute('data-os-theme', 'light')
    else root.removeAttribute('data-os-theme')
    try { localStorage.setItem(OS_THEME_KEY, next ? 'light' : 'dark') } catch { /* private mode */ }

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', next ? '#F4F1F7' : '#06040B')
  }

  const label = light ? 'Dark mode' : 'Light mode'
  const hint = light ? 'Switch to dark' : 'Switch to light'

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={flip}
        className="os-theme-row"
        aria-pressed={light}
        title={hint}
      >
        <span aria-hidden="true" className="os-theme-row-icon">{light ? '☾' : '☀'}</span>
        <span>{label}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={flip}
      className="os-theme-toggle"
      aria-pressed={light}
      title={hint}
      aria-label={hint}
    >
      <span aria-hidden="true">{light ? '☾' : '☀'}</span>
    </button>
  )
}
