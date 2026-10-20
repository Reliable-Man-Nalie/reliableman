'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDeals, getInvoices, getProposals, hydrateFromSupabase } from '@/lib/crm-store'
import { getPeople } from '@/lib/people'
import { invoiceTotal } from '@/lib/client-history'
import { buildCompanies, EMPTY_STORE, type Company, type CompanyProspectIn, type CompanyStage, type ProfileStore } from '@/lib/companies'

export const card: React.CSSProperties = { background: 'var(--os-card)', border: '1px solid var(--os-border)', borderRadius: 14, padding: 16 }
export const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--os-border)', background: 'var(--os-input-bg, transparent)', color: 'var(--os-text-primary)', fontSize: 16 }
export const pill = (c: string): React.CSSProperties => ({ display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color: c, border: `1px solid ${c}`, whiteSpace: 'nowrap' })
export const STAGE_TONE: Record<CompanyStage, string> = {
  client: 'var(--os-success, #16a34a)', pipeline: 'var(--os-accent)', outbound: 'var(--os-warn, #d97706)', prospect: 'var(--os-text-muted)', contact: 'var(--os-text-muted)',
}
export const OUT_LABEL: Record<string, string> = {
  new: 'Not started', active: 'In cadence', replied: 'Replied', meeting: 'Meeting booked', not_interested: 'Not interested', finished: 'Cadence finished', paused: 'Paused',
}
export const fmtMoney = (n: number, cur: string) => {
  const sym = cur === 'EUR' ? '€' : cur === 'AWG' ? 'Afl. ' : cur === 'XCG' ? 'XCG ' : '$'
  return sym + Math.round(n).toLocaleString()
}
export const ago = (iso: string) => {
  if (!iso) return ''
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 31 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`
}

export function useCompanies() {
  const [tick, setTick] = useState(0)
  const [store, setStore] = useState<ProfileStore>(EMPTY_STORE)
  const [prospects, setProspects] = useState<CompanyProspectIn[]>([])
  const [research, setResearch] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const fetchServer = useCallback(async () => {
    try {
      const res = await fetch('/api/os/companies', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) { setError(d.error || `Could not load company profiles (${res.status}).`); return }
      setStore(d.store ?? EMPTY_STORE); setProspects(d.prospects ?? []); setResearch(!!d.research); setError('')
    } catch { setError('Could not reach the server.') } finally { setLoaded(true) }
  }, [])

  useEffect(() => {
    const repaint = () => setTick(t => t + 1)
    window.addEventListener('bos:hydrated', repaint)

    void Promise.resolve().then(repaint)
    hydrateFromSupabase().then(repaint).catch(() => {})
    void Promise.resolve().then(fetchServer)
    return () => window.removeEventListener('bos:hydrated', repaint)
  }, [fetchServer])

  const people = useMemo(() => { void tick; return tick === 0 ? [] : getPeople() }, [tick])
  const companies = useMemo<Company[]>(() => {
    if (tick === 0) return []
    const invoices = getInvoices().map(i => ({
      id: i.id, number: i.number, email: (i.clientEmail ?? '').toLowerCase(), company: i.clientCompany, total: invoiceTotal(i),
      paid: i.status === 'paid' ? invoiceTotal(i) : (i.amountPaid ?? 0), currency: i.currency, status: i.status, date: i.paidAt || i.issueDate || i.createdAt,
    }))
    const proposals = getProposals().map(p => ({
      id: p.id, email: (p.clientEmail ?? '').toLowerCase(), company: p.clientCompany, title: p.title || p.ref, status: p.status,
      date: p.createdAt, value: p.total, currency: p.currency,
    }))
    const deals = getDeals().map(d => ({
      id: d.id, email: (d.clientEmail ?? '').toLowerCase(), company: d.clientCompany, title: d.service || d.clientName, status: d.stage,
      date: d.updatedAt || d.createdAt, value: d.value, currency: d.currency,
    }))
    return buildCompanies({
      people: people.map(p => ({ key: p.key, name: p.name, email: p.email, company: p.company, website: p.website, phone: p.phone, stage: p.stage, lastSeen: p.lastSeen })),
      invoices, proposals, deals, prospects, store,
    })
  }, [tick, people, prospects, store])

  const post = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch('/api/os/companies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (d.store) setStore(d.store)
      if (!res.ok || d.ok === false) { setError(d.error || `That did not work (${res.status}).`); return null }
      setError('')
      return d
    } catch { setError('Could not reach the server.'); return null }
  }, [])

  return { companies, people, store, research, loaded, error, setError, post, refresh: fetchServer }
}
