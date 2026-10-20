'use client'

import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react'
import { getLeads, getDeals, saveLead, updateLead, deleteLead, deleteDeal, hydrateFromSupabase } from '@/lib/crm-store'
import { getAttendees, updateAttendee, removeAttendee } from '@/lib/event-store'
import type { Lead, Deal, LeadStatus } from '@/lib/crm-types'
import type { EventAttendee } from '@/lib/event-types'
import { CONTACT_STATUSES } from '@/lib/crm-types'
import { PRESET_TAGS } from '../deals/crm-shared'
import { guessCountry } from '@/lib/country-codes'
import ContactCard, { type ContactCardContact } from '@/components/ContactCard'
import { confirmAction } from '@/app/os/ConfirmHost'
import { isLikelySpam } from '@/lib/apply-guard'
import { getPeople, PERSON_STATES, stateMeta, type Person, type PersonState } from '@/lib/people'
import { GripVertical } from 'lucide-react'
import { EmailText } from '@/components/os/CopyEmail'
import { StateChips, useIsNarrow, initialsOf, avatarBgOf } from '@/components/os/PersonBits'

interface Contact {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  website?: string
  source: string
  status: string
  notes?: string
  createdAt: string
  tags?: string[]
  _type: 'lead' | 'deal' | 'attendee'
  _deal?: Deal
  _attendeeId?: string

  _country?: string
  _companyType?: string
  _lastContacted: string
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function avatar(name: string) {
  const colors = ['var(--os-accent)', 'var(--os-good)', 'var(--os-warn)', 'var(--os-bad)', 'var(--os-accent)', '#db2777']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

function statusMeta(v: string) {
  return CONTACT_STATUSES.find(s => s.value === v)
    ?? { value: v, label: v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') : '—', color: 'var(--os-text-faint)', bg: 'var(--os-line)' }
}

function companyTypeOf(tags?: string[]): string | undefined {
  return tags?.find(t => (PRESET_TAGS as readonly string[]).includes(t))
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  return lines.slice(1).map(line => {
    const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) ?? line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim()
    })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

function mapCSVRow(row: Record<string, string>) {
  const get = (...keys: string[]) => keys.map(k => row[k]).find(v => v) ?? ''
  return {
    name: get('name', 'full name', 'fullname', 'first name', 'firstname', 'naam', 'nombre', 'client full name', 'organization', 'business name'),
    email: get('email', 'e-mail', 'emailaddress', 'email address', 'email (pattern/known)'),
    phone: get('phone', 'tel', 'telephone', 'whatsapp', 'mobile', 'mobile number', 'cel', 'telefoon'),
    company: get('company', 'company name', 'business', 'business name', 'organization', 'organisation', 'bedrijf', 'empresa'),
    website: get('website', 'website url', 'company website', 'url', 'site'),
    role: get('role', 'job title', 'title', 'position', 'key contact (role)'),
    status: get('status', 'lifecycle', 'stage'),
    location: get('location', 'island', 'country', 'city', 'region'),
    value: get('value', 'amount', 'monthly retainer', 'lifetime', 'retainer'),
    tags: get('tags', 'tag', 'segment', 'sector'),
    source: get('source', 'origin'),
    notes: get('notes', 'note', 'message', 'comments', 'remarks', 'company insight for outreach', 'ai opportunity'),
  }
}

function CSVImportModal({ onClose, onImported }: { onClose: () => void; onImported: (n: number) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ReturnType<typeof mapCSVRow>[]>([])
  const [tag, setTag] = useState('')
  const [source, setSource] = useState('Workshop')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(0)
  const [error, setError] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)

  function handleFile(f: File) {
    setFile(f)
    const reader = new FileReader()
    reader.onload = e => {
      const parsed = parseCSV(e.target?.result as string)
      setRows(parsed.map(mapCSVRow).filter(r => r.name || r.email))
    }
    reader.readAsText(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) handleFile(f)
  }

  async function doImport() {
    if (!rows.length) return
    setImporting(true)
    setError('')
    const batchTags = [source, tag].filter(Boolean)

    const STATUS_MAP: Record<string, string> = { prospect: 'opportunity', lead: 'new', customer: 'client', won: 'client', active: 'client' }

    const contacts = rows.map(r => {
      const extra = [
        r.website ? `Website: ${r.website}` : '',
        r.role ? `Role: ${r.role}` : '',
        r.location ? `Location: ${r.location}` : '',
        r.value ? `Value: ${r.value}` : '',
      ].filter(Boolean).join(' | ')
      const notes = [extra, r.notes].filter(Boolean).join('\n')
      const rowTags = r.tags ? r.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : []
      const st = (r.status || '').trim().toLowerCase()
      return {
        name: r.name, email: r.email, phone: r.phone, company: r.company, notes,
        status: STATUS_MAP[st] || st || undefined,
        tags: rowTags,
        source: r.source ? r.source.toLowerCase().replace(/\s+/g, '-') : undefined,
      }
    })
    try {
      const res = await fetch('/api/import-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts, tags: batchTags, source: source.toLowerCase().replace(/\s+/g, '-') }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Import failed'); setImporting(false); return }
      setDone(data.imported)
      onImported(data.imported)
    } catch {
      setError('Network error, try again')
    }
    setImporting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 560, boxShadow: '0 24px 80px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--os-text)' }}>Import Contacts</div>
            <div style={{ fontSize: 13, color: 'var(--os-text-faint)', marginTop: 2 }}>CSV with name, email, phone, company columns</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: 'var(--os-line)', borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--os-text-faint)' }}>✕</button>
        </div>

