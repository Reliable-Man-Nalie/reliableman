'use client'

import type {
  Lead, Deal, Proposal, Invoice, InvoiceLineItem, PaymentMilestone, Offer, OfferCategory, BusinessExpense,
  ActivityEntry, ActivityType } from './crm-types'

import { isResultsBased, clientsInvoiced, commissionLines, proposalLang, COMMISSION_PHASE_BASE } from './results-billing'
import {
  recordWriteStart, recordWriteEnd, recordWriteFailure, recordWriteSuccess, failedWrites,
} from './sync-status'

const LEADS_KEY = 'bos_leads'
const DEALS_KEY = 'bos_deals'
const PROPOSALS_KEY = 'bos_proposals'
const INVOICES_KEY = 'bos_invoices'

const parseCache = new Map<string, { raw: string; value: unknown }>()

function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key) ?? '[]'
    const hit = parseCache.get(key)

    if (hit && hit.raw === raw) return (hit.value as T[]).slice()
    const value = JSON.parse(raw) as T[]
    parseCache.set(key, { raw, value })
    return value.slice()
  } catch {
    return []
  }
}

function save<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items))
}

function randHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  let s = ''
  for (const b of a) s += b.toString(16).padStart(2, '0')
  return s
}

function uid(): string {
  return randHex(12) // 96-bit, unguessable primary key
}

function getSupabase() {
  if (typeof window === 'undefined') return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || url === 'YOUR_SUPABASE_URL') return null

  return { url, key }
}

async function sbWrite(
  op: 'upsert' | 'delete',
  table: string,
  payload: Record<string, unknown> | string,
): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const key = `${op}:${table}:${typeof payload === 'string' ? payload : String(payload.id ?? '')}`
  const body = op === 'upsert'
    ? { op, table, row: payload as Record<string, unknown> }
    : { op, table, id: payload as string }

  recordWriteStart()
  try {
    const res = await fetch('/api/os-write', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    let ok = res.ok
    if (ok) {

      const data = await res.json().catch(() => null)
      if (data && data.ok === false) ok = false
      if (!ok) {
        recordWriteFailure({ key, op, table, payload, reason: String(data?.error ?? 'the database rejected it') })
        return false
      }
      recordWriteSuccess(key)
      return true
    }
    recordWriteFailure({ key, op, table, payload, reason: `${res.status} ${res.statusText}`.trim() })
    return false
  } catch (err) {
    recordWriteFailure({ key, op, table, payload, reason: err instanceof Error ? err.message : 'network error' })
    return false
  } finally {
    recordWriteEnd()
  }
}

function sbUpsert(table: string, row: Record<string, unknown>) {
  return sbWrite('upsert', table, row)
}

function sbDelete(table: string, id: string) {
  return sbWrite('delete', table, id)
}

export async function retryFailedWrites(): Promise<number> {

  const pending = failedWrites().filter(f => f.key.startsWith(`${f.op}:`))
  let stillFailing = 0
  for (const f of pending) {
    const ok = await sbWrite(f.op, f.table, f.payload)
    if (!ok) stillFailing++
  }
  return stillFailing
}

let hydrating: Promise<void> | null = null
export function hydrateFromSupabase(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (hydrating) return hydrating
  hydrating = hydrateOnce().finally(() => { hydrating = null })
  return hydrating
}

async function hydrateOnce(): Promise<void> {
  try {

    const res = await fetch('/api/os-data?parts=crm')
    if (!res.ok) return // not signed in as admin: nothing to hydrate
    const json = await res.json()
    if (!json?.ok) return
    const leads = { data: (json.leads ?? []) as Record<string, unknown>[] }
    const deals = { data: (json.deals ?? []) as Record<string, unknown>[] }
    const proposals = { data: (json.proposals ?? []) as Record<string, unknown>[] }
    const invoices = { data: (json.invoices ?? []) as Record<string, unknown>[] }
    if (deals.data?.length) {

      const seenContacts = new Set<string>()
      const dedupedDeals = deals.data.map(rowToDeal).filter(d => {
        const key = (d.clientEmail || d.clientPhone || '').trim().toLowerCase()
        if (!key) return true
        if (seenContacts.has(key)) return false
        seenContacts.add(key)
        return true
      })
      localStorage.setItem(DEALS_KEY, JSON.stringify(dedupedDeals))

      const dealLeads = dedupedDeals
        .filter(d => d.stage === 'lead' || d.stage === 'discovery')
        .map(d => ({
          id: d.id,
          name: d.clientName,
          email: d.clientEmail,
          phone: d.clientPhone,
          company: d.clientCompany,
          source: 'website',
          status: 'new' as const,
          notes: d.notes,
          createdAt: d.createdAt,
          role: d.clientRole,
          product: d.service,
        }))

      const existingLeads = leads.data?.length ? leads.data.map(rowToLead) : []
      const existingIds = new Set(existingLeads.map(l => l.id))
      const merged = [...existingLeads, ...dealLeads.filter(l => !existingIds.has(l.id))]
      if (merged.length) localStorage.setItem(LEADS_KEY, JSON.stringify(merged))
    } else if (leads.data?.length) {
      localStorage.setItem(LEADS_KEY, JSON.stringify(leads.data.map(rowToLead)))
    }

    if (proposals.data?.length) {
      const mapped = proposals.data.map(rowToProposal)
      const seenOriginals = new Map<string, Proposal>()
      const kept: Proposal[] = []
      for (const p of mapped.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
        const dupeKey = p.parentProposalId ? '' : p.clientEmail.toLowerCase()
        if (dupeKey && seenOriginals.has(dupeKey)) {

          sbDelete('proposals', p.id)
          continue
        }
        if (dupeKey) seenOriginals.set(dupeKey, p)
        kept.push(p)
      }
      localStorage.setItem(PROPOSALS_KEY, JSON.stringify(kept))
    }
    if (invoices.data?.length)  localStorage.setItem(INVOICES_KEY,  JSON.stringify(invoices.data.map(rowToInvoice)))

    window.dispatchEvent(new CustomEvent('bos:hydrated'))
  } catch { /* non-blocking */ }
}

