'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getClientRecord, hydrateClients } from '@/lib/client-store'

export default function ClientRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    const go = () => {
      const c = getClientRecord(id)
      if (c?.email) { router.replace(`/os/contacts/${encodeURIComponent(c.email)}`); return true }
      return false
    }
    if (go()) return
    hydrateClients().then(() => { if (alive && !go()) setMissing(true) })
    return () => { alive = false }
  }, [id, router])

  return (
    <div style={{ padding: 32, color: 'var(--os-text-muted)', fontSize: 14 }}>
      {missing
        ? <>This client could not be found. <Link href="/os/clients" style={{ color: 'var(--os-accent)' }}>Back to clients</Link></>
        : 'Opening client…'}
    </div>
  )
}
