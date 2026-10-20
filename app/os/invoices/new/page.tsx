'use client'

import { useEffect, useState } from 'react'
import { InvoiceEditor, type InvoicePrefill, type InvoicePreset } from '@/components/os/InvoiceEditor'

export default function NewInvoicePage() {
  const [init, setInit] = useState<{ prefill?: InvoicePrefill; preset?: InvoicePreset } | undefined>(undefined)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const get = (k: string) => (q.get(k) ?? '').trim()
    const next: InvoicePrefill = {
      clientName: get('name'),
      clientEmail: get('email'),
      clientCompany: get('company'),
      clientPhone: get('phone'),
      clientAddress: get('address'),
    }
    const p = get('preset')
    const preset = p === 'strategy' || p === 'strategy-intro' ? p : undefined
    const prefill = Object.values(next).some(Boolean) ? next : undefined
    if (prefill || preset) setInit({ prefill, preset })
  }, [])

  return <InvoiceEditor key={init ? 'prefilled' : 'blank'} prefill={init?.prefill} preset={init?.preset} />
}