function leadToRow(l: Lead): Record<string, unknown> {
  return {
    id: l.id, name: l.name, email: l.email,
    phone: l.phone ?? null, company: l.company ?? null,
    source: l.source ?? 'manual', status: l.status ?? 'new',
    notes: l.notes ?? null, role: l.role ?? null,
    company_size: l.companySize ?? null, product: l.product ?? null,
    website: l.website ?? null,
    tags: l.tags ?? [], activity: l.activity ?? [],
    created_at: l.createdAt,
  }
}

function rowToLead(r: Record<string, unknown>): Lead {
  const g = <T,>(k: string): T => r[k] as T
  return {
    id: g('id'), name: g('name'), email: g('email'),
    phone: g('phone') ?? undefined, company: g('company') ?? undefined,
    source: g('source') ?? 'manual', status: g('status') ?? 'new',
    notes: g('notes') ?? undefined, createdAt: g('created_at') ?? new Date().toISOString(),
    role: g('role') ?? undefined, companySize: g('company_size') ?? undefined, product: g('product') ?? undefined,
    website: g('website') ?? undefined,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : undefined,
    activity: Array.isArray(r.activity) ? (r.activity as ActivityEntry[]) : undefined,
  }
}

export function getLeads(): Lead[] { return load<Lead>(LEADS_KEY) }

export function saveLead(lead: Omit<Lead, 'id' | 'createdAt'>): Lead {
  const createdAt = new Date().toISOString()

  const arrival: ActivityEntry = {
    id: uid(), ts: createdAt, type: 'note',
    text: `Entered the system${lead.source ? ` via ${lead.source}` : ''}.`,
  }
  const item: Lead = { ...lead, id: uid(), createdAt, activity: [arrival, ...(lead.activity ?? [])] }
  save(LEADS_KEY, [item, ...getLeads()])
  sbUpsert('leads', leadToRow(item))
  return item
}

export function logLeadActivity(id: string, type: ActivityType, text: string): void {
  const entry: ActivityEntry = { id: uid(), ts: new Date().toISOString(), type, text }
  const updated = getLeads().map(l => l.id === id ? { ...l, activity: [entry, ...(l.activity ?? [])] } : l)
  save(LEADS_KEY, updated)
  const row = updated.find(l => l.id === id)
  if (row) sbUpsert('leads', leadToRow(row))
}

export function updateLead(id: string, patch: Partial<Lead>): void {
  const updated = getLeads().map(l => l.id === id ? { ...l, ...patch } : l)
  save(LEADS_KEY, updated)
  const row = updated.find(l => l.id === id)
  if (row) sbUpsert('leads', leadToRow(row))
}

export function deleteLead(id: string): void {
  save(LEADS_KEY, getLeads().filter(l => l.id !== id))
  sbDelete('leads', id)
}

export function getDeals(): Deal[] { return load<Deal>(DEALS_KEY) }

export function saveDeal(deal: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'>): Deal {
  const now = new Date().toISOString()
  const item: Deal = { ...deal, id: uid(), createdAt: now, updatedAt: now }
  save(DEALS_KEY, [item, ...getDeals()])
  sbUpsert('deals', dealToRow(item))
  return item
}

export function updateDeal(id: string, patch: Partial<Deal>): void {
  const now = new Date().toISOString()
  const updated = getDeals().map(d => d.id === id ? { ...d, ...patch, updatedAt: now } : d)
  save(DEALS_KEY, updated)
  const row = updated.find(d => d.id === id)
  if (row) sbUpsert('deals', dealToRow(row))

  if (patch.stage === 'signed' && row) {
    promoteToActiveClient(row)
  }
}

