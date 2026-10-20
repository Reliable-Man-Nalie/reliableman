'use client'

import { useEffect, useState } from 'react'

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

interface SafeHtmlProps {
  html: string
  className?: string
  style?: React.CSSProperties
}

export function SafeHtml({ html, className, style }: SafeHtmlProps) {
  const [clean, setClean] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    import('isomorphic-dompurify')
      .then(({ default: DOMPurify }) => {
        if (alive) setClean(DOMPurify.sanitize(html))
      })
      .catch(() => {
        if (alive) setClean(null)
      })
    return () => {
      alive = false
    }
  }, [html])

  if (clean === null) {
    return <div className={className} style={style}>{stripTags(html)}</div>
  }
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: clean }} />
}
