'use client'

import { useEffect } from 'react'
import { trackView } from '@/lib/track'

export default function FunnelView({ id }: { id: string }) {
  useEffect(() => { trackView(id) }, [id])
  return null
}