function promoteToActiveClient(deal: Deal): void {
  if (typeof window === 'undefined') return
  try {
    const CLIENTS_KEY = 'bos_clients'
    type MinClient = { id: string; dealId?: string; email: string; deliveryStage?: string }
    const clients: MinClient[] = JSON.parse(localStorage.getItem(CLIENTS_KEY) ?? '[]')
    const already = clients.find(c => c.dealId === deal.id || c.email.toLowerCase() === deal.clientEmail.toLowerCase())
    if (already) {

      if (!already.deliveryStage) {
        const patched = clients.map(c => c.id === already.id ? { ...c, deliveryStage: 'Kickoff Call', status: 'active' } : c)
        localStorage.setItem(CLIENTS_KEY, JSON.stringify(patched))
      }
      return
    }
    const newClient = {
      id: uid(),
      token: randHex(16),
      dealId: deal.id,
      name: deal.clientName,
      email: deal.clientEmail,
      phone: deal.clientPhone ?? '',
      company: deal.clientCompany ?? '',
      program: '',
      status: 'active',
      deliveryStage: 'Kickoff Call',
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      coachNote: `Auto-promoted from signed deal. Service: ${deal.service ?? '—'}. Value: $${deal.value ?? 0}.`,
    }
    localStorage.setItem(CLIENTS_KEY, JSON.stringify([newClient, ...clients]))
    window.dispatchEvent(new CustomEvent('bos:client-promoted', { detail: newClient }))
  } catch { /* non-blocking */ }
}

export function deleteDeal(id: string): void {
  save(DEALS_KEY, getDeals().filter(d => d.id !== id))
  sbDelete('deals', id)
}

export function dealToRow(d: Deal): Record<string, unknown> {
  return {
    id: d.id, lead_id: d.leadId ?? null, client_name: d.clientName, client_email: d.clientEmail,
    client_company: d.clientCompany ?? null, stage: d.stage, value: d.value, currency: d.currency,
    service: d.service ?? null, notes: d.notes ?? null, created_at: d.createdAt, updated_at: d.updatedAt,
    client_phone: d.clientPhone ?? null, client_vat: d.clientVat ?? null, client_address: d.clientAddress ?? null,
    client_website: d.clientWebsite ?? null, client_role: d.clientRole ?? null,
    location: d.location ?? null, instagram: d.instagram ?? null, priority: d.priority ?? null,
    next_step: d.nextStep ?? null, next_step_date: d.nextStepDate ?? null,
    current_state: d.currentState ?? null, desired_outcome: d.desiredOutcome ?? null, goals: d.goals ?? null,
    blockers: d.blockers ?? null, budget: d.budget ?? null, activity: d.activity ?? [], tags: d.tags ?? [],
    revenue_type: d.revenueType ?? null, retainer_months: d.retainerMonths ?? null, close_date: d.closeDate ?? null,
    organization: d.organization ?? null,
  }
}

export function rowToDeal(r: Record<string, unknown>): Deal {
  const g = <T,>(k: string): T => r[k] as T
  return {
    id: g('id'), leadId: g('lead_id') ?? undefined, clientName: g('client_name'), clientEmail: g('client_email'),
    clientCompany: g('client_company') ?? undefined, stage: g('stage'), value: g('value') ?? 0, currency: g('currency') ?? 'USD',
    service: g('service') ?? '', notes: g('notes') ?? undefined, createdAt: g('created_at'), updatedAt: g('updated_at') ?? g('created_at'),
    clientPhone: g('client_phone') ?? undefined, clientVat: g('client_vat') ?? undefined,
    clientAddress: g('client_address') ?? undefined,
    clientWebsite: g('client_website') ?? undefined, clientRole: g('client_role') ?? undefined,
    location: g('location') ?? undefined, instagram: g('instagram') ?? undefined, priority: g('priority') ?? undefined,
    nextStep: g('next_step') ?? undefined, nextStepDate: g('next_step_date') ?? undefined,
    currentState: g('current_state') ?? undefined, desiredOutcome: g('desired_outcome') ?? undefined, goals: g('goals') ?? undefined,
    blockers: g('blockers') ?? undefined, budget: g('budget') ?? undefined,
    activity: (g('activity') as Deal['activity']) ?? [], tags: (g('tags') as string[]) ?? [],
    revenueType: g('revenue_type') ?? undefined, retainerMonths: g('retainer_months') ?? undefined,
    closeDate: g('close_date') ?? undefined, organization: g('organization') ?? undefined,
  }
}

export function getProposals(): Proposal[] { return allProposals().filter(p => !p.deletedAt) }
export function allProposals(): Proposal[] { return load<Proposal>(PROPOSALS_KEY) }
export function getDeletedProposals(): Proposal[] { return allProposals().filter(p => !!p.deletedAt) }

