const FREE_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.nl', 'outlook.com', 'live.com', 'live.nl', 'msn.com',
  'yahoo.com', 'yahoo.nl', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'setarnet.aw', 'setarnet.net', 'cura.net', 'onenet.cw', 'kpnmail.nl',
  'ziggo.nl', 'planet.nl', 'home.nl', 'telfort.nl', 'example.com',
])

const NOT_A_SITE = /(^|\.)(facebook|fb|instagram|linkedin|linktr|wixsite|wix|squarespace|godaddysites|google|business\.site|tripadvisor|booking|airbnb|youtube|tiktok|x|twitter|wa)\.(com|me|ee|site|be)$/i

const LEGAL = /\b(n\.?\s?v|b\.?\s?v|v\.?\s?b\.?\s?a|llc|l\.?l\.?c|inc|ltd|limited|corp|corporation|co|company|gmbh|s\.?a|holding|holdings|group|groep)\b\.?/gi

export function nameSlug(name: string): string {
  const s = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(LEGAL, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s.length >= 2 ? s : ''
}

export function domainOf(raw?: string | null): string {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v) return ''
  let host = ''
  if (v.includes('@') && !v.includes('/')) host = v.split('@').pop() ?? ''
  else {
    try { host = new URL(/^https?:\/\//.test(v) ? v : `https://${v}`).hostname } catch { return '' }
  }
  host = host.replace(/^www\./, '')
  if (!host.includes('.') || FREE_DOMAINS.has(host) || NOT_A_SITE.test(host)) return ''
  return host
}

export function tokensFor(r: { company?: string | null; website?: string | null; email?: string | null }): string[] {
  const t: string[] = []
  const d = domainOf(r.website) || domainOf(r.email)
  if (d) t.push(d)
  const n = nameSlug(r.company ?? '')
  if (n) t.push(`n:${n}`)
  return t
}

export function companyKeyFor(r: { company?: string | null; website?: string | null; email?: string | null }): string {
  return tokensFor(r)[0] ?? ''
}

export interface CompanyBrief {
  summary: string
  whatTheyDo: string
  size: string
  people: { name: string; role: string; source?: string }[]
  signals: string[]
  angle: string

  hook: string
  questions: string[]
  sources: string[]
  at: string
  by: 'ai'
}

export interface CompanyProfile {

  manual?: boolean
  name?: string
  website?: string
  industry?: string
  notes?: string

  roles?: Record<string, string>
  brief?: CompanyBrief
  briefError?: string
  updatedAt?: string
}

export interface ProfileStore {
  companies: Record<string, CompanyProfile>

  assign: Record<string, string>
}
export const EMPTY_STORE: ProfileStore = { companies: {}, assign: {} }

export type CompanyStage = 'client' | 'pipeline' | 'outbound' | 'prospect' | 'contact'
export const STAGE_LABEL: Record<CompanyStage, string> = {
  client: 'Client', pipeline: 'In pipeline', outbound: 'Outbound running', prospect: 'Outbound list', contact: 'Contact',
}

export interface CompanyPersonIn {
  key: string; name: string; email: string; company: string; website: string; phone: string
  stage: 'client' | 'lead' | 'contact'; lastSeen: string
}
export interface CompanyInvoiceIn { id: string; number: string; email: string; company?: string; total: number; paid: number; currency: string; status: string; date: string }
export interface CompanyDocIn { id: string; email: string; company?: string; title: string; status: string; date: string; value?: number; currency?: string }
export interface CompanyProspectIn {
  key: string; company: string; website: string; email: string; island: string; industry: string; status: string
  rank?: number | null; score?: number | null; contactName?: string; role?: string; phone?: string; linkedin?: string
  size?: string; revenue?: string; touchesDone?: number; responses?: number
}

export interface Company {
  key: string
  tokens: string[]
  name: string
  website: string
  domain: string
  island: string
  industry: string
  stage: CompanyStage
  people: (CompanyPersonIn & { role: string; assigned: boolean })[]
  invoices: CompanyInvoiceIn[]
  proposals: CompanyDocIn[]
  deals: CompanyDocIn[]
  prospect: CompanyProspectIn | null
  profile: CompanyProfile
  lastSeen: string
}

class UF {
  p = new Map<string, string>()
  find(x: string): string { if (!this.p.has(x)) this.p.set(x, x); const r = this.p.get(x)!; if (r === x) return x; const f = this.find(r); this.p.set(x, f); return f }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(rb, ra) }
}

const OPEN = ['lead', 'discovery', 'proposal_sent', 'negotiation']
const OUT_RUNNING = ['active', 'replied', 'meeting']

export function buildCompanies(src: {
  people: CompanyPersonIn[]
  invoices: CompanyInvoiceIn[]
  proposals: CompanyDocIn[]
  deals: CompanyDocIn[]
  prospects: CompanyProspectIn[]
  store: ProfileStore
}): Company[] {
  const uf = new UF()
  const join = (tokens: string[]) => { for (let i = 1; i < tokens.length; i++) uf.union(tokens[0], tokens[i]); if (tokens[0]) uf.find(tokens[0]) }

  const personTok = new Map<string, string[]>()
  for (const p of src.people) {

    const t = p.key in src.store.assign ? (src.store.assign[p.key] ? [src.store.assign[p.key]] : []) : tokensFor(p)
    personTok.set(p.key, t)
    if (t.length) join(t)
  }

  const docTok = (d: { company?: string; email: string }) => tokensFor({ company: d.company, email: d.email })
  for (const d of [...src.invoices, ...src.proposals, ...src.deals]) { const t = docTok(d); if (t.length) join(t) }
  for (const pr of src.prospects) { const t = tokensFor(pr); if (t.length) join(t) }
  for (const [k, prof] of Object.entries(src.store.companies)) {
    const t = [k, ...tokensFor({ company: prof.name, website: prof.website })]
    join(t)
  }

  const groups = new Map<string, Company>()
  const group = (token: string): Company => {
    const root = uf.find(token)
    let c = groups.get(root)
    if (!c) {
      c = { key: '', tokens: [], name: '', website: '', domain: '', island: '', industry: '', stage: 'contact', people: [], invoices: [], proposals: [], deals: [], prospect: null, profile: {}, lastSeen: '' }
      groups.set(root, c)
    }
    if (!c.tokens.includes(token)) c.tokens.push(token)
    return c
  }
  const seen = (c: Company, at?: string) => { if (at && at > c.lastSeen) c.lastSeen = at }

  for (const p of src.people) {
    const t = personTok.get(p.key) ?? []
    if (!t.length) continue
    const c = group(t[0]); for (const x of t.slice(1)) group(x)
    c.name ||= p.company
    if (!c.people.some(x => x.key === p.key)) c.people.push({ ...p, role: '', assigned: !!src.store.assign[p.key] })
    seen(c, p.lastSeen)
  }

  const personCo = new Map<string, string>()
  for (const [k, t] of personTok) if (t.length) personCo.set(k, t[0])
  const place = (d: { email: string; company?: string }): Company | null => {
    const pk = personCo.get(d.email.trim().toLowerCase())
    if (pk) return group(pk)
    const t = docTok(d); if (!t.length) return null
    const c = group(t[0]); for (const x of t.slice(1)) group(x); return c
  }
  for (const i of src.invoices) { const c = place(i); if (c) { c.invoices.push(i); c.name ||= i.company ?? ''; seen(c, i.date) } }
  for (const d of src.proposals) { const c = place(d); if (c) { c.proposals.push(d); c.name ||= d.company ?? ''; seen(c, d.date) } }
  for (const d of src.deals) { const c = place(d); if (c) { c.deals.push(d); c.name ||= d.company ?? ''; seen(c, d.date) } }
  for (const pr of src.prospects) {
    const t = tokensFor(pr); if (!t.length) continue
    const c = group(t[0]); for (const x of t.slice(1)) group(x)
    c.prospect = pr
    c.name = c.name || pr.company
    c.island ||= pr.island; c.industry ||= pr.industry; c.website ||= pr.website
  }
  for (const [k, prof] of Object.entries(src.store.companies)) {
    const c = group(k)
    if (prof.manual) c.name = prof.name || c.name
  }

  const out: Company[] = []
  for (const c of groups.values()) {
    c.domain = c.tokens.find(t => !t.startsWith('n:')) ?? ''
    c.key = c.domain || c.tokens.find(t => t.startsWith('n:')) || c.tokens[0]

    const profs = c.tokens.map(t => src.store.companies[t]).filter(Boolean) as CompanyProfile[]
    profs.sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''))
    const merged: CompanyProfile = {}
    for (const p of profs) Object.assign(merged, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '')), { roles: { ...(merged.roles ?? {}), ...(p.roles ?? {}) } })
    c.profile = merged
    if (merged.manual || (merged.name && !c.name)) c.name = merged.name || c.name
    c.website ||= merged.website || (c.domain ? `https://${c.domain}` : '')
    c.industry = merged.industry || c.industry
    if (!c.name) c.name = c.domain || c.key.replace(/^n:/, '').replace(/-/g, ' ')
    for (const p of c.people) p.role = merged.roles?.[p.key] ?? ''
    const realInvoice = c.invoices.some(i => i.status !== 'draft' && i.status !== 'void')
    c.stage = c.people.some(p => p.stage === 'client') || realInvoice || c.deals.some(d => ['signed', 'active', 'completed'].includes(d.status)) ? 'client'
      : c.deals.some(d => OPEN.includes(d.status)) || c.people.some(p => p.stage === 'lead') ? 'pipeline'
      : c.prospect && OUT_RUNNING.includes(c.prospect.status) ? 'outbound'
      : c.prospect && c.prospect.status === 'new' ? 'prospect'
      : 'contact'

    if (c.people.length || c.invoices.length || c.deals.length || c.proposals.length || c.prospect || merged.manual) out.push(c)
  }
  return out.sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || (b.lastSeen > a.lastSeen ? 1 : b.lastSeen < a.lastSeen ? -1 : (a.prospect?.rank ?? 9999) - (b.prospect?.rank ?? 9999) || a.name.localeCompare(b.name)))
}
const STAGE_ORDER: Record<CompanyStage, number> = { client: 0, pipeline: 1, outbound: 2, prospect: 3, contact: 4 }

export function moneyOf(c: Company): { currency: string; paid: number; owed: number }[] {
  const m = new Map<string, { paid: number; owed: number }>()
  for (const i of c.invoices) {
    if (i.status === 'draft' || i.status === 'void') continue
    const cur = m.get(i.currency) ?? { paid: 0, owed: 0 }
    cur.paid += i.paid
    cur.owed += Math.max(0, i.total - i.paid)
    m.set(i.currency, cur)
  }
  return [...m.entries()].map(([currency, v]) => ({ currency, ...v }))
}

export const companyHref = (key: string) => `/os/companies/${encodeURIComponent(key)}`
