'use client'
import { BRAND } from '@/lib/brand'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getEvent, updateEvent, deleteEvent,
  getAttendees, addAttendee, updateAttendee, removeAttendee,
  updateAttendeeStatus, markPaid, markCheckedIn, exportAttendeesCSV,
  generateTicketCode, hydrateEventsDetailed,
} from '@/lib/event-store'
import { saveDeal, getDeals, getInvoices } from '@/lib/crm-store'
import { defaultConfirmationBody, defaultReminderBody, defaultFollowUpBody } from '@/lib/event-email-defaults'
import { weekdayDate } from '@/lib/email'
import { isOpenDeal } from '@/lib/client-history'
import { openContactPanel } from '@/lib/contact-panel'
import type { BosEvent, EventAttendee, Speaker, AgendaItem, FaqItem, AttendeeStatus } from '@/lib/event-types'
import { confirmAction } from '@/app/os/ConfirmHost'
import { EmailText } from '@/components/os/CopyEmail'
import { EVENT_IMAGE_LIBRARY, SHARED_DEFAULT_IMAGE, eventImage } from '@/lib/event-images'
import '../events.css'
import EvIcon from '../EvIcon'
import EventOverview from './EventOverview'
import PaymentChip from './PaymentChip'
import EventPromote from './EventPromote'
import AttendeeMail from './AttendeeMail'
import { copyText } from '@/lib/clipboard'