export function nextProposalRef(): string {
  const prefix = `PRP-${new Date().getFullYear()}-`

  const highest = allProposals().reduce((max, p) => {
    if (!p.ref?.startsWith(prefix)) return max
    const n = parseInt(p.ref.slice(prefix.length), 10)
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return prefix + String(highest + 1).padStart(3, '0')
}

export function saveProposal(p: Omit<Proposal, 'id' | 'token' | 'createdAt' | 'ref'>): Proposal {
  const id = uid()
  const token = shortToken()
  const ref = nextProposalRef()
  const item: Proposal = { ...p, id, token, ref, createdAt: new Date().toISOString() }
  save(PROPOSALS_KEY, [item, ...getProposals()])
  sbUpsert('proposals', proposalToRow(item))
  return item
}

export function updateProposal(id: string, patch: Partial<Proposal>): void {
  const updated = getProposals().map(p => p.id === id ? { ...p, ...patch } : p)
  save(PROPOSALS_KEY, updated)
  const row = updated.find(p => p.id === id)
  if (row) sbUpsert('proposals', proposalToRow(row))
}

export function voidProposal(id: string, reason?: string): void {
  updateProposal(id, { status: 'void', notes: reason ? `VOIDED: ${reason}` : 'VOIDED' })
}

export function deleteProposal(id: string): void {
  const at = new Date().toISOString()
  const next = allProposals().map(p => p.id === id ? { ...p, deletedAt: at } : p)
  save(PROPOSALS_KEY, next)
  const row = next.find(p => p.id === id)
  if (row) sbUpsert('proposals', proposalToRow(row))
}

export function restoreProposal(id: string): void {
  const next = allProposals().map(p => p.id === id ? { ...p, deletedAt: undefined } : p)
  save(PROPOSALS_KEY, next)
  const row = next.find(p => p.id === id)
  if (row) sbUpsert('proposals', proposalToRow(row))
}

export function destroyProposal(id: string): void {
  save(PROPOSALS_KEY, allProposals().filter(p => p.id !== id))
  sbDelete('proposals', id)
}

export const TRASH_DAYS = 30

export function trashDaysLeft(deletedAt?: string): number {
  if (!deletedAt) return 0
  const gone = new Date(deletedAt).getTime() + TRASH_DAYS * 86_400_000
  return Math.max(0, Math.ceil((gone - Date.now()) / 86_400_000))
}

function proposalToRow(p: Proposal): Record<string, unknown> {
  return {
    id: p.id, token: p.token, ref: p.ref, deal_id: p.dealId ?? null,
    deleted_at: p.deletedAt ?? null,
    client_name: p.clientName, client_email: p.clientEmail, client_company: p.clientCompany ?? null,
    client_phone: p.clientPhone ?? null, client_address: p.clientAddress ?? null,
    client_vat: p.clientVat ?? null,

    one_time: p.oneTime ?? null,
    title: p.title, intro: p.intro,
    services: p.services, deliverables: p.deliverables, payment_schedule: p.paymentSchedule,
    total: p.total, currency: p.currency, valid_days: p.validDays, status: p.status,
    payment_link: p.paymentLink ?? null, bank_info: p.bankInfo ?? null, notes: p.notes ?? null,

    payment_methods: p.paymentMethods ?? null,
    created_at: p.createdAt, sent_at: p.sentAt ?? null, signed_at: p.signedAt ?? null,
    signer_name: p.signerName ?? null, signer_signature: p.signerSignature ?? null,
    offer_id: p.offerId ?? null,
    linked_invoice_id: p.linkedInvoiceId ?? null,
    billing_day: p.billingDay ?? 1,
    version: p.version ?? 1,
    parent_proposal_id: p.parentProposalId ?? null,
  }
}

export function getProposalByToken(token: string): Proposal | null {
  return getProposals().find(p => p.token === token) ?? null
}

export function shortToken(): string {
  return randHex(16)
}

function rowToProposal(r: Record<string, unknown>): Proposal {
  const g = <T,>(k: string): T => r[k] as T
  return {
    id: g('id'), token: g('token'), dealId: g('deal_id') ?? undefined, ref: g('ref'),
    deletedAt: g('deleted_at') ?? undefined,
    clientName: g('client_name'), clientEmail: g('client_email'), clientCompany: g('client_company') ?? undefined,
    clientPhone: g('client_phone') ?? undefined, clientAddress: g('client_address') ?? undefined,
    clientVat: g('client_vat') ?? undefined,
    oneTime: typeof r.one_time === 'boolean' ? r.one_time : undefined,
    title: g('title'), intro: g('intro'),
    services: (g('services') as string[]) ?? [], deliverables: (g('deliverables') as string[]) ?? [],
    paymentSchedule: (g('payment_schedule') as PaymentMilestone[]) ?? [],
    total: g('total'), currency: g('currency'), validDays: g('valid_days'), status: g('status'),
    paymentLink: g('payment_link') ?? undefined, bankInfo: g('bank_info') ?? undefined, notes: g('notes') ?? undefined,
    paymentMethods: (g('payment_methods') as unknown as string[]) ?? undefined,
    createdAt: g('created_at'), sentAt: g('sent_at') ?? undefined, viewedAt: g('viewed_at') ?? undefined, signedAt: g('signed_at') ?? undefined,
    signerName: g('signer_name') ?? undefined, signerSignature: g('signer_signature') ?? undefined,
    offerId: g('offer_id') ?? undefined,
    linkedInvoiceId: g('linked_invoice_id') ?? undefined,
    billingDay: (g('billing_day') as 1 | 15) ?? 1, version: g('version') ?? 1,
    parentProposalId: g('parent_proposal_id') ?? undefined,
  }
}

export function rowToInvoice(r: Record<string, unknown>): Invoice {
  const g = <T,>(k: string): T => r[k] as T
  return {
    id: g('id'), number: g('number'),
    clientName: g('client_name'), clientEmail: g('client_email'), clientCompany: g('client_company') ?? undefined,
    clientAddress: g('client_address') ?? undefined, clientPhone: g('client_phone') ?? undefined,
    clientVat: g('client_vat') ?? undefined,
    projectTitle: g('project_title') ?? undefined, lineItems: (g('line_items') as Invoice['lineItems']) ?? [],
    taxes: g('taxes'), taxLabel: g('tax_label') ?? undefined, taxRate: g('tax_rate') ?? undefined,
    amountPaid: g('amount_paid'), currency: g('currency'), status: g('status'),
    notes: g('notes') ?? undefined, issueDate: g('issue_date'), dueDate: g('due_date'),
    createdAt: g('created_at'), sentAt: g('sent_at') ?? undefined, viewedAt: g('viewed_at') ?? undefined, paidAt: g('paid_at') ?? undefined,
    reminders: (g('reminders') as Invoice['reminders']) ?? undefined,
    deletedAt: g('deleted_at') ?? undefined,
    proposalId: g('proposal_id') ?? undefined, phaseIndex: g('phase_index') ?? undefined,
    recurring: g('recurring') ?? undefined, recurringDay: g('recurring_day') ?? undefined, recurringParentId: g('recurring_parent_id') ?? undefined,
    recurringOverrides: (g('recurring_overrides') as Invoice['recurringOverrides']) ?? undefined,
  }
}

export async function getProposalByTokenRemote(token: string): Promise<Proposal | null> {
  const cfg = getSupabase()
  if (!cfg) return null
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(cfg.url, cfg.key)
    const { data } = await sb.from('proposals').select('*').eq('token', token).order('created_at', { ascending: true }).limit(1)
    return data && data.length ? rowToProposal(data[0]) : null
  } catch {
    return null
  }
}

export async function getProposalByIdRemote(id: string): Promise<Proposal | null> {
  const cfg = getSupabase()
  if (!cfg) return null
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(cfg.url, cfg.key)
    const { data } = await sb.from('proposals').select('*').eq('id', id).maybeSingle()
    return data ? rowToProposal(data) : null
  } catch {
    return null
  }
}

