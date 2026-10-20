'use client'
import { useEffect, useState } from 'react'
import { getPeople, type Person } from '@/lib/people'
import { hydrateFromSupabase } from '@/lib/crm-store'
import { hydrateEvents } from '@/lib/event-store'

export function usePeople(): Person[] {
  const [people, setPeople] = useState<Person[]>([])
  useEffect(() => {
    let live = true
    const read = () => { if (live) setPeople(getPeople()) }
    void Promise.resolve().then(read)
    void Promise.allSettled([hydrateFromSupabase(), hydrateEvents()]).then(read)
    return () => { live = false }
  }, [])
  return people
}
