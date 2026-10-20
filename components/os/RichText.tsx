'use client'
import { useEffect, useRef, useState } from 'react'
import { textToHtml } from '@/lib/task-text'

type Purify = { sanitize: (s: string, cfg: Record<string, unknown>) => string }

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ul', 'ol', 'li', 'a', 'div', 'span']
const ALLOWED_ATTR = ['href', 'target', 'rel']

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  autoFocus?: boolean
}

export function RichText({ value, onChange, placeholder = 'Notes…', minHeight = 96, autoFocus }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const purify = useRef<Purify | null>(null)
  const [empty, setEmpty] = useState(!value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    let alive = true
    import('isomorphic-dompurify')
      .then(({ default: DOMPurify }) => { if (alive) purify.current = DOMPurify as unknown as Purify })
      .catch(() => { /* the toolbar only produces allowlisted tags; paste is text */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const html = textToHtml(value)
    if (el.innerHTML !== html && document.activeElement !== el) el.innerHTML = html
    setEmpty(!el.textContent?.trim() && !el.querySelector('li'))
  }, [value])

  const clean = (html: string) => {
    const p = purify.current
    const out = p
      ? p.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i })
      : html

    const trimmed = out.replace(/(<p>(<br\s*\/?>|&nbsp;|\s)*<\/p>\s*)+$/i, '')
    return trimmed.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim() === '' && !/<li/i.test(trimmed) ? '' : trimmed
  }

  const emit = () => {
    const el = box.current
    if (!el) return
    setEmpty(!el.textContent?.trim() && !el.querySelector('li'))
    onChange(clean(el.innerHTML))
  }

  const cmd = (name: string, arg?: string) => {
    box.current?.focus()
    document.execCommand(name, false, arg)
    emit()
  }

  const link = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const url = window.prompt('Link to (https://…)')
    if (!url) return
    const safe = /^(https?:|mailto:|tel:)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    cmd('createLink', safe)

    box.current?.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer' })
    emit()
  }

  const tools: { label: string; title: string; run: () => void; style?: React.CSSProperties }[] = [
    { label: 'B', title: 'Bold', run: () => cmd('bold'), style: { fontWeight: 900 } },
    { label: 'I', title: 'Italic', run: () => cmd('italic'), style: { fontStyle: 'italic', fontFamily: 'Georgia, serif' } },
    { label: 'U', title: 'Underline', run: () => cmd('underline'), style: { textDecoration: 'underline' } },
    { label: 'S', title: 'Strikethrough', run: () => cmd('strikeThrough'), style: { textDecoration: 'line-through' } },
    { label: '•', title: 'Bullet list', run: () => cmd('insertUnorderedList'), style: { fontSize: 16 } },
    { label: '1.', title: 'Numbered list', run: () => cmd('insertOrderedList') },
    { label: '⛓', title: 'Link (select text first)', run: link, style: { fontSize: 12 } },
    { label: '⌫', title: 'Clear formatting', run: () => { cmd('removeFormat'); cmd('unlink') }, style: { fontSize: 12 } },
  ]

  return (
    <div className={`os-richtext${focused ? ' is-focused' : ''}`}>
      <div className="os-richtext-bar" role="toolbar" aria-label="Formatting">
        {tools.map(t => (
          <button
            key={t.title} type="button" title={t.title} aria-label={t.title}

            onMouseDown={e => { e.preventDefault(); t.run() }}
            style={t.style}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        {empty && !focused && (
          <span aria-hidden className="os-richtext-placeholder">{placeholder}</span>
        )}
        <div
          ref={box}
          className="os-richtext-box"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Description"
          autoFocus={autoFocus}
          style={{ minHeight }}
          onInput={emit}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); emit() }}
          onPaste={e => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
            emit()
          }}
          onKeyDown={e => {

            if (e.key === 'Enter') e.stopPropagation()
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); link() }
          }}
        />
      </div>
    </div>
  )
}