export async function getInvoiceRemote(idOrNumber: string): Promise<Invoice | null> {
  const cfg = getSupabase()
  if (!cfg) return null
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(cfg.url, cfg.key)
    const byId = await sb.from('invoices').select('*').eq('id', idOrNumber).limit(1)
    if (byId.data && byId.data.length) return rowToInvoice(byId.data[0])
    const byNum = await sb.from('invoices').select('*').eq('number', idOrNumber).order('created_at', { ascending: false }).limit(1)
    return byNum.data && byNum.data.length ? rowToInvoice(byNum.data[0]) : null
  } catch {
    return null
  }
}

export function reviseProposal(id: string): Proposal | null {
  const original = getProposals().find(p => p.id === id)
  if (!original) return null
  const rootId = original.parentProposalId ?? original.id
  const siblings = getProposals().filter(p => (p.parentProposalId ?? p.id) === rootId)
  const nextVersion = Math.max(...siblings.map(p => p.version ?? 1)) + 1
  const newId = uid()
  const ref = original.ref + ` v${nextVersion}`
  const token = shortToken()
  const copy: Proposal = {
    ...original,
    id: newId,
    token,
    ref,
    status: 'draft',
    version: nextVersion,
    parentProposalId: rootId,
    createdAt: new Date().toISOString(),
    sentAt: undefined,
    signedAt: undefined,
    signerName: undefined,
    linkedInvoiceId: undefined,
  }
  save(PROPOSALS_KEY, [copy, ...getProposals()])
  sbUpsert('proposals', proposalToRow(copy))
  return copy
}

export function duplicateProposal(id: string): Proposal | null {
  const original = getProposals().find(p => p.id === id)
  if (!original) return null
  const newId = uid()
  const ref = nextProposalRef()
  const token = shortToken()
  const copy: Proposal = {
    ...original,
    id: newId,
    token,
    ref,
    status: 'draft',
    createdAt: new Date().toISOString(),
    sentAt: undefined,
    signedAt: undefined,
    signerName: undefined,
    linkedInvoiceId: undefined,
  }
  save(PROPOSALS_KEY, [copy, ...getProposals()])
  sbUpsert('proposals', proposalToRow(copy))
  return copy
}