        {done > 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--os-good)', marginBottom: 8 }}>{done} contacts imported</div>
            <div style={{ fontSize: 14, color: 'var(--os-text-faint)', marginBottom: 24 }}>They are now in your Contacts list</div>
            <button onClick={onClose} className="os-btn os-btn-primary">Done</button>
          </div>
        ) : (
          <>
            <div
              ref={dropRef}
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => document.getElementById('csv-file-input')?.click()}
              style={{ border: '2px dashed #c4b5fd', borderRadius: 14, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--os-line)', marginBottom: 20, transition: 'border-color .15s' }}
            >
              <i className="ti ti-upload" style={{ fontSize: 28, color: 'var(--os-accent)', display: 'block', marginBottom: 10 }} />
              {file ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--os-text)' }}>{file.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--os-accent)', marginTop: 4 }}>{rows.length} contacts detected</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--os-accent)' }}>Drop CSV here or click to browse</div>
                  <div style={{ fontSize: 12, color: 'var(--os-text-faint)', marginTop: 4 }}>Accepts: name, email, phone, company, notes</div>
                </div>
              )}
              <input id="csv-file-input" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label className="os-label">Source / Event</label>
                <input className="os-input" value={source} onChange={e => setSource(e.target.value)} placeholder="Workshop, Event name..." />
              </div>
              <div>
                <label className="os-label">Tag (optional)</label>
                <input className="os-input" value={tag} onChange={e => setTag(e.target.value)} placeholder="VIP, Workshop 2026..." />
              </div>
            </div>

            {rows.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-text-faint)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Preview, first 3 rows</div>
                <div style={{ border: '1px solid var(--os-line)', borderRadius: 10, overflow: 'hidden' }}>
                  {rows.slice(0, 3).map((r, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderBottom: i < 2 ? '1px solid var(--os-line)' : 'none', display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatar(r.name || r.email), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {initials(r.name || r.email)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--os-text)' }}>{r.name || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}><EmailText email={r.email} />{r.phone ? ` · ${r.phone}` : ''}</div>
                      </div>
                    </div>
                  ))}
                  {rows.length > 3 && (
                    <div style={{ padding: '8px 14px', background: 'var(--os-line)', fontSize: 12, color: 'var(--os-accent)', fontWeight: 600 }}>
                      + {rows.length - 3} more contacts
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && <div style={{ background: 'var(--os-bad-soft)', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--os-bad)', marginBottom: 16 }}>{error}</div>}

            <button
              onClick={doImport}
              disabled={!rows.length || importing}
              className="os-btn os-btn-primary"
              style={{ width: '100%', justifyContent: 'center', opacity: (!rows.length || importing) ? 0.5 : 1 }}
            >
              {importing ? 'Importing...' : `Import ${rows.length} contacts`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const EMPTY = { name: '', email: '', phone: '', company: '', source: 'manual', status: 'new', notes: '', tags: '' }

function ContactModal({ contact, onClose, onSaved }: { contact?: Lead; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(contact
    ? { name: contact.name, email: contact.email, phone: contact.phone ?? '', company: contact.company ?? '', source: contact.source, status: contact.status, notes: contact.notes ?? '', tags: (contact as Lead & { tags?: string[] }).tags?.join(', ') ?? '' }
    : EMPTY
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    if (contact) {
      updateLead(contact.id, { ...form, tags } as Partial<Lead>)
    } else {
      saveLead({ ...form, tags } as Parameters<typeof saveLead>[0])
    }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 24px 80px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--os-text)' }}>{contact ? 'Edit Contact' : 'New Contact'}</div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: 'var(--os-line)', borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--os-text-faint)' }}>✕</button>
        </div>
        <form className="os-form" onSubmit={submit}>
          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">Full Name *</label>
              <input className="os-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
            </div>
            <div className="os-form-group">
              <label className="os-label">Email</label>
              <input className="os-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@email.com" />
            </div>
          </div>
          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">WhatsApp / Phone</label>
              <input className="os-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+297 xxx xxxx" />
            </div>
            <div className="os-form-group">
              <label className="os-label">Company</label>
              <input className="os-input" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
          </div>
          <div className="os-form-group">
            <label className="os-label">Status</label>
            <select className="os-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {CONTACT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="os-form-row">
            <div className="os-form-group">
              <label className="os-label">Source</label>
              <select className="os-select" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                <option value="manual">Manual</option>
                <option value="workshop">Workshop</option>
                <option value="referral">Referral</option>
                <option value="website">Website form</option>
                <option value="social">Social Media</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="csv-import">CSV Import</option>
              </select>
            </div>
            <div className="os-form-group">
              <label className="os-label">Tags (comma-separated)</label>
              <input className="os-input" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Workshop, Coaching, VIP..." />
            </div>
          </div>
          <div className="os-form-group">
            <label className="os-label">Notes</label>
            <textarea className="os-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="What do they need? Where are they in their journey?" />
          </div>
          <button type="submit" className="os-btn os-btn-primary">{contact ? 'Save Changes' : 'Add Contact'}</button>
        </form>
      </div>
    </div>
  )
}

type ColId = 'contact' | 'states' | 'company' | 'phone' | 'tags' | 'lastSeen'
const COLS: { id: ColId; label: string; width: number }[] = [
  { id: 'contact',  label: 'Contact',   width: 260 },
  { id: 'states',   label: 'States',    width: 240 },
  { id: 'company',  label: 'Company',   width: 170 },
  { id: 'phone',    label: 'Phone',     width: 150 },
  { id: 'tags',     label: 'Tags',      width: 170 },
  { id: 'lastSeen', label: 'Last seen', width: 120 },
]
const MIN_COL = 80
const LAYOUT_KEY = 'bos_contacts_layout'
type Layout = { order?: ColId[]; widths?: Partial<Record<ColId, number>>; rows?: string[] }

const layoutListeners = new Set<() => void>()
let layoutMemo: string | null = null
function layoutRaw(): string {
  try { layoutMemo = window.localStorage.getItem(LAYOUT_KEY) ?? '{}' } catch { layoutMemo = layoutMemo ?? '{}' }
  return layoutMemo
}
function subscribeLayout(cb: () => void) { layoutListeners.add(cb); return () => { layoutListeners.delete(cb) } }
function writeLayout(l: Layout) {
  const raw = JSON.stringify(l)
  try { window.localStorage.setItem(LAYOUT_KEY, raw) } catch { /* private mode: kept for this visit only */ }
  layoutMemo = raw
  layoutListeners.forEach(cb => cb())
}

const LAST_CONTACTED: { value: string; label: string; test: (days: number) => boolean }[] = [
  { value: '7d',    label: 'Active in last 7 days',  test: d => d <= 7 },
  { value: '30d',   label: 'Active in last 30 days', test: d => d <= 30 },
  { value: 'stale', label: 'Nothing in 30+ days',    test: d => d > 30 },
]

export default function ContactsPage() {
  const [people, setPeople] = useState<Person[]>([])
  const [search, setSearch] = useState('')

  const [stateFilter, setStateFilter] = useState<'all' | PersonState>('all')

  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [countryFilter, setCountryFilter] = useState<string>('all')
  const [companyTypeFilter, setCompanyTypeFilter] = useState<string>('all')
  const [lastContactedFilter, setLastContactedFilter] = useState<string>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editContact, setEditContact] = useState<Lead | undefined>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importCount, setImportCount] = useState(0)
  const [cardContact, setCardContact] = useState<ContactCardContact | null>(null)
  const narrow = useIsNarrow()

  const layoutStr = useSyncExternalStore(subscribeLayout, layoutRaw, () => '{}')
  const layout = useMemo<Layout>(() => { try { return JSON.parse(layoutStr) as Layout } catch { return {} } }, [layoutStr])
  const saveLayout = useCallback((patch: (l: Layout) => Layout) => writeLayout(patch(layout)), [layout])
  const colOrder: ColId[] = [
    ...(layout.order ?? []).filter(id => COLS.some(c => c.id === id)),
    ...COLS.map(c => c.id).filter(id => !(layout.order ?? []).includes(id)),
  ]
  const widthOf = (id: ColId) => layout.widths?.[id] ?? COLS.find(c => c.id === id)!.width
  const customised = Boolean(layout.order?.length || Object.keys(layout.widths ?? {}).length || layout.rows?.length)

  const [liveW, setLiveW] = useState<{ id: ColId; w: number } | null>(null)
  function startResize(id: ColId, e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = widthOf(id)
    let w = w0
    const move = (ev: PointerEvent) => { w = Math.max(MIN_COL, Math.round(w0 + ev.clientX - x0)); setLiveW({ id, w }) }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLiveW(null)
      saveLayout(l => ({ ...l, widths: { ...l.widths, [id]: w } }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const w = (id: ColId) => (liveW?.id === id ? liveW.w : widthOf(id))

  const [dragColId, setDragColId] = useState<ColId | null>(null)
  const [colOver, setColOver] = useState<ColId | null>(null)
  function dropCol(target: ColId) {
    const from = dragColId
    setDragColId(null); setColOver(null)
    if (!from || from === target) return
    const cur = [...colOrder]
    cur.splice(cur.indexOf(from), 1)
    cur.splice(cur.indexOf(target), 0, from)
    saveLayout(l => ({ ...l, order: cur }))
  }

  const [dragRowKey, setDragRowKey] = useState<string | null>(null)
  const [rowOver, setRowOver] = useState<{ key: string; after: boolean } | null>(null)

  useEffect(() => {
    if (!filterOpen) return
    const close = (e: MouseEvent) => { if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [filterOpen])

  const readLocal = useCallback(() => setPeople(getPeople({ includeSpam: true })), [])
  const reload = useCallback(async () => {
    readLocal()
    await hydrateFromSupabase()
    readLocal()
  }, [readLocal])

  useEffect(() => {
    reload()
    window.addEventListener('bos:hydrated', readLocal)
    return () => window.removeEventListener('bos:hydrated', readLocal)
  }, [reload, readLocal])

  const rows = useMemo(() => {
    const base = people.map(p => ({
      ...p,
      _country: guessCountry(p.phone)?.name,
      _companyType: companyTypeOf(p.tags),
    }))
    const placed = new Map((layout.rows ?? []).map((k, i) => [k, i]))
    if (!placed.size) return base
    const fresh = base.filter(r => !placed.has(r.key))
    const known = base.filter(r => placed.has(r.key)).sort((a, b) => placed.get(a.key)! - placed.get(b.key)!)
    return [...fresh, ...known]
  }, [people, layout.rows])
  type Row = typeof rows[number]

  function dropRow(target: string, after: boolean) {
    const from = dragRowKey
    setDragRowKey(null); setRowOver(null)
    if (!from || from === target) return
    const keys = rows.map(r => r.key).filter(k => k !== from)
    const at = keys.indexOf(target)
    if (at < 0) return
    keys.splice(after ? at + 1 : at, 0, from)
    saveLayout(l => ({ ...l, rows: keys }))
  }

  const visible = rows.filter(r => !r.spam)
  const spamCount = rows.length - visible.length

  const allTags = Array.from(new Set(rows.flatMap(r => r.tags))).sort()

  const allCountries = Array.from(new Set(rows.map(r => r._country).filter((v): v is string => Boolean(v)))).sort()
  const allCompanyTypes = Array.from(new Set(rows.map(r => r._companyType).filter((v): v is string => Boolean(v)))).sort()

  const filtered = rows.filter(r => {

    if (stateFilter === 'spam') { if (!r.spam) return false }
    else if (r.spam) return false
    else if (stateFilter !== 'all' && !r.states.includes(stateFilter)) return false
    if (tagFilter.length && !tagFilter.some(t => r.tags.includes(t))) return false
    if (countryFilter !== 'all' && r._country !== countryFilter) return false
    if (companyTypeFilter !== 'all' && r._companyType !== companyTypeFilter) return false
    if (lastContactedFilter !== 'all') {
      const days = Math.floor((Date.now() - new Date(r.lastSeen).getTime()) / 86400000)
      if (!LAST_CONTACTED.find(b => b.value === lastContactedFilter)?.test(days)) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return [r.name, r.email, r.company, r.website, r.phone, ...r.tags, ...r.events]
      .filter(Boolean).some(v => v.toLowerCase().includes(q))
  })

  function toggleSelect(key: string) {
    setSelected(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  function selectAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(r => r.key)))
  }

  function openRow(r: Row) {

    setCardContact({
      id: r.dealId ?? r.leadId ?? r.attendeeId ?? r.key,
      name: r.name, email: r.email, phone: r.phone, company: r.company,
      tags: r.tags, createdAt: r.firstSeen,
    })
  }

  function exportCSV(onlySelected = false) {
    const source = onlySelected ? filtered.filter(r => selected.has(r.key)) : filtered
    const rowsOut = [
      ['Name', 'Email', 'Phone', 'Company', 'Website', 'States', 'Tags', 'Events', 'First seen', 'Last seen'],
      ...source.map(r => [
        r.name, r.email, r.phone, r.company, r.website,
        r.states.map(st => stateMeta(st).label).join('; '),
        r.tags.join('; '), r.events.join('; '),
        r.firstSeen.slice(0, 10), r.lastSeen.slice(0, 10),
      ]),
    ]
    const csv = rowsOut.map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'bos-contacts.csv'
    a.click()
  }

  async function sendBulkWhatsApp() {
    const targets = filtered.filter(r => selected.has(r.key) && r.phone)
    if (!targets.length) { await confirmAction({ message: 'No phone numbers selected.', detail: 'Select at least one contact that has a phone number.', confirmLabel: 'OK', cancelLabel: 'Close', destructive: false }); return }

    window.open(`https://wa.me/${targets[0].phone.replace(/[^0-9]/g, '')}`, '_blank')
  }

  function deletePeople(keys: string[]) {
    const byKey = new Map(rows.map(r => [r.key, r]))
    const emails = new Set<string>()
    for (const k of keys) {
      const r = byKey.get(k)
      if (!r) continue
      if (r.email) emails.add(r.email.trim().toLowerCase())
      if (r.attendeeId) removeAttendee(r.attendeeId)
      if (r.dealId) deleteDeal(r.dealId)
      if (r.leadId) deleteLead(r.leadId)
    }
    if (emails.size) {
      getDeals().filter(d => emails.has((d.clientEmail ?? '').trim().toLowerCase())).forEach(d => deleteDeal(d.id))
      getLeads().filter(l => emails.has((l.email ?? '').trim().toLowerCase())).forEach(l => deleteLead(l.id))
      getAttendees().filter(a => emails.has((a.email ?? '').trim().toLowerCase())).forEach(a => removeAttendee(a.id))
    }
    setSelected(new Set())
    reload()
  }

  async function deleteAllSpam() {
    const keys = rows.filter(r => r.spam).map(r => r.key)
    if (!keys.length) return
    const names = rows.filter(r => r.spam).slice(0, 6).map(r => r.name || r.email).join(', ')
    if (!(await confirmAction({
      message: `Delete ${keys.length} likely-spam contact${keys.length > 1 ? 's' : ''}?`,
      detail: `${names}${keys.length > 6 ? `, and ${keys.length - 6} more` : ''}. Their pipeline cards and event registrations go too. This cannot be undone.`,
      confirmLabel: `Delete ${keys.length}`,
    }))) return
    deletePeople(keys)
    setStateFilter('all')
  }

  async function bulkDelete() {
    const keys = filtered.filter(r => selected.has(r.key)).map(r => r.key)
    if (!keys.length) return
    if (!(await confirmAction({ message: `Delete ${keys.length} contact${keys.length > 1 ? 's' : ''}?`, detail: 'Every record they appear in goes with them. This cannot be undone.' }))) return
    deletePeople(keys)
  }

  const hasSelection = selected.size > 0
  const showOptions: { key: 'all' | PersonState; label: string; n: number }[] = [
    { key: 'all', label: 'Everyone', n: visible.length },
    ...PERSON_STATES.filter(st => st.value !== 'spam').map(st => ({
      key: st.value, label: st.label, n: visible.filter(r => r.states.includes(st.value)).length,
    })).filter(o => o.n > 0),
    ...(spamCount > 0 ? [{ key: 'spam' as const, label: 'Likely spam', n: spamCount }] : []),
  ]

  const active: { id: string; label: string; clear: () => void }[] = [
    ...(stateFilter !== 'all' ? [{ id: 'state', label: showOptions.find(o => o.key === stateFilter)?.label ?? stateMeta(stateFilter as PersonState).label, clear: () => setStateFilter('all') }] : []),
    ...tagFilter.map(t => ({ id: `tag:${t}`, label: t, clear: () => setTagFilter(f => f.filter(x => x !== t)) })),
    ...(countryFilter !== 'all' ? [{ id: 'country', label: countryFilter, clear: () => setCountryFilter('all') }] : []),
    ...(companyTypeFilter !== 'all' ? [{ id: 'type', label: companyTypeFilter, clear: () => setCompanyTypeFilter('all') }] : []),
    ...(lastContactedFilter !== 'all' ? [{ id: 'last', label: LAST_CONTACTED.find(b => b.value === lastContactedFilter)?.label ?? '', clear: () => setLastContactedFilter('all') }] : []),
  ]
  function clearAll() {
    setStateFilter('all'); setTagFilter([]); setCountryFilter('all'); setCompanyTypeFilter('all'); setLastContactedFilter('all')
  }

  const fieldStyle: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1.5px solid var(--os-line)', borderRadius: 10, fontSize: 16, color: 'var(--os-text)', background: 'var(--os-card)', fontFamily: 'inherit' }
  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--os-text-faint)', margin: '14px 0 6px' }
  const optRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: 'var(--os-text)' }

  function cell(id: ColId, r: Row) {
    switch (id) {
      case 'contact': return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatar(r.name || r.email), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {initials(r.name || r.email)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--os-text)', fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--os-text-faint)', overflow: 'hidden' }}>
              {r.email ? <EmailText email={r.email} style={{ maxWidth: '100%' }} /> : <span>No e-mail</span>}
            </div>
          </div>
        </div>
      )

      case 'states': return (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {r.states.length ? <StateChips states={r.states} max={4} /> : <span style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>—</span>}
        </div>
      )
      case 'company': return (
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--os-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.company}>{r.company || '—'}</span>
      )
      case 'phone': return (
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--os-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={e => e.stopPropagation()}>
          {r.phone ? <a href={`tel:${r.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.phone}</a> : '—'}
        </span>
      )
      case 'tags': return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {r.tags.slice(0, 2).map(t => (
            <span key={t} title={t} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: 'var(--os-chip)', color: 'var(--os-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{t}</span>
          ))}
          {r.tags.length > 2 && <span style={{ fontSize: 10.5, color: 'var(--os-text-faint)', fontWeight: 700 }}>+{r.tags.length - 2}</span>}
        </div>
      )
      case 'lastSeen': return (
        <span style={{ fontSize: 12, color: 'var(--os-text-faint)', whiteSpace: 'nowrap' }}>{r.lastSeen ? timeAgo(r.lastSeen) : '—'}</span>
      )
    }
  }

  const FIRST_W = 66, LAST_W = 92
  const tableWidth = FIRST_W + LAST_W + colOrder.reduce((s, id) => s + w(id), 0)

  return (
    <>
      <div className="os-page-header">
        <div>
          <div className="os-page-title">Contacts</div>
          <div className="os-page-sub">
            {visible.length} {visible.length === 1 ? 'person' : 'people'}
            {spamCount > 0 && ` · ${spamCount} filtered as spam`}
            {importCount > 0 && ` · ${importCount} imported`}
          </div>
        </div>
        <div className="os-page-actions" style={{ display: 'flex', gap: 10 }}>
          <button className="os-btn os-btn-ghost" onClick={() => setShowImport(true)}>
            <i className="ti ti-upload" /> Import CSV
          </button>
          <button className="os-btn os-btn-primary" onClick={() => { setEditContact(undefined); setShowAdd(true) }}>
            <i className="ti ti-plus" /> Add Contact
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--os-text-faint)', fontSize: 15 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, company, event..."
            style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1.5px solid var(--os-line)', borderRadius: 10, fontSize: 16, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--os-text)', background: 'var(--os-card)' }}
          />
        </div>

        <div ref={filterRef} style={{ position: 'relative' }}>
          <button type="button" className="os-btn os-btn-ghost" onClick={() => setFilterOpen(o => !o)} aria-expanded={filterOpen}
            style={active.length ? { borderColor: 'var(--os-accent)', color: 'var(--os-accent)' } : undefined}>
            <i className="ti ti-filter" /> Filter{active.length ? ` (${active.length})` : ''} <i className="ti ti-chevron-down" style={{ fontSize: 13 }} />
          </button>
          {filterOpen && (
            <div role="dialog" aria-label="Filter contacts"
              style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, width: 'min(340px, calc(100vw - 32px))', maxHeight: 'min(70vh, calc(100dvh - 300px))', overflowY: 'auto', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', border: '1px solid var(--os-line)', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.25)', padding: '6px 14px 14px' }}>
              <div style={sectionLabel}>Show</div>
              {showOptions.map(o => (
                <label key={o.key} style={{ ...optRow, background: stateFilter === o.key ? 'var(--os-chip)' : undefined }}>
                  <input type="radio" name="contacts-show" checked={stateFilter === o.key} onChange={() => setStateFilter(o.key)} style={{ accentColor: o.key === 'spam' ? 'var(--os-bad)' : 'var(--os-accent)', width: 16, height: 16 }} />
                  <span style={{ flex: 1, color: o.key === 'spam' ? 'var(--os-bad)' : undefined }}>{o.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-text-faint)' }}>{o.n}</span>
                </label>
              ))}

              {allTags.length > 0 && (
                <>
                  <div style={sectionLabel}>Tags</div>
                  {allTags.map(t => (
                    <label key={t} style={optRow}>
                      <input type="checkbox" checked={tagFilter.includes(t)} style={{ accentColor: 'var(--os-accent)', width: 16, height: 16 }}
                        onChange={() => setTagFilter(f => f.includes(t) ? f.filter(x => x !== t) : [...f, t])} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t}>{t}</span>
                    </label>
                  ))}
                </>
              )}

              {allCountries.length > 0 && (
                <>
                  <div style={sectionLabel}>Country</div>
                  <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={fieldStyle}>
                    <option value="all">All countries</option>
                    {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </>
              )}

              {allCompanyTypes.length > 0 && (
                <>
                  <div style={sectionLabel}>Company type</div>
                  <select value={companyTypeFilter} onChange={e => setCompanyTypeFilter(e.target.value)} style={fieldStyle}>
                    <option value="all">All company types</option>
                    {allCompanyTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              )}

              <div style={sectionLabel}>Last contacted</div>
              <select value={lastContactedFilter} onChange={e => setLastContactedFilter(e.target.value)} style={fieldStyle}>
                <option value="all">Any time</option>
                {LAST_CONTACTED.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="button" className="os-btn os-btn-ghost os-btn-sm" onClick={clearAll} disabled={!active.length}>Clear all</button>
                <button type="button" className="os-btn os-btn-primary os-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setFilterOpen(false)}>
                  Show {filtered.length}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {(active.length > 0 || (stateFilter === 'spam' && spamCount > 0)) && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {active.map(a => (
            <button key={a.id} type="button" onClick={a.clear} title="Remove this filter"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--os-accent)', background: 'transparent', color: 'var(--os-accent)', maxWidth: 220 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span> <span aria-hidden>×</span>
            </button>
          ))}
          {active.length > 1 && (
            <button type="button" onClick={clearAll} style={{ border: 'none', background: 'none', color: 'var(--os-text-faint)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Clear all</button>
          )}
          {stateFilter === 'spam' && spamCount > 0 && (
            <button type="button" className="os-btn os-btn-sm" onClick={deleteAllSpam}
              style={{ marginLeft: 'auto', background: 'var(--os-bad)', color: '#fff', border: 'none' }}>
              Delete all {spamCount} likely spam
            </button>
          )}
        </div>
      )}

      {hasSelection && (
        <div style={{ background: 'var(--os-line)', border: '1px solid #c4b5fd', borderRadius: 12, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--os-accent)' }}>{selected.size} selected</span>
          <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => exportCSV(true)}><i className="ti ti-download" /> Export selected</button>
          <button className="os-btn os-btn-ghost os-btn-sm" onClick={sendBulkWhatsApp} title="WhatsApp has no true bulk send. This opens a chat with the first selected contact."><i className="ti ti-brand-whatsapp" /> WhatsApp first</button>
          <button className="os-btn os-btn-ghost os-btn-sm" style={{ color: '#e53e3e', borderColor: 'rgba(229,62,62,.35)' }} onClick={bulkDelete}><i className="ti ti-trash" /> Delete {selected.size}</button>
          <button className="os-btn os-btn-ghost os-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="os-card os-people-cards" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="os-empty">
            <i className="ti ti-users" />
            <div className="os-empty-title">{search || active.length ? 'Nobody matches' : 'No contacts yet'}</div>
            <div className="os-empty-sub">{search || active.length ? 'Loosen the search or clear a filter' : 'Import a CSV or add contacts manually to get started'}</div>
          </div>
        ) : narrow ? (

          <div>
            {filtered.map(r => (
              <div key={r.key} role="button" tabIndex={0} className="os-pcard"
                onClick={() => openRow(r)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(r) } }}>
                <div className="os-pcard-top">
                  <div className="os-pcard-av" style={{ background: avatarBgOf(r.name || r.email) }}>{initialsOf(r.name || r.email)}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="os-pcard-name">{r.name || r.email || 'Unnamed'}</div>
                    {r.company && <div className="os-pcard-sub">{r.company}</div>}
                  </div>
                </div>
                {r.states.length > 0 && (
                  <div className="os-pcard-states"><StateChips states={r.states} max={4} /></div>
                )}
                <div className="os-pcard-meta" onClick={e => e.stopPropagation()}>
                  {r.email && <EmailText email={r.email} style={{ maxWidth: '100%' }} />}
                  {r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>}
                  {r.lastSeen && <span style={{ color: 'var(--os-text-faint)' }}>{timeAgo(r.lastSeen)}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="os-client-table-wrap">
            <table className="os-table os-client-table os-contacts-table" style={{ tableLayout: 'fixed', width: tableWidth }}>
              <colgroup>
                <col style={{ width: FIRST_W }} />
                {colOrder.map(id => <col key={id} style={{ width: w(id) }} />)}
                <col style={{ width: LAST_W }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={selectAll} style={{ cursor: 'pointer', marginLeft: 22 }} aria-label="Select all" />
                  </th>
                  {colOrder.map(id => (
                    <th key={id} className="os-ct-th"
                      onDragOver={e => { if (dragColId) { e.preventDefault(); setColOver(id) } }}
                      onDragLeave={() => setColOver(o => (o === id ? null : o))}
                      onDrop={e => { e.preventDefault(); dropCol(id) }}
                      style={colOver === id && dragColId !== id ? { boxShadow: 'inset 2px 0 0 var(--os-accent)' } : undefined}>
                      <span draggable className="os-ct-label" title="Drag to move this column"
                        onDragStart={e => { setDragColId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) }}
                        onDragEnd={() => { setDragColId(null); setColOver(null) }}>
                        <GripVertical size={14} aria-hidden />
                        {COLS.find(c => c.id === id)!.label}
                      </span>
                      <span className="os-ct-resize" role="separator" aria-orientation="vertical" aria-label={`Resize ${COLS.find(c => c.id === id)!.label}`}
                        onPointerDown={e => startResize(id, e)}
                        onDoubleClick={() => saveLayout(l => { const ws = { ...l.widths }; delete ws[id]; return { ...l, widths: ws } })} />
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const over = rowOver?.key === r.key && dragRowKey !== r.key
                  return (
                    <tr key={r.key}
                      onClick={() => openRow(r)}
                      onDragOver={e => {
                        if (!dragRowKey) return
                        e.preventDefault()
                        const box = e.currentTarget.getBoundingClientRect()
                        setRowOver({ key: r.key, after: e.clientY > box.top + box.height / 2 })
                      }}
                      onDrop={e => { e.preventDefault(); dropRow(r.key, rowOver?.after ?? false) }}
                      style={{
                        background: selected.has(r.key) ? 'var(--os-line)' : undefined, cursor: 'pointer',
                        boxShadow: over ? `inset 0 ${rowOver!.after ? '-2px' : '2px'} 0 var(--os-accent)` : undefined,
                      }}>
                      <td onClick={e => e.stopPropagation()}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span draggable className="os-ct-grip" title="Drag to move this row"
                            onDragStart={e => { setDragRowKey(r.key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.key) }}
                            onDragEnd={() => { setDragRowKey(null); setRowOver(null) }}>
                            <GripVertical size={14} aria-hidden />
                          </span>
                          <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggleSelect(r.key)} style={{ cursor: 'pointer' }} aria-label={`Select ${r.name || r.email}`} />
                        </span>
                      </td>
                      {colOrder.map(id => <td key={id} style={{ overflow: 'hidden' }}>{cell(id, r)}</td>)}
                      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.email && (
                          <a className="os-btn os-btn-ghost os-btn-sm" href={`mailto:${r.email}`} title="Email"><i className="ti ti-mail" /></a>
                        )}
                        <button className="os-btn os-btn-ghost os-btn-sm" style={{ color: '#e53e3e' }} title="Delete"
                          onClick={async () => { if (await confirmAction({ message: `Delete ${r.name || r.email}?`, detail: 'Every record they appear in goes with them. This cannot be undone.' })) deletePeople([r.key]) }}>
                          <i className="ti ti-trash" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        {customised && !narrow && (
          <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => saveLayout(() => ({}))} title="Put the columns, their widths and the row order back to the default">
            <i className="ti ti-arrow-back-up" /> Reset layout
          </button>
        )}
        {filtered.length > 0 && (
          <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => exportCSV()}>
            <i className="ti ti-download" /> Export {filtered.length}
          </button>
        )}
      </div>

      {showImport && (
        <CSVImportModal
          onClose={() => setShowImport(false)}
          onImported={n => { setImportCount(c => c + n); reload() }}
        />
      )}

      {showAdd && (
        <ContactModal
          contact={editContact}
          onClose={() => { setShowAdd(false); setEditContact(undefined) }}
          onSaved={reload}
        />
      )}

      <ContactCard contact={cardContact} onClose={() => setCardContact(null)} />
    </>
  )
}