const I: React.CSSProperties = { width: '100%', minHeight: 44, padding: '10px 13px', border: '1px solid var(--os-line-strong, var(--os-line))', borderRadius: 11, fontSize: 14, color: 'var(--os-text)', outline: 'none', background: 'var(--os-base-2, var(--os-card))', fontFamily: 'inherit' }
const L: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--os-text)', marginBottom: 7 }
const Btn = (extra?: React.CSSProperties): React.CSSProperties => ({ background: 'linear-gradient(135deg,var(--os-accent),var(--os-accent))', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', ...extra })
const BtnGhost = (extra?: React.CSSProperties): React.CSSProperties => ({ background: 'none', border: '1.5px solid var(--os-line)', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--os-accent)', cursor: 'pointer', ...extra })

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

function Section({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="evx-sec">
      <div className="evx-sec-head">
        <div className="evx-sec-icon"><EvIcon name={icon} size={17} /></div>
        <div><div className="evx-sec-title">{title}</div>{hint && <div className="evx-sec-hint">{hint}</div>}</div>
      </div>
      <div className="evx-fields">{children}</div>
    </section>
  )
}

function DetailsTab({ event, onUpdate }: { event: BosEvent; onUpdate: () => void }) {
  const [f, setF] = useState({
    title: event.title, tagline: event.tagline, description: event.description,
    date: event.date, time: event.time, endTime: event.endTime, timezone: event.timezone,
    format: event.format, location: event.location, locationName: event.locationName,
    capacity: String(event.capacity), price: String(event.price), currency: event.currency,
    coverImage: event.coverImage, thumbnailImage: event.thumbnailImage,
    status: event.status, tags: event.tags.join(', '),
    seoTitle: event.seoTitle, seoDescription: event.seoDescription,
  })
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF(v => ({ ...v, [k]: e.target.value }))

  async function save() {
    setSaveError('')
    const result = await updateEvent(event.id, {
      ...f, format: f.format as BosEvent['format'], status: f.status as BosEvent['status'],
      capacity: Number(f.capacity) || 0, price: Number(f.price) || 0,
      tags: f.tags.split(',').map(t => t.trim()).filter(Boolean),
    })
    onUpdate()
    if (!result.ok) {

      setSaveError(result.error || 'Could not save to the server. The change is only local for now.')
      return
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="evx-details-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }}>
      <div className="evx-form">
        <Section icon="ti-sparkles" title="The basics" hint="What people read first on the page and in the share card.">
          <div><label style={L}>Event title</label><input value={f.title} onChange={set('title')} placeholder="Group Coaching Kickoff" style={{ ...I, fontSize: 16, fontWeight: 700 }} /></div>
          <div><label style={L}>Tagline <span className="evx-hint-inline">one short line</span></label><input value={f.tagline} onChange={set('tagline')} placeholder="One line that captures the event" style={I} /></div>
          <div><label style={L}>Description <span className="evx-hint-inline">HTML supported</span></label><textarea value={f.description} onChange={set('description')} rows={6} style={{ ...I, resize: 'vertical', lineHeight: 1.6 }} /></div>
        </Section>

        <Section icon="ti-calendar-event" title="When" hint="The page shows this in each guest's own time zone.">
          <div className="evx-row evx-row-3">
            <div><label style={L}>Date</label><input type="date" value={f.date} onChange={set('date')} style={I} /></div>
            <div><label style={L}>Starts</label><input type="time" value={f.time} onChange={set('time')} style={I} /></div>
            <div><label style={L}>Ends</label><input type="time" value={f.endTime} onChange={set('endTime')} style={I} /></div>
          </div>
          <div><label style={L}>Time zone</label>
            <select value={f.timezone} onChange={set('timezone')} style={I}>
              {['UTC','America/New_York','America/Los_Angeles','Europe/Amsterdam','Europe/London','UTC'].map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </Section>

        <Section icon="ti-map-pin" title="Where" hint={f.format === 'online' ? 'The joining link only goes to guests by email.' : 'Shown on the page and in the confirmation.'}>
          <div className="evx-row evx-row-2">
            <div>
              <label style={L}>Format</label>
              <select value={f.format} onChange={set('format')} style={I}>
                <option value="in_person">In person</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div><label style={L}>Venue or platform <span className="evx-hint-inline">e.g. Google Meet</span></label><input value={f.locationName} onChange={set('locationName')} placeholder="Venue or platform" style={I} /></div>
          </div>
          <div><label style={L}>{f.format === 'online' ? 'Meeting link' : 'Address'}</label><input value={f.location} onChange={set('location')} placeholder={f.format === 'online' ? 'https://meet.google.com/...' : 'Full street address'} style={I} /></div>
        </Section>

        <Section icon="ti-ticket" title="Tickets" hint="A price above 0 makes it a paid event: the joining link waits for the payment.">
          <div className="evx-row evx-row-3">
            <div><label style={L}>Price</label><input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} style={I} /></div>
            <div>
              <label style={L}>Currency</label>
              <select value={f.currency} onChange={set('currency')} style={I}><option value="USD">USD</option><option value="EUR">EUR</option><option value="AWG">AWG</option></select>
            </div>
            <div><label style={L}>Seats <span className="evx-hint-inline">0 = no limit</span></label><input type="number" min="0" value={f.capacity} onChange={set('capacity')} style={I} /></div>
          </div>
        </Section>

        <Section icon="ti-eye" title="Picture" hint="One click. It is the page header, the card and the share image.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 10 }}>
            {EVENT_IMAGE_LIBRARY.map(img => {
              const on = (f.thumbnailImage || f.coverImage) === img.src
              return (
                <button key={img.src} type="button" title={img.label} onClick={() => setF(v => ({ ...v, coverImage: img.src, thumbnailImage: img.src }))}
                  style={{ padding: 0, border: `2px solid ${on ? 'var(--os-accent)' : 'transparent'}`, boxShadow: on ? '0 0 0 4px var(--os-accent-soft)' : 'none', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: 'none', aspectRatio: '4 / 3', position: 'relative' }}>
                  <img src={img.src} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {on && <span style={{ position: 'absolute', top: 6, right: 6, background: 'var(--os-accent)', color: '#fff', borderRadius: 100, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EvIcon name="ti-check" size={13} /></span>}
                </button>
              )
            })}
          </div>
          {(f.coverImage === SHARED_DEFAULT_IMAGE || !f.coverImage) && <div style={{ fontSize: 12.5, color: 'var(--os-warn)' }}>This event still uses the shared default picture. Pick one so it stands apart.</div>}
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--os-accent)' }}>Use my own picture link</summary>
            <div className="evx-fields" style={{ marginTop: 12 }}>
              <div><label style={L}>Cover image link</label><input value={f.coverImage} onChange={set('coverImage')} placeholder="https://..." style={I} /></div>
              <div><label style={L}>Thumbnail link</label><input value={f.thumbnailImage} onChange={set('thumbnailImage')} placeholder="https://..." style={I} /></div>
            </div>
          </details>
        </Section>

        <Section icon="ti-world" title="Search and tags" hint="Optional. Leave empty and the title and tagline are used.">
          <div className="evx-row evx-row-2">
            <div><label style={L}>Search title</label><input value={f.seoTitle} onChange={set('seoTitle')} placeholder="Override the page title" style={I} /></div>
            <div><label style={L}>Search description</label><input value={f.seoDescription} onChange={set('seoDescription')} placeholder="160 characters max" style={I} /></div>
          </div>
          <div><label style={L}>Tags <span className="evx-hint-inline">comma separated</span></label><input value={f.tags} onChange={set('tags')} placeholder="workshop, business" style={I} /></div>
        </Section>

        <div className="evx-save-bar">
          <span>{saved ? 'Saved. The public page is up to date.' : 'Changes go live on the public page when you save.'}</span>
          <button onClick={save} className="evx-btn evx-btn-primary">{saved ? <><EvIcon name="ti-check" size={15} /> Saved</> : 'Save details'}</button>
        </div>
        {saveError && (
          <div style={{ background: 'var(--os-bad-soft)', border: '1px solid var(--os-bad)', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: 'var(--os-bad)' }}>
            <strong>Not saved to the server:</strong> {saveError}<br />
            The public event page still shows the old value until this is fixed.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 }}>
        <div className="evx-sec" style={{ padding: '18px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--os-text)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Status</div>
          <select value={f.status} onChange={set('status')} style={{ ...I, marginBottom: 10 }}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={save} className="evx-btn evx-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Update status</button>
        </div>
        <div className="evx-sec" style={{ padding: '18px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--os-text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Public URL</div>
          <div style={{ fontSize: 11.5, color: 'var(--os-accent)', wordBreak: 'break-all', lineHeight: 1.6, marginBottom: 10 }}>
            {BRAND.website.replace(/^https?:\/\//, '')}/events/{event.slug}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href={`/events/${event.slug}`} target="_blank" rel="noreferrer" style={{ ...BtnGhost({ fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }) }}>
              <i className="ti ti-external-link" /> View
            </a>
            <button onClick={() => { void copyText(`${BRAND.website}/events/${event.slug}`) }} style={BtnGhost({ fontSize: 12 })}>
              <i className="ti ti-copy" /> Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpeakersTab({ event, onUpdate }: { event: BosEvent; onUpdate: () => void }) {
  const empty: Omit<Speaker, 'id'> = { name: '', title: '', bio: '', photo: '', linkedin: '', instagram: '', website: '' }
  const [editing, setEditing] = useState<Speaker | null>(null)
  const [form, setForm] = useState<Omit<Speaker, 'id'>>(empty)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  function startEdit(s: Speaker) { setEditing(s); setForm({ name: s.name, title: s.title, bio: s.bio, photo: s.photo, linkedin: s.linkedin ?? '', instagram: s.instagram ?? '', website: s.website ?? '' }) }
  function startAdd() { setEditing({ id: '' } as Speaker); setForm(empty) }

  function save() {
    const speakers = editing?.id
      ? event.speakers.map(s => s.id === editing.id ? { ...s, ...form } : s)
      : [...event.speakers, { id: uid(), ...form }]
    updateEvent(event.id, { speakers }); onUpdate(); setEditing(null)
  }

  function remove(id: string) {
    updateEvent(event.id, { speakers: event.speakers.filter(s => s.id !== id) }); onUpdate()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>{event.speakers.length} speaker{event.speakers.length !== 1 ? 's' : ''}</div>
        <button onClick={startAdd} style={Btn({ padding: '8px 16px', fontSize: 12 })}><i className="ti ti-plus" /> Add Speaker</button>
      </div>

      {event.speakers.length === 0 && !editing && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--os-text-faint)' }}>
          <i className="ti ti-microphone" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
          <div style={{ fontWeight: 700, color: 'var(--os-text-faint)', marginBottom: 8 }}>No speakers yet</div>
          <div style={{ fontSize: 13 }}>Add the people presenting at your event</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14, marginBottom: editing ? 24 : 0 }}>
        {event.speakers.map(s => (
          <div key={s.id} style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 12, padding: '16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {s.photo ? (
              <img src={s.photo} alt={s.name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,var(--os-accent),var(--os-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                {s.name.charAt(0)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--os-text)' }}>{s.name}</div>
              <div style={{ fontSize: 12, color: 'var(--os-accent)', fontWeight: 600, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: 'var(--os-text-faint)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.bio}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => startEdit(s)} style={BtnGhost({ fontSize: 11, padding: '4px 10px' })}>Edit</button>
                <button onClick={() => remove(s.id)} style={{ ...BtnGhost({ fontSize: 11, padding: '4px 10px' }), color: 'var(--os-bad)', borderColor: 'var(--os-bad-soft)' }}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ background: 'var(--os-card-alt)', border: '1.5px solid var(--os-line)', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--os-text)', marginBottom: 16 }}>{editing.id ? 'Edit Speaker' : 'Add Speaker'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={L}>Full Name</label><input value={form.name} onChange={set('name')} placeholder="Full name" style={I} /></div>
            <div><label style={L}>Title / Role</label><input value={form.title} onChange={set('title')} placeholder="Founder, Company" style={I} /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={L}>Bio</label><textarea value={form.bio} onChange={set('bio')} rows={3} placeholder="A short bio about the speaker..." style={{ ...I, resize: 'vertical' }} /></div>
            <div>
              <label style={L}>Photo URL</label>
              <input value={form.photo} onChange={set('photo')} placeholder="https://..." style={I} />
              {form.photo && <img src={form.photo} alt="Preview" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', marginTop: 8 }} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><label style={L}>LinkedIn</label><input value={form.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/..." style={I} /></div>
              <div><label style={L}>Instagram</label><input value={form.instagram} onChange={set('instagram')} placeholder="@handle" style={I} /></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={() => setEditing(null)} style={BtnGhost()}>Cancel</button>
            <button onClick={save} style={Btn()}>{editing.id ? 'Save Changes' : 'Add Speaker'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ScheduleTab({ event, onUpdate }: { event: BosEvent; onUpdate: () => void }) {
  const [items, setItems] = useState<AgendaItem[]>(event.agenda)

  function commit(next: AgendaItem[]) {
    setItems(next); updateEvent(event.id, { agenda: next }); onUpdate()
  }
  function add() { commit([...items, { id: uid(), time: '', title: '', description: '', speakerId: '' }]) }
  function remove(id: string) { commit(items.filter(i => i.id !== id)) }
  function move(idx: number, dir: -1 | 1) {
    const next = [...items]; const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]; commit(next)
  }
  function patch(id: string, k: keyof AgendaItem, v: string) {
    commit(items.map(i => i.id === id ? { ...i, [k]: v } : i))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>{items.length} agenda item{items.length !== 1 ? 's' : ''}</div>
        <button onClick={add} style={Btn({ padding: '8px 16px', fontSize: 12 })}><i className="ti ti-plus" /> Add Item</button>
      </div>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--os-text-faint)' }}>
          <i className="ti ti-list" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
          <div style={{ fontWeight: 700, color: 'var(--os-text-faint)' }}>No schedule yet</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item, idx) => (
            <div key={item.id} style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 12, padding: '14px 16px', display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto', gap: 10, alignItems: 'start' }}>
              <div><label style={L}>Time</label><input value={item.time} onChange={e => patch(item.id, 'time', e.target.value)} placeholder="9:00 AM" style={I} /></div>
              <div><label style={L}>Session Title</label><input value={item.title} onChange={e => patch(item.id, 'title', e.target.value)} placeholder="Opening keynote" style={I} /></div>
              <div>
                <label style={L}>Speaker</label>
                <select value={item.speakerId ?? ''} onChange={e => patch(item.id, 'speakerId', e.target.value)} style={I}>
                  <option value="">— None —</option>
                  {event.speakers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 20 }}>
                <button onClick={() => move(idx, -1)} disabled={idx === 0} style={{ ...BtnGhost({ padding: '4px 8px', fontSize: 12 }), opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} style={{ ...BtnGhost({ padding: '4px 8px', fontSize: 12 }), opacity: idx === items.length - 1 ? 0.4 : 1 }}>↓</button>
                <button onClick={() => remove(item.id)} style={{ ...BtnGhost({ padding: '4px 8px', fontSize: 12 }), color: 'var(--os-bad)', borderColor: 'var(--os-bad-soft)' }}>✕</button>
              </div>
              {item.description !== undefined && (
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={L}>Description</label>
                  <input value={item.description} onChange={e => patch(item.id, 'description', e.target.value)} placeholder="Optional details" style={I} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ATTENDEE_STATUS_STYLES: Record<AttendeeStatus, { color: string; bg: string }> = {
  registered: { color: 'var(--os-accent)', bg: '#eff6ff' },
  attended:   { color: 'var(--os-good)', bg: 'var(--os-good-soft)' },
  cancelled:  { color: 'var(--os-bad)', bg: 'var(--os-bad-soft)' },
  no_show:    { color: 'var(--os-text-faint)', bg: 'var(--os-line)' },
  waitlisted: { color: 'var(--os-warn)', bg: 'var(--os-warn-soft)' },
}

type AttendeeView = 'all' | 'paid' | 'unpaid' | 'came' | 'noshow' | 'notpipeline'

function AttendeesTab({ event }: { event: BosEvent }) {
  const [attendees, setAttendees] = useState<EventAttendee[]>([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState<AttendeeView>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '', company: '' })
  const [toast, setToast] = useState('')

  const reload = useCallback(() => setAttendees(getAttendees(event.id)), [event.id])
  useEffect(() => { reload(); window.addEventListener('bos:events', reload); return () => window.removeEventListener('bos:events', reload) }, [reload])

  useEffect(() => { void hydrateEventsDetailed().then(r => { if (r.ok) reload() }) }, [reload])
  const [paying, setPaying] = useState('')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { ok?: boolean; sent?: boolean; reason?: string; email?: string; error?: string }
      if (d?.sent) showToast(`Email updated. Confirmation resent to ${d.email}.`)
      else if (d?.reason === 'unpaid') showToast('Email updated. They get the joining link once they pay.')
      else if (d?.reason === 'event-over' || d?.reason === 'no-ticket' || d?.reason === 'no-event') showToast('Email updated.')
      else if (d?.ok) showToast('Email updated, but the confirmation did not send. Resend it from the Emails tab.')
      else showToast(d?.error || 'The new email may not have saved. Check it and try again.')
    }
    window.addEventListener('bos:attendee-email', on)
    return () => window.removeEventListener('bos:attendee-email', on)
  }, [])

  async function markSeatPaid(a: EventAttendee) {
    if (a.paid || paying) return
    if (event.price > 0) {
      const ok = await confirmAction({ message: `Mark ${a.name || a.email} as paid? They get the confirmation email with the joining link.`, confirmLabel: 'Mark paid' })
      if (!ok) return
      setPaying(a.id)
      try {
        const res = await fetch('/api/os/event-attendee-paid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendeeId: a.id }) })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || !j.ok) { showToast(j.error || 'Could not mark it paid.'); return }
        await hydrateEventsDetailed()
        reload()
        showToast(j.already ? 'Already paid.' : j.emailSent ? `Paid. ${a.name || a.email} has the joining link.` : 'Paid, but the email did not send: send the link by hand.')
      } finally { setPaying('') }
      return
    }
    markPaid(a.id, event.price); reload()
  }

  async function openProof(a: EventAttendee) {
    const res = await fetch('/api/os/event-attendee-paid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendeeId: a.id, action: 'proof' }) })
    const j = await res.json().catch(() => ({}))
    if (j.url) window.open(j.url, '_blank', 'noopener')
    else showToast(j.error || 'Could not open the proof.')
  }

  function openAttendee(a: EventAttendee) {
    openContactPanel(
      { id: a.id, name: a.name, email: a.email, phone: a.phone, company: a.company, notes: a.notes,
        createdAt: a.registeredAt, source: a.source, kindLabel: `Attendee · ${a.eventTitle}` },
      patch => { updateAttendee(a.id, patch as Partial<EventAttendee>); reload() },
    )
  }

  const pipelineEmails = new Set(getDeals().filter(isOpenDeal).map(d => d.clientEmail?.toLowerCase()).filter(Boolean))

  const strategyInvoiced = new Set(getInvoices()
    .filter(i => String(i.status) !== 'void' && /strategy session/i.test(`${i.projectTitle ?? ''} ${i.lineItems.map(l => l.name).join(' ')}`))
    .map(i => (i.clientEmail ?? '').toLowerCase()).filter(Boolean))

  const strategyInvoiceHref = (a: EventAttendee) => {
    const q = new URLSearchParams({ preset: 'strategy-intro', name: a.name ?? '', email: a.email ?? '', company: a.company ?? '', phone: a.phone ?? '' })
    return `/os/invoices/new?${q.toString()}`
  }

  function addToPipeline(a: EventAttendee) {
    if (!a.email) return
    saveDeal({
      clientName: a.name, clientEmail: a.email, clientPhone: a.phone || undefined, clientCompany: a.company || undefined,
      stage: 'lead', value: 0, currency: 'USD', service: `From event: ${a.eventTitle}`,
    })
    showToast(`${a.name} added to the pipeline`)
    window.dispatchEvent(new CustomEvent('bos:hydrated'))
  }

  function addManual() {
    if (!addForm.name || !addForm.email) return
    addAttendee({
      eventId: event.id, eventTitle: event.title, ...addForm,
      status: 'registered', paid: false, paidAt: '', paidAmount: 0,
      checkedIn: false, checkedInAt: '', ticketCode: generateTicketCode(),
      notes: '', source: 'manual',
    })
    setAddForm({ name: '', email: '', phone: '', company: '' }); setShowAdd(false); showToast('Attendee added')
  }

  async function broadcast(type: 'reminder' | 'followup') {

    const label = type === 'reminder' ? 'Reminder' : 'Follow-up'
    try {
      const res = await fetch('/api/send-event-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, eventId: event.id, broadcast: true }) })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.success) {
        showToast(`${label} failed: ${d?.error || `server answered ${res.status}`}`)
        return
      }
      showToast(d.failed > 0 ? `${label} sent to ${d.sent}, ${d.failed} failed` : `${label} sent to ${d.sent} attendees`)
    } catch {
      showToast(`${label} failed: network error`)
    }
  }

  const inView = (a: EventAttendee, v: AttendeeView) => {
    const came = a.checkedIn || a.status === 'attended'
    if (v === 'paid') return a.paid
    if (v === 'unpaid') return event.price > 0 && !a.paid && a.status !== 'cancelled'
    if (v === 'came') return came
    if (v === 'noshow') return !came && a.status !== 'cancelled' && !!event.date && event.date.slice(0, 10) < new Date().toISOString().slice(0, 10)
    if (v === 'notpipeline') return came && !pipelineEmails.has(a.email.toLowerCase())
    return true
  }
  const views: { key: AttendeeView; label: string }[] = [
    { key: 'all', label: 'Everyone' },
    ...(event.price > 0 ? [{ key: 'paid' as const, label: 'Paid' }, { key: 'unpaid' as const, label: 'Unpaid checkout' }] : []),
    { key: 'came', label: 'Came' },
    { key: 'noshow', label: 'No-show' },
    { key: 'notpipeline', label: 'Came, not in pipeline' },
  ]
  const filtered = attendees.filter(a => inView(a, view)).filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase()))
  const stats = { registered: attendees.filter(a => a.status === 'registered').length, attended: attendees.filter(a => a.status === 'attended').length, paid: attendees.filter(a => a.paid).length, waitlisted: attendees.filter(a => a.status === 'waitlisted').length }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[{ label: 'Registered', value: stats.registered, color: 'var(--os-accent)' }, { label: 'Attended', value: stats.attended, color: 'var(--os-good)' }, { label: 'Paid', value: stats.paid, color: 'var(--os-accent)' }, { label: 'Waitlisted', value: stats.waitlisted, color: 'var(--os-warn)' }].map(s => (
          <div key={s.label} style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--os-text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {views.map(v => {
          const n = attendees.filter(a => inView(a, v.key)).length
          const on = view === v.key
          return (
            <button key={v.key} onClick={() => setView(v.key)} style={{ padding: '6px 12px', borderRadius: 100, border: `1.5px solid ${on ? 'var(--os-accent)' : 'var(--os-line)'}`, background: on ? 'var(--os-accent)' : 'none', color: on ? '#fff' : 'var(--os-text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {v.label} <span style={{ opacity: 0.75 }}>{n}</span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ ...I, maxWidth: 260 }} />
        <div style={{ flex: 1 }} />
        <button onClick={() => exportAttendeesCSV(event.id)} style={BtnGhost({ fontSize: 12 })}><i className="ti ti-download" /> Export CSV</button>
        <button onClick={() => broadcast('reminder')} style={BtnGhost({ fontSize: 12 })}><i className="ti ti-bell" /> Send Reminder</button>
        <button onClick={() => broadcast('followup')} style={BtnGhost({ fontSize: 12 })}><i className="ti ti-mail" /> Send Follow-up</button>
        <button onClick={() => setShowAdd(true)} style={Btn({ fontSize: 12, padding: '8px 14px' })}><i className="ti ti-plus" /> Add</button>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--os-card-alt)', border: '1.5px solid var(--os-line)', borderRadius: 12, padding: '16px 18px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          {(['name', 'email', 'phone', 'company'] as const).map(k => (
            <div key={k}><label style={L}>{k.charAt(0).toUpperCase() + k.slice(1)}{k === 'name' || k === 'email' ? ' *' : ''}</label>
              <input value={addForm[k]} onChange={e => setAddForm(f => ({ ...f, [k]: e.target.value }))} style={I} /></div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={addManual} style={Btn({ padding: '9px 14px', fontSize: 12 })}>Add</button>
            <button onClick={() => setShowAdd(false)} style={BtnGhost({ padding: '9px 12px', fontSize: 12 })}>✕</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--os-text-faint)' }}>
          <i className="ti ti-users" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
          <div style={{ fontWeight: 700, color: 'var(--os-text-faint)' }}>{search || view !== 'all' ? 'Nobody matches this filter' : 'No attendees yet'}</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--os-card-alt)' }}>
                {['Name', 'Email', 'Status', 'Paid', 'Check-in', 'Ticket', 'Date', 'Pipeline', 'Strategy session', ''].map(h => (
                  <th key={h} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--os-text-faint)', textAlign: 'left', borderBottom: '1px solid var(--os-line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {

                const ss = ATTENDEE_STATUS_STYLES[a.status] ?? { color: 'var(--os-text-faint)', bg: 'var(--os-card-alt)' }
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--os-line)' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openAttendee(a)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--os-accent)', fontSize: 13, textDecoration: 'underline', textDecorationColor: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecorationColor = 'currentColor')} onMouseLeave={e => (e.currentTarget.style.textDecorationColor = 'transparent')}>
                        {a.name}
                      </button>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--os-text-muted)' }}><EmailText email={a.email} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      <select value={a.status} onChange={e => { updateAttendeeStatus(a.id, e.target.value as AttendeeStatus); reload() }}
                        style={{ fontSize: 11, fontWeight: 700, color: ss.color, background: ss.bg, border: 'none', borderRadius: 100, padding: '3px 9px', cursor: 'pointer', outline: 'none' }}>
                        <option value="registered">Registered</option>
                        <option value="attended">Attended</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="no_show">No Show</option>
                        <option value="waitlisted">Waitlisted</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {a.paid ? (
                        <PaymentChip a={a} onOpenProof={() => { void openProof(a) }} />
                      ) : (
                        <>
                          <button onClick={() => { void markSeatPaid(a) }} disabled={paying === a.id} title="Mark paid"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>
                            {paying === a.id ? '…' : '⬜'}
                          </button>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button onClick={() => { if (!a.checkedIn) { markCheckedIn(a.id); reload() } }}
                        title={a.checkedIn ? 'Checked in' : 'Mark checked in'}
                        style={{ background: 'none', border: 'none', cursor: a.checkedIn ? 'default' : 'pointer', fontSize: 16 }}>
                        {a.checkedIn ? '✅' : '⬜'}
                      </button>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--os-accent)', fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{a.ticketCode}</td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--os-text-faint)', whiteSpace: 'nowrap' }}>{new Date(a.registeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {!a.email ? (
                        <span style={{ fontSize: 11, color: 'var(--os-text-faint)' }}>No email</span>
                      ) : pipelineEmails.has(a.email.toLowerCase()) ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-good)' }}><i className="ti ti-circle-check" /> In pipeline</span>
                      ) : (
                        <button onClick={() => addToPipeline(a)} style={BtnGhost({ fontSize: 11, padding: '4px 10px' })}>
                          <i className="ti ti-plus" /> Add to pipeline
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {!a.email ? null : strategyInvoiced.has(a.email.toLowerCase()) ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-good)' }}><i className="ti ti-circle-check" /> Invoiced</span>
                      ) : (
                        <Link href={strategyInvoiceHref(a)} style={{ ...BtnGhost({ fontSize: 11, padding: '4px 10px' }), textDecoration: 'none' }}
                          title="Opens a new invoice for the Strategy Session at the $150 attendee price, already filled in">
                          <i className="ti ti-file-invoice" /> Invoice strategy session
                        </Link>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button onClick={async () => { if (await confirmAction({ message: 'Remove this attendee?', confirmLabel: 'Remove' })) { removeAttendee(a.id); reload() } }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-bad)', fontSize: 14 }}>
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

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--os-deep)', color: 'var(--os-on-deep)', borderRadius: 100, padding: '11px 22px', fontSize: 13, fontWeight: 600, zIndex: 999 }}>{toast}</div>}
    </div>
  )
}

type TimelineStage = { key: string; label: string; when: string; dueAt: string | null; sent: number; total: number }

function EmailTimeline({ event }: { event: BosEvent }) {
  const [stages, setStages] = useState<TimelineStage[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let dead = false
    fetch(`/api/os/events/email-timeline?eventId=${encodeURIComponent(event.id)}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (dead) return; ok ? setStages(d.stages) : setErr(d.error || 'Could not load') })
      .catch(() => { if (!dead) setErr('Could not load the timeline') })
    return () => { dead = true }
  }, [event.id])

  const now = Date.now()
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Email timeline</div>
      <div style={{ fontSize: 12.5, color: 'var(--os-text-faint)', marginBottom: 14 }}>
        Every email in the sequence, with what has actually been sent. A stage counts a send only after the mail service accepted it.
      </div>
      {err && <div style={{ fontSize: 13, color: 'var(--os-bad)' }}>{err}</div>}
      {!err && !stages && <div style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>Loading…</div>}
      {stages && (
        <div style={{ position: 'relative', paddingLeft: 22 }}>
          <div style={{ position: 'absolute', left: 8, top: 10, bottom: 10, width: 2, background: 'var(--os-line)' }} />
          {stages.map(st => {
            const due = st.dueAt ? Date.parse(st.dueAt) : null
            const done = st.total > 0 && st.sent >= st.total
            const partial = st.sent > 0 && !done
            const overdue = due !== null && due < now && st.sent === 0 && st.total > 0
            const future = due !== null && due > now
            const dot = done ? 'var(--os-good)' : partial ? 'var(--os-warn)' : overdue ? 'var(--os-bad)' : 'var(--os-line)'
            const badge = done ? '✓ sent' : partial ? `${st.sent} of ${st.total}` : future ? 'scheduled' : overdue ? 'not sent' : st.total === 0 ? 'no attendees' : '—'
            const badgeColor = done ? 'var(--os-good)' : partial ? 'var(--os-warn)' : overdue ? 'var(--os-bad)' : 'var(--os-text-faint)'
            return (
              <div key={st.key} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '7px 0', position: 'relative' }}>
                <span style={{ position: 'absolute', left: -20, top: 12, width: 12, height: 12, borderRadius: '50%', background: dot, border: '2px solid var(--os-card)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{st.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--os-text-faint)', marginLeft: 10 }}>
                    {st.dueAt ? fmt(st.dueAt) : st.when}
                  </span>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: badgeColor, whiteSpace: 'nowrap' }}>
                  {badge}{done || partial ? ` · ${st.sent}/${st.total}` : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmailsTab({ event, onUpdate }: { event: BosEvent; onUpdate: () => void }) {

  const seeded = useMemo(() => {
    const date = weekdayDate(event.date, 'Date to be confirmed')
    const time = String(event.time || '').trim() || 'Time to be confirmed'
    const location = String(event.location || event.locationName || '').trim() || 'Joining details follow by email'
    const joinUrl = (String(event.locationName || '').match(/https?:\/\/[^\s<"']+/) ?? [''])[0]
    const eventUrl = `${BRAND.website}/events/${encodeURIComponent(String(event.slug || '').trim())}`
    const title = String(event.title || '').trim() || `${BRAND.name} event`
    return {
      emailConfirmation: event.emailConfirmation?.trim()
        ? event.emailConfirmation
        : defaultConfirmationBody({ name: '{{name}}', eventTitle: title, date, time, location, ticketCode: '{{ticketCode}}', eventUrl }),
      emailReminder: event.emailReminder?.trim()
        ? event.emailReminder
        : defaultReminderBody({ name: '{{name}}', eventTitle: title, date, time, joinUrl }, 24),
      emailFollowUp: event.emailFollowUp?.trim()
        ? event.emailFollowUp
        : defaultFollowUpBody({ name: '{{name}}', eventTitle: title }),
    }
  }, [event])

  const [t, setT] = useState({ ...seeded, reminderHoursBefore: event.reminderHoursBefore })
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  function save() {
    updateEvent(event.id, t); onUpdate(); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const vars = ['{{name}}', '{{eventTitle}}', '{{date}}', '{{time}}', '{{location}}', '{{ticketCode}}']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AttendeeMail eventId={event.id} />
      <EmailTimeline event={event} />
      <OfferBroadcast event={event} />
      <div style={{ background: 'var(--os-card-alt)', border: '1px solid var(--os-line)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-text-faint)' }}>Variables:</span>
        {vars.map(v => <span key={v} style={{ fontSize: 11.5, background: 'var(--os-chip)', color: 'var(--os-accent)', borderRadius: 6, padding: '2px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>)}
      </div>

      {([
        { key: 'emailConfirmation' as const, label: 'Confirmation', sub: 'Sent immediately on registration', icon: 'ti-circle-check' },
        { key: 'emailReminder' as const, label: 'Reminder', sub: 'Sent before the event', icon: 'ti-bell' },
        { key: 'emailFollowUp' as const, label: 'Follow-up', sub: 'Sent after the event', icon: 'ti-mail-forward' },
      ]).map(({ key, label, sub, icon }) => (
        <div key={key} style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--os-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className={`ti ${icon}`} style={{ color: 'var(--os-accent)', fontSize: 16 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--os-text)' }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--os-text-faint)' }}>{sub}</div>
              </div>
            </div>
            <button onClick={() => setPreview(t[key])} style={BtnGhost({ fontSize: 12, padding: '6px 12px' })}>Preview</button>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <textarea value={t[key]} onChange={e => setT(v => ({ ...v, [key]: e.target.value }))} rows={8} style={{ ...I, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
          </div>
        </div>
      ))}

      <div style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 12, padding: '16px 18px' }}>
        <label style={L}>Send Reminder</label>
        <select value={String(t.reminderHoursBefore)} onChange={e => setT(v => ({ ...v, reminderHoursBefore: Number(e.target.value) }))} style={{ ...I, maxWidth: 260 }}>
          <option value="0">No automatic reminder</option>
          <option value="1">1 hour before</option>
          <option value="3">3 hours before</option>
          <option value="24">24 hours before</option>
          <option value="48">48 hours before</option>
        </select>
      </div>

      <button onClick={save} style={Btn()}>{saved ? '✓ Templates Saved' : 'Save Email Templates'}</button>

      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--os-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>Email Preview</span>
              <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--os-text-faint)' }}>✕</button>
            </div>
            <div style={{ padding: 20 }} dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsTab({ event, onUpdate }: { event: BosEvent; onUpdate: () => void }) {
  const router = useRouter()
  const [slug, setSlug] = useState(event.slug)
  const [waitlist, setWaitlist] = useState(event.waitlistEnabled)
  const [approval, setApproval] = useState(event.requiresApproval)
  const [faqs, setFaqs] = useState<FaqItem[]>(event.faq)
  const [saved, setSaved] = useState(false)

  function save() {
    updateEvent(event.id, { slug, waitlistEnabled: waitlist, requiresApproval: approval, faq: faqs })
    onUpdate(); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  function addFaq() { setFaqs(f => [...f, { id: uid(), question: '', answer: '' }]) }
  function removeFaq(id: string) { setFaqs(f => f.filter(q => q.id !== id)) }
  function patchFaq(id: string, k: 'question' | 'answer', v: string) { setFaqs(f => f.map(q => q.id === id ? { ...q, [k]: v } : q)) }

  async function handleDelete() {
    if (!(await confirmAction({ message: 'Delete this event and ALL its attendees?', detail: 'This cannot be undone.' }))) return
    deleteEvent(event.id)
    router.push('/os/events')
  }

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--os-line)' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--os-text)' }}>{label}</span>
      <button onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 100, background: value ? 'var(--os-accent)' : 'var(--os-line)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: 'var(--os-base-2, var(--os-card))', backgroundImage: 'var(--os-card-image, none)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      <div style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--os-text)', marginBottom: 14 }}>URL & SEO</div>
        <div style={{ marginBottom: 12 }}>
          <label style={L}>Event Slug</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--os-text-faint)' }}>{BRAND.website.replace(/^https?:\/\//, '')}/events/</span>
            <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} style={{ ...I, flex: 1 }} />
          </div>
          {slug !== event.slug && <div style={{ fontSize: 11.5, color: 'var(--os-warn)', marginTop: 6 }}>⚠ Changing the slug will break existing shared links</div>}
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--os-text)', marginBottom: 4 }}>Registration Settings</div>
        <Toggle value={waitlist} onChange={setWaitlist} label="Enable Waitlist when sold out" />
        <Toggle value={approval} onChange={setApproval} label="Require approval before confirming" />
      </div>

      <div style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--os-text)' }}>FAQ</div>
          <button onClick={addFaq} style={BtnGhost({ fontSize: 12, padding: '6px 12px' })}><i className="ti ti-plus" /> Add Question</button>
        </div>
        {faqs.length === 0 && <div style={{ fontSize: 13, color: 'var(--os-text-faint)', textAlign: 'center', padding: '20px 0' }}>No FAQ items yet</div>}
        {faqs.map(q => (
          <div key={q.id} style={{ marginBottom: 12, background: 'var(--os-card-alt)', borderRadius: 10, padding: '12px 14px' }}>
            <input value={q.question} onChange={e => patchFaq(q.id, 'question', e.target.value)} placeholder="Question…" style={{ ...I, marginBottom: 8, fontWeight: 700 }} />
            <textarea value={q.answer} onChange={e => patchFaq(q.id, 'answer', e.target.value)} placeholder="Answer…" rows={2} style={{ ...I, resize: 'vertical', marginBottom: 6 }} />
            <button onClick={() => removeFaq(q.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--os-bad)', fontSize: 12, fontWeight: 600 }}>Remove</button>
          </div>
        ))}
      </div>

      <button onClick={save} style={Btn()}>{saved ? '✓ Settings Saved' : 'Save Settings'}</button>

      <div style={{ background: 'var(--os-card)', border: '2px solid var(--os-bad-soft)', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--os-bad)', marginBottom: 8 }}>Danger Zone</div>
        <div style={{ fontSize: 13, color: 'var(--os-text-faint)', marginBottom: 14 }}>Permanently delete this event and all attendee data. This action cannot be undone.</div>
        <button onClick={handleDelete} style={{ background: 'var(--os-bad)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Delete Event</button>
      </div>
    </div>
  )
}

type Tab = 'overview' | 'details' | 'promote' | 'speakers' | 'schedule' | 'attendees' | 'emails' | 'settings'
const TABS: Tab[] = ['overview', 'details', 'promote', 'speakers', 'schedule', 'attendees', 'emails', 'settings']

export default function EventEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<BosEvent | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  const reload = useCallback(() => {
    const e = getEvent(id)
    if (!e) { router.replace('/os/events'); return }
    setEvent(e)
  }, [id, router])

  useEffect(() => {
    reload()

    const raf = requestAnimationFrame(() => {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null
      if (t && TABS.includes(t)) setTab(t)
    })
    window.addEventListener('bos:events', reload)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('bos:events', reload) }
  }, [reload])

  if (!event) return null

  const attendeeCount = getAttendees(event.id).length

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'ti-chart-bar' },
    { key: 'details', label: 'Details', icon: 'ti-info-circle' },
    { key: 'promote', label: 'Promote', icon: 'ti-speakerphone' },
    { key: 'speakers', label: `Speakers (${event.speakers.length})`, icon: 'ti-microphone' },
    { key: 'schedule', label: `Schedule (${event.agenda.length})`, icon: 'ti-list' },
    { key: 'attendees', label: `Attendees (${attendeeCount})`, icon: 'ti-users' },
    { key: 'emails', label: 'Emails', icon: 'ti-mail' },
    { key: 'settings', label: 'Settings', icon: 'ti-settings' },
  ]

  const statusColors: Record<string, { bg: string; color: string }> = {
    draft: { bg: 'var(--os-line)', color: 'var(--os-text-faint)' },
    published: { bg: 'var(--os-good-soft)', color: 'var(--os-good)' },
    completed: { bg: '#eff6ff', color: 'var(--os-accent)' },
    cancelled: { bg: 'var(--os-bad-soft)', color: 'var(--os-bad)' },
  }
  const sc = statusColors[event.status] ?? statusColors.draft

  const live = getAttendees(event.id).filter(a => a.status !== 'cancelled' && a.status !== 'waitlisted')
  const seatCount = event.price > 0 ? live.filter(a => a.paid).length : live.length
  const dateLine = event.date
    ? new Date(event.date.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : 'No date set'
  const zone = (event.timezone || 'UTC').split('/').pop()!.replace(/_/g, ' ')

  return (
    <div className="evx-page" style={{ maxWidth: 1140 }}>
      <div className="evx-banner">
        <img src={eventImage(event)} alt="" />
        <Link href="/os/events" className="evx-banner-back"><EvIcon name="ti-arrow-left" /> All events</Link>
        <div className="evx-banner-top">
          <a href={`/events/${event.slug}`} target="_blank" rel="noreferrer" className="evx-btn evx-btn-glass" style={{ padding: '8px 14px' }}>
            <EvIcon name="ti-external-link" /> Public page
          </a>
        </div>
        <div className="evx-banner-row">
          <div style={{ minWidth: 0 }}>
            <span className="evx-status" style={{ color: sc.color === 'var(--os-text-faint)' ? '#5a5274' : sc.color }}>{event.status}</span>
            <h1>{event.title || 'Untitled Event'}</h1>
            <div className="evx-meta">
              <span><EvIcon name="ti-calendar" />{dateLine}</span>
              {event.time && <span><EvIcon name="ti-clock" />{event.time}{event.endTime ? `–${event.endTime}` : ''} {zone}</span>}
              <span><EvIcon name={event.format === 'online' ? 'ti-video' : 'ti-map-pin'} />{event.locationName || (event.format === 'online' ? 'Online' : 'Location to add')}</span>
              <span><EvIcon name="ti-ticket" />{event.price > 0 ? `${event.currency === 'EUR' ? '€' : '$'}${event.price}` : 'Free'}</span>
            </div>
          </div>
          <div className="evx-count" style={{ marginTop: 0 }}>
            <div className="evx-count-cell"><div className="evx-count-n">{seatCount}</div><div className="evx-count-l">{event.price > 0 ? 'Paid seats' : 'Registered'}</div></div>
            {event.capacity > 0 && <div className="evx-count-cell"><div className="evx-count-n">{Math.max(0, event.capacity - seatCount)}</div><div className="evx-count-l">Seats open</div></div>}
          </div>
        </div>
      </div>

      <div className="evx-tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            <EvIcon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'  && <EventOverview event={event} attendees={getAttendees(event.id)} goTo={t => setTab(t)} />}
      {tab === 'details'   && <DetailsTab   event={event} onUpdate={reload} />}
      {tab === 'promote'   && <EventPromote event={event} />}
      {tab === 'speakers'  && <SpeakersTab  event={event} onUpdate={reload} />}
      {tab === 'schedule'  && <ScheduleTab  event={event} onUpdate={reload} />}
      {tab === 'attendees' && <AttendeesTab event={event} />}
      {tab === 'emails'    && <EmailsTab    event={event} onUpdate={reload} />}
      {tab === 'settings'  && <SettingsTab  event={event} onUpdate={reload} />}
    </div>
  )
}

function applyVars(text: string, name: string, title?: string): string {
  return text.replace(/\{\{name\}\}/g, name).replace(/\{\{eventTitle\}\}/g, String(title || 'the event'))
}

function messageToHtml(message: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const link = (t: string) => t.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}" style="color:#7C3AED">${u}</a>`)
  return message.trim().split(/\n{2,}/)
    .map(para => `<p style="margin:0 0 14px">${link(esc(para)).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function OfferBroadcast({ event }: { event: BosEvent }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<'all' | 'paid' | 'attended'>('all')
  const [excludeMembers, setExcludeMembers] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [armed, setArmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const [failedList, setFailedList] = useState<{ email: string; name?: string; reason: string }[]>([])

  async function send(onlyEmails?: string[]) {
    if (!subject.trim() || !message.trim()) {
      setFailed(true); setResult('It needs both a subject and a message.'); return
    }

    if (!onlyEmails && !armed) { setArmed(true); setResult(null); return }
    setArmed(false); setSending(true); setResult(null); setFailed(false); setFailedList([])

    try {
      const res = await fetch('/api/send-event-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'offer', eventId: event.id, broadcast: true,
          ...(onlyEmails ? { onlyEmails } : {}),
          subject: subject.trim(),

          bodyHtml: messageToHtml(message),
          excludeMembers, audience,
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.success) {
        setFailed(true)
        setResult(`Nothing was sent. ${d?.error || `The server answered ${res.status}.`}`)
      } else {
        setFailed(d.failed > 0)
        setFailedList(Array.isArray(d.failedList) ? d.failedList : [])
        setResult(
          `Sent to ${d.sent}.` +
          (d.excluded ? ` ${d.excluded} skipped, they are already clients.` : '') +
          (d.failed ? ` ${d.failed} failed.` : '')
        )
      }
    } catch {
      setFailed(true); setResult('Could not reach the server. Nothing was sent.')
    }
    setSending(false)
  }

  return (
    <div style={{ background: 'var(--os-card)', border: '1px solid var(--os-line)', borderLeft: '3px solid var(--os-warn)', borderRadius: 12, padding: '20px 22px' }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--os-text)', marginBottom: 4 }}>
        Send an offer to this event
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--os-text-faint)', maxWidth: '62ch' }}>
        A one-off message to the people who registered: the replay link, a follow-up, an
        invitation. Written fresh, sent once, not saved as a template.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="os-select" value={audience} onChange={e => setAudience(e.target.value as 'all' | 'paid' | 'attended')}>
          <option value="all">Everyone who registered</option>
          <option value="paid">Only paid seats (and anyone marked attended)</option>
          <option value="attended">Only those marked attended</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--os-text-muted)' }}>
          <input type="checkbox" checked={excludeMembers} onChange={e => setExcludeMembers(e.target.checked)} />
          Skip anyone who already joined
        </label>
      </div>

      <input
        className="os-input"
        value={subject}
        onChange={e => { setSubject(e.target.value); setArmed(false) }}
        placeholder="Subject line"
        style={{ width: '100%', marginBottom: 10 }}
      />
      <textarea
        className="os-textarea"
        value={message}
        onChange={e => { setMessage(e.target.value); setArmed(false) }}
        rows={10}
        placeholder={'Write it as you would say it. A blank line starts a new paragraph.\n\nPaste the replay link on its own line.'}
        style={{ width: '100%' }}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <button
          type="button"
          className="os-btn os-btn-sm"
          disabled={!message.trim()}
          onClick={() => setShowPreview(v => !v)}
        >
          {showPreview ? 'Hide preview' : 'Preview'}
        </button>
        <button
          className="os-btn os-btn-primary os-btn-sm"
          disabled={sending || !subject.trim() || !message.trim()}
          onClick={() => send()}
        >
          {sending ? 'Sending…' : armed ? 'Press again to send it' : 'Send to this event'}
        </button>
        {armed && (
          <span style={{ fontSize: 12.5, color: 'var(--os-warn)', fontWeight: 600 }}>
            This sends real email and cannot be taken back.
          </span>
        )}
      </div>

      {failedList.length > 0 && !sending && (
        <div style={{ marginTop: 12, background: 'var(--os-base-2)', border: '1px solid var(--os-bad)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--os-text)', marginBottom: 6 }}>Did not go out</div>
          {failedList.map(f => (
            <div key={f.email} style={{ fontSize: 13, color: 'var(--os-text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--os-text)' }}>{f.name || f.email}</strong> ({f.email}): {f.reason}
            </div>
          ))}
          <button className="os-btn os-btn-primary os-btn-sm" style={{ marginTop: 10 }} onClick={() => send(failedList.map(f => f.email))}>
            Retry these {failedList.length}
          </button>
        </div>
      )}

      {showPreview && (
        <div style={{ marginTop: 14, background: '#ffffff', color: '#212A4D', border: '1px solid var(--os-line)', borderRadius: 10, padding: '18px 20px', fontSize: 15, lineHeight: 1.6, maxWidth: 640 }}>
          <div style={{ fontSize: 12, color: '#6E6A7C', marginBottom: 10 }}>
            Preview, with a sample name. Subject: <strong>{applyVars(subject, 'Maria', event.title)}</strong>
          </div>
          <div dangerouslySetInnerHTML={{ __html: messageToHtml(applyVars(message, 'Maria', event.title)) }} />
        </div>
      )}

      {result && (
        <p style={{ margin: '12px 0 0', fontSize: 13.5, fontWeight: 600, color: failed ? 'var(--os-bad)' : 'var(--os-good)' }}>
          {result}
        </p>
      )}
    </div>
  )
}
