'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getInvoiceById } from '@/lib/crm-store'
import type { Invoice } from '@/lib/crm-types'
import { InvoiceEditor } from '@/components/os/InvoiceEditor'

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null | undefined>(undefined) // undefined = loading

  useEffect(() => {
    const local = getInvoiceById(id)
    if (local) { setInvoice(local); return }

    fetch(`/api/public-invoice?id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => setInvoice((d?.invoice as Invoice) ?? null))
      .catch(() => setInvoice(null))
  }, [id])

  if (invoice === undefined) return <div style={{ padding: 40, color: 'var(--os-text-faint)' }}>Loading invoice…</div>
  if (invoice === null) {
    return (
      <div style={{ padding: 40, color: 'var(--os-text-muted)' }}>
        Invoice not found. <Link href="/os/invoices" style={{ color: 'var(--os-accent)', fontWeight: 700 }}>Back to invoices</Link>
      </div>
    )
  }
  return <InvoiceEditor key={invoice.id} invoice={invoice} />
}