export function getInvoices(): Invoice[] { return allInvoices().filter(i => !i.deletedAt) }
export function allInvoices(): Invoice[] { return load<Invoice>(INVOICES_KEY) }
export function getDeletedInvoices(): Invoice[] { return allInvoices().filter(i => !!i.deletedAt) }

function nextInvoiceNumber(): string {

  const existing = allInvoices()
  if (existing.length === 0) {
    const year = new Date().getFullYear()
    return `${year}126`
  }
  const nums = existing.map(i => parseInt(i.number, 10)).filter(n => !isNaN(n))
  return String(Math.max(...nums) + 1)
}

export function saveInvoice(inv: Omit<Invoice, 'id' | 'number' | 'createdAt'>): Invoice {
  const item: Invoice = {
    ...inv,
    id: uid(),
    number: nextInvoiceNumber(),
    createdAt: new Date().toISOString(),
  }
  save(INVOICES_KEY, [item, ...getInvoices()])
  sbUpsert('invoices', invoiceToRow(item))
  return item
}

export function updateInvoice(id: string, patch: Partial<Invoice>): void {
  const updated = getInvoices().map(i => i.id === id ? { ...i, ...patch } : i)
  save(INVOICES_KEY, updated)
  const row = updated.find(i => i.id === id)
  if (row) sbUpsert('invoices', invoiceToRow(row))
}

export function deleteInvoice(id: string): void {
  const at = new Date().toISOString()
  const next = allInvoices().map(i => i.id === id ? { ...i, deletedAt: at } : i)
  save(INVOICES_KEY, next)
  const row = next.find(i => i.id === id)
  if (row) sbUpsert('invoices', invoiceToRow(row))
}

export function restoreInvoice(id: string): void {
  const next = allInvoices().map(i => i.id === id ? { ...i, deletedAt: undefined } : i)
  save(INVOICES_KEY, next)
  const row = next.find(i => i.id === id)
  if (row) sbUpsert('invoices', invoiceToRow(row))
}

export function destroyInvoice(id: string): void {
  save(INVOICES_KEY, allInvoices().filter(i => i.id !== id))
  sbDelete('invoices', id)
}

function invoiceToRow(i: Invoice): Record<string, unknown> {
  return {
    id: i.id, number: i.number,
    client_name: i.clientName, client_email: i.clientEmail, client_company: i.clientCompany ?? null,
    client_address: i.clientAddress ?? null, client_phone: i.clientPhone ?? null,

    client_vat: i.clientVat ?? null,
    project_title: i.projectTitle ?? null, line_items: i.lineItems, taxes: i.taxes,
    tax_label: i.taxLabel ?? null, tax_rate: i.taxRate ?? null,
    amount_paid: i.amountPaid, currency: i.currency, status: i.status, notes: i.notes ?? null,
    issue_date: i.issueDate, due_date: i.dueDate,
    created_at: i.createdAt, sent_at: i.sentAt ?? null, paid_at: i.paidAt ?? null,
    reminders: i.reminders ?? [],
    deleted_at: i.deletedAt ?? null,
    proposal_id: i.proposalId ?? null, phase_index: i.phaseIndex ?? null,
    recurring: i.recurring ?? false, recurring_day: i.recurringDay ?? null, recurring_parent_id: i.recurringParentId ?? null,
    recurring_overrides: i.recurringOverrides && Object.keys(i.recurringOverrides).length ? i.recurringOverrides : null,
  }
}

export function getInvoiceById(id: string): Invoice | null {
  return getInvoices().find(i => i.id === id) ?? null
}

export function computeInvoiceStatus(inv: Invoice): Invoice['status'] {
  if (inv.status === 'paid') return 'paid'

  if (inv.status === 'void') return 'void'
  if (inv.status === 'draft') return 'draft'
  if (new Date(inv.dueDate) < new Date()) return 'overdue'
  return 'sent'
}

export function lineItemId(): string {
  return uid()
}

export function invoiceTotal(lineItems: InvoiceLineItem[], taxes: number): number {
  const sub = lineItems.reduce((s, li) => s + li.quantity * li.price, 0)
  return sub + taxes
}

export function duplicateInvoice(id: string): Invoice | null {
  const original = getInvoiceById(id)
  if (!original) return null
  const copy: Invoice = {
    ...original,
    id: uid(),
    number: nextInvoiceNumber(),
    status: 'draft',
    createdAt: new Date().toISOString(),
    sentAt: undefined,
    paidAt: undefined,
    amountPaid: 0,

    recurring: false,
    recurringDay: undefined,
    recurringParentId: undefined,
    recurringOverrides: undefined,
    reminders: undefined,
  }
  save(INVOICES_KEY, [copy, ...getInvoices()])
  sbUpsert('invoices', invoiceToRow(copy))
  return copy
}

