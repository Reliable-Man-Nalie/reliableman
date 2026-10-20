'use client'

import { useRef, useState } from 'react'
import { saveExpense, updateExpense } from '@/lib/crm-store'
import type { BusinessExpense, Currency } from '@/lib/crm-types'

const PLATFORMS = ['Meta', 'Google', 'TikTok', 'LinkedIn', 'Other']
const CURS: Currency[] = ['USD', 'EUR', 'AWG']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const t = text.replace(/^﻿/, '')
  const sep = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : (t.split('\n')[0].includes('\t') ? '\t' : ',')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim()))
}

function monthOf(v: string): string | null {
  const s = v.trim()
  const iso = s.match(/^(\d{4})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}`
  const d = new Date(s)
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return null
}

function money(v: string): number | null {
  let s = v.replace(/[^\d.,-]/g, '')
  if (!s) return null

  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export function readAdExport(text: string): { ok: true; byMonth: Record<string, number>; currency: Currency | null; rows: number } | { ok: false; error: string } {
  const rows = parseCsv(text)

  const h = rows.findIndex(r => r.some(c => /amount spent|^cost$|^spend$|^cost \(|^spend \(/i.test(c.trim())))
  if (h < 0) return { ok: false, error: 'No spend column found. Export with an "Amount spent" or "Cost" column.' }
  const head = rows[h].map(c => c.trim())
  const amt = head.findIndex(c => /amount spent|^cost$|^spend$|^cost \(|^spend \(/i.test(c))
  const date = ['day', 'date', 'month', 'reporting starts', 'week', 'reporting ends']
    .map(n => head.findIndex(c => c.toLowerCase() === n || c.toLowerCase().startsWith(n)))
    .find(i => i >= 0) ?? -1
  if (date < 0) return { ok: false, error: 'No date column found. Break the export down by Day or Month (or keep "Reporting starts").' }
  const curCol = head.findIndex(c => /currency/i.test(c))
  const fromHead = head[amt].match(/\(([A-Z]{3})\)/)?.[1]
  const byMonth: Record<string, number> = {}
  let currency: string | null = fromHead ?? null
  let n = 0
  for (const r of rows.slice(h + 1)) {
    const m = monthOf(r[date] ?? '')
    const v = money(r[amt] ?? '')
    if (!m || v == null) continue // totals rows have no date
    byMonth[m] = Math.round(((byMonth[m] ?? 0) + v) * 100) / 100
    if (!currency && curCol >= 0 && r[curCol]) currency = r[curCol].trim().toUpperCase()
    n++
  }
  if (!n) return { ok: false, error: 'No dated spend rows in this file.' }
  return { ok: true, byMonth, currency: (CURS as string[]).includes(currency ?? '') ? currency as Currency : null, rows: n }
}

function label(month: string) {
  const [y, m] = month.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

export default function AdSpendImport({ expenses, onSaved }: { expenses: BusinessExpense[]; onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState('')
  const [byMonth, setByMonth] = useState<Record<string, number> | null>(null)
  const [platform, setPlatform] = useState('Meta')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [note, setNote] = useState('')

  async function handle(f: File) {
    setFile(f.name); setByMonth(null); setNote('')
    if (/\.xlsx?$/i.test(f.name)) { setNote('Export as CSV (in Ads Manager: Export, then CSV), then drop that file.'); return }
    const r = readAdExport(await f.text())
    if (!r.ok) { setNote(r.error); return }
    setByMonth(r.byMonth)
    if (r.currency) setCurrency(r.currency)
    if (/google/i.test(f.name)) setPlatform('Google')
    else if (/tiktok/i.test(f.name)) setPlatform('TikTok')
    setNote(`${r.rows} rows read. Check the months, then import.`)
  }

  const months = byMonth ? Object.keys(byMonth).sort() : []
  const nameFor = (m: string) => `${platform} ads, ${label(m)}`

  function importAll() {
    if (!byMonth) return
    let added = 0, updated = 0
    for (const m of months) {
      const name = nameFor(m)
      const amount = byMonth[m]
      const same = expenses.find(e => e.name.toLowerCase() === name.toLowerCase())
      if (same) { updateExpense(same.id, { amount, currency }); updated++ }
      else { saveExpense({ name, category: 'marketing', amount, frequency: 'one-time', currency, date: `${m}-01`, notes: `Imported from ${file}` }); added++ }
    }
    setByMonth(null)
    setNote(`Imported: ${added} new month${added === 1 ? '' : 's'}${updated ? `, ${updated} updated` : ''}.`)
    onSaved()
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handle(f) }}
        style={{ border: '1.5px dashed var(--os-line-strong)', borderRadius: 12, padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}
      >
        <div style={{ fontSize: 14, color: 'var(--os-text-muted)' }}>
          <strong style={{ color: 'var(--os-text)' }}>Import ad spend</strong> from a Meta Ads Manager or Google Ads export (CSV, broken down by day or month). Each month becomes one marketing cost; importing again updates it.
        </div>
        <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => input.current?.click()}>Choose export</button>
        <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = '' }} />
      </div>
      {note && <div style={{ fontSize: 12, color: 'var(--os-text-faint)', marginTop: 8 }}>{file ? `${file} · ` : ''}{note}</div>}
      {byMonth && (
        <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--os-line)', borderRadius: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <select className="os-select" value={platform} onChange={e => setPlatform(e.target.value)} aria-label="Platform">
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
            <select className="os-select" value={currency} onChange={e => setCurrency(e.target.value as Currency)} aria-label="Currency">
              {CURS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {months.map(m => {
            const exists = expenses.some(e => e.name.toLowerCase() === nameFor(m).toLowerCase())
            return (
              <div key={m} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, padding: '4px 0', borderBottom: '1px solid var(--os-line)' }}>
                <span>{nameFor(m)}{exists && <span style={{ color: 'var(--os-text-faint)', fontSize: 12 }}> · already there, will update</span>}</span>
                <strong>{byMonth[m].toFixed(2)} {currency}</strong>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className="os-btn os-btn-primary os-btn-sm" onClick={importAll}>Import {months.length} month{months.length === 1 ? '' : 's'}</button>
            <button className="os-btn os-btn-ghost os-btn-sm" onClick={() => { setByMonth(null); setNote('') }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