export function createInvoiceFromProposal(proposal: Proposal): Invoice {

  const existingInvoice = getInvoices().find(
    i => i.proposalId === proposal.id && (i.phaseIndex ?? 0) === 0
  )
  if (existingInvoice) {
    if (proposal.linkedInvoiceId !== existingInvoice.id) {
      updateProposal(proposal.id, { linkedInvoiceId: existingInvoice.id })
    }
    return existingInvoice
  }

  const today = new Date()
  const due = new Date(today)
  due.setDate(due.getDate() + 7)

  const firstPhase = proposal.paymentSchedule[0]
  const lineItems: InvoiceLineItem[] = firstPhase ? [{
    id: lineItemId(),
    name: firstPhase.label,
    description: firstPhase.note,
    quantity: 1,
    price: firstPhase.amount,
  }] : []

  const invoice = saveInvoice({
    clientName: proposal.clientName,
    clientEmail: proposal.clientEmail,
    clientCompany: proposal.clientCompany,
    projectTitle: proposal.title,
    lineItems,
    taxes: 0,
    amountPaid: 0,
    currency: proposal.currency,
    status: 'sent',
    notes: `First month retainer. Generated from signed proposal ${proposal.ref}.\n\nRemaining months will be invoiced automatically each month as the partnership grows.`,
    issueDate: today.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    proposalId: proposal.id,
    phaseIndex: 0,
  })

  updateProposal(proposal.id, { linkedInvoiceId: invoice.id })
  return invoice
}

export function nextUnbilledPhase(proposal: Proposal): number {

  if (isResultsBased(proposal)) return -1
  const billed = new Set(
    getInvoices().filter(i => i.proposalId === proposal.id).map(i => i.phaseIndex ?? 0),
  )
  return proposal.paymentSchedule.findIndex((_, i) => !billed.has(i))
}

export function createPhaseInvoice(proposal: Proposal, phaseIndex: number): Invoice | null {
  const phase = proposal.paymentSchedule[phaseIndex]
  if (!phase) return null
  const existing = getInvoices().find(
    i => i.proposalId === proposal.id && (i.phaseIndex ?? 0) === phaseIndex,
  )
  if (existing) return existing

  const today = new Date()
  const due = new Date(today)
  due.setDate(due.getDate() + 7)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const steps = proposal.paymentSchedule.length

  return saveInvoice({
    clientName: proposal.clientName,
    clientEmail: proposal.clientEmail,
    clientCompany: proposal.clientCompany,
    clientPhone: proposal.clientPhone,
    clientAddress: proposal.clientAddress,
    clientVat: proposal.clientVat,
    projectTitle: proposal.title,
    lineItems: [{
      id: lineItemId(),
      name: `${proposal.title}: ${phase.label}`,
      description: phase.note,
      quantity: 1,
      price: phase.amount,
    }],
    taxes: 0,
    amountPaid: 0,
    currency: proposal.currency,
    status: 'draft',
    notes: `${phase.label}, payment ${phaseIndex + 1} of ${steps}, per the signed proposal ${proposal.ref}.`,
    issueDate: iso(today),
    dueDate: iso(due),
    proposalId: proposal.id,
    phaseIndex,
  })
}

export function createCommissionInvoice(
  proposal: Proposal,
  newClients: number,
  period?: string,
): { invoice: Invoice | null; billed: number; beyondCap: number } {
  const all = allInvoices()
  const already = clientsInvoiced(proposal.id, all)
  const lang = proposalLang(proposal)
  const { lines, billed, beyondCap } = commissionLines(proposal.paymentSchedule, already, newClients, lang, lineItemId)
  if (!lines.length) return { invoice: null, billed: 0, beyondCap }

  const used = new Set(all.filter(i => i.proposalId === proposal.id).map(i => i.phaseIndex ?? 0))
  let phaseIndex = COMMISSION_PHASE_BASE
  while (used.has(phaseIndex)) phaseIndex++

  const today = new Date()
  const due = new Date(today)
  due.setDate(due.getDate() + 7)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const total = already + billed
  const when = (period ?? '').trim()

  const invoice = saveInvoice({
    clientName: proposal.clientName,
    clientEmail: proposal.clientEmail,
    clientCompany: proposal.clientCompany,
    clientPhone: proposal.clientPhone,
    clientAddress: proposal.clientAddress,
    clientVat: proposal.clientVat,
    projectTitle: proposal.title,
    lineItems: lines,
    taxes: 0,
    amountPaid: 0,
    currency: proposal.currency,
    status: 'draft',
    notes: lang === 'es'
      ? `Comisión por clientes nuevos${when ? ` de ${when}` : ''}, según el acuerdo firmado ${proposal.ref}. ${billed === 1 ? '1 cliente nuevo' : `${billed} clientes nuevos`}; ${total} en total desde el inicio del acuerdo.`
      : `Commission for new clients${when ? ` in ${when}` : ''}, per the signed agreement ${proposal.ref}. ${billed} new ${billed === 1 ? 'client' : 'clients'}; ${total} in total since the agreement began.`,
    issueDate: iso(today),
    dueDate: iso(due),
    proposalId: proposal.id,
    phaseIndex,
  })
  return { invoice, billed, beyondCap }
}

const OFFERS_KEY = 'bos_offers'

function offerToRow(o: Offer): Record<string, unknown> {
  return {
    id: o.id, category: o.category, pyramid_tier: o.pyramidTier ?? null, name: o.name, tagline: o.tagline,
    price: o.price, currency: o.currency, billing_type: o.billingType,
    services: o.services, deliverables: o.deliverables, payment_schedule: o.paymentSchedule,
    notes: o.notes ?? null, active: o.active, created_at: o.createdAt,
  }
}

export function getOffers(): Offer[] {
  return load<Offer>(OFFERS_KEY)
}

export function saveOffer(data: Omit<Offer, 'id' | 'createdAt'>): Offer {
  const offer: Offer = { ...data, id: randHex(12), createdAt: new Date().toISOString() }
  save(OFFERS_KEY, [offer, ...getOffers()])
  sbUpsert('offers', offerToRow(offer))
  return offer
}

export function updateOffer(id: string, updates: Partial<Offer>): Offer | null {
  const list = getOffers().map(o => o.id === id ? { ...o, ...updates } : o)
  save(OFFERS_KEY, list)
  const updated = list.find(o => o.id === id) ?? null
  if (updated) sbUpsert('offers', offerToRow(updated))
  return updated
}

export function deleteOffer(id: string): void {
  save(OFFERS_KEY, getOffers().filter(o => o.id !== id))
  sbDelete('offers', id)
}

export function migrateOfferCategories(): void {
  if (typeof window === 'undefined') return
  const remap: Record<string, OfferCategory> = { 'ai-business': 'Partner', 'coaching-consulting': 'coaching' }
  const list = getOffers()
  let changed = false
  const next = list.map(o => {
    const mapped = remap[o.category as string]
    if (mapped) { changed = true; return { ...o, category: mapped } }
    return o
  })
  if (changed) { save(OFFERS_KEY, next); for (const o of next) sbUpsert('offers', offerToRow(o)) }
}

export function seedDefaultOffers(): void {
  migrateOfferCategories()
}

const EXPENSES_KEY = 'bos_expenses'

function expenseToRow(e: BusinessExpense): Record<string, unknown> {
  return {
    id: e.id, name: e.name, category: e.category, amount: e.amount,
    frequency: e.frequency, currency: e.currency, notes: e.notes ?? null,
    date: e.date ?? null,
    created_at: e.createdAt,

    ...(e.receiptPath ? { receipt_path: e.receiptPath } : {}),
  }
}

export function rowToExpense(r: Record<string, unknown>): BusinessExpense {
  const g = <T,>(k: string): T => r[k] as T
  return {
    id: String(g('id')), name: String(g('name') ?? ''),
    category: (g('category') ?? 'other') as BusinessExpense['category'],
    amount: Number(g('amount')) || 0,
    frequency: (g('frequency') ?? 'monthly') as BusinessExpense['frequency'],
    currency: (g('currency') ?? 'USD') as BusinessExpense['currency'],
    notes: g('notes') ?? undefined,
    date: g('date') ? String(g('date')).slice(0, 10) : undefined,
    receiptPath: g('receipt_path') ? String(g('receipt_path')) : undefined,
    createdAt: String(g('created_at') ?? new Date().toISOString()),
  }
}

export function setExpensesFromRows(rows: Record<string, unknown>[]): void {
  save(EXPENSES_KEY, rows.map(rowToExpense))
}

export function getExpenses(): BusinessExpense[] {
  return load<BusinessExpense>(EXPENSES_KEY)
}

export function saveExpense(data: Omit<BusinessExpense, 'id' | 'createdAt'>): BusinessExpense {
  const expense: BusinessExpense = { ...data, id: randHex(12), createdAt: new Date().toISOString() }
  save(EXPENSES_KEY, [expense, ...getExpenses()])
  sbUpsert('business_expenses', expenseToRow(expense))
  return expense
}

export function updateExpense(id: string, updates: Partial<BusinessExpense>): BusinessExpense | null {
  const list = getExpenses().map(e => e.id === id ? { ...e, ...updates } : e)
  save(EXPENSES_KEY, list)
  const updated = list.find(e => e.id === id) ?? null
  if (updated) sbUpsert('business_expenses', expenseToRow(updated))
  return updated
}

export function deleteExpense(id: string): void {
  save(EXPENSES_KEY, getExpenses().filter(e => e.id !== id))
  sbDelete('business_expenses', id)
}
