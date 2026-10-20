'use client'

import { useRef, useState } from 'react'
import { Icon } from './icons'
import { NALIE_WHATSAPP, SUBMIT_URL, qualify, type Fit } from './config'
import type { Copy, Lang, Option } from './content'

// ─────────────────────────────────────────────────────────────────────────────
// The application. Self-contained: no backend of its own. Where it goes is set
// in config.ts (a webhook, WhatsApp to Nalie, or both). Words come from
// content.ts, so the English and German pages ask the same questions.
//
// Every input sets an explicit color + caret colour: on a dark page without
// color-scheme: dark, typed text is otherwise invisible.
// ─────────────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'sending' | 'sent'
type F = Copy['form']

const labelOf = (list: Option[], v: string) => list.find(o => o.value === v)?.label ?? v

export default function ApplyForm({ f, lang }: { f: F; lang: Lang }) {
  const startedAt = useRef(0)
  const [trap, setTrap] = useState('') // honeypot: humans never see or fill it
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [age, setAge] = useState('')
  const [situation, setSituation] = useState('')
  const [struggle, setStruggle] = useState('')
  const [goal, setGoal] = useState('')
  const [start, setStart] = useState('')
  const [invest, setInvest] = useState('')
  const [commit, setCommit] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [fit, setFit] = useState<Fit | null>(null)
  const [message, setMessage] = useState('')
  const [missing, setMissing] = useState('')

  // The clock starts at the first interaction, never during render.
  const touch = () => { if (!startedAt.current) startedAt.current = Date.now() }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'sending') return
    const gaps = [age, situation, struggle, start, invest, commit]
      .map((v, i) => (v ? null : f.gapNames[i]))
      .filter(Boolean)
    if (gaps.length) { setMissing(`${f.missing} ${gaps.join(', ')}.`); return }
    setMissing('')
    setStatus('sending')

    const verdict = qualify({ invest, start, commit })
    const m = f.msg
    const text = [
      m.intro,
      '',
      `${m.name}: ${name}`,
      `${m.age}: ${labelOf(f.ages, age)}`,
      `${m.situation}: ${labelOf(f.situations, situation)}`,
      `${m.hardest}: ${labelOf(f.struggles, struggle)}`,
      ...(goal ? [`${m.goal}: ${goal}`] : []),
      `${m.start}: ${labelOf(f.start, start)}`,
      `${m.invest}: ${labelOf(f.invest, invest)}`,
      `${m.commit}: ${labelOf(f.commit, commit)}`,
      `${m.fits}: ${f.fitLabel[verdict]}`,
    ].join('\n')

    // A bot that fills the hidden field, or submits faster than a human can
    // read six questions, is shown the normal result and sent nowhere.
    const bot = trap !== '' || !startedAt.current || Date.now() - startedAt.current < 4000

    if (SUBMIT_URL && !bot) {
      await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'reliable-man', lang, fit: verdict, fitLabel: f.fitLabel[verdict],
          name, phone, email, age, situation, struggle, goal, start, invest, commit,
          summary: text, page: window.location.href, submittedAt: new Date().toISOString(),
          // Fields the Business OS dashboard's /api/lead reads, so SUBMIT_URL can point there.
          whatsapp: phone, message: text, pageUrl: window.location.href,
          tags: ['Reliable Man', f.fitLabel[verdict]].slice(0, 8), hp: '', elapsedMs: Date.now() - startedAt.current,
        }),
      }).catch(() => { /* WhatsApp is the second road */ })
    }

    setMessage(text)
    setFit(verdict)
    setStatus('sent')
  }

  if (status === 'sent' && fit) return <Result f={f} fit={fit} name={name} message={message} />

  return (
    <form className="rm-form" onSubmit={submit} onFocus={touch} onPointerDown={touch}>
      <input
        type="text" name="rm_hp_field" tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={trap} onChange={e => setTrap(e.target.value)}
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0, padding: 0, margin: -1 }}
      />

      <div className="rm-row2">
        <Field label={f.name} id="rm-name">
          <input id="rm-name" className="rm-input" type="text" required autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} placeholder={f.namePh} />
        </Field>
        <Field label={f.phone} id="rm-phone">
          <input id="rm-phone" className="rm-input" type="tel" required autoComplete="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={f.phonePh} />
        </Field>
      </div>
      <Field label={f.email} id="rm-email">
        <input id="rm-email" className="rm-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={f.emailPh} />
      </Field>

      <Choice q={f.ageQ} name="age" options={f.ages} value={age} onChange={setAge} compact />
      <Choice n={1} q={f.q1} name="situation" options={f.situations} value={situation} onChange={setSituation} />
      <Choice n={2} q={f.q2} name="struggle" options={f.struggles} value={struggle} onChange={setStruggle} />

      <Field label={f.q3} id="rm-goal">
        <textarea id="rm-goal" className="rm-input" rows={3} value={goal} onChange={e => setGoal(e.target.value)} placeholder={f.q3Ph} />
      </Field>

      <Choice n={4} q={f.q4} name="start" options={f.start} value={start} onChange={setStart} />
      <Choice n={5} q={f.q5} name="invest" options={f.invest} value={invest} onChange={setInvest} />
      <Choice n={6} q={f.q6} name="commit" options={f.commit} value={commit} onChange={setCommit} />

      {missing && <p className="rm-err" role="alert">{missing}</p>}

      <button className="rm-btn rm-btn-full" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? f.sending : f.submit} <Icon name="zap" size={18} />
      </button>
      <p className="rm-fine rm-center">{f.fine}</p>
    </form>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="rm-field">
      <label className="rm-label" htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

function Choice({ n, q, name, options, value, onChange, compact }: {
  n?: number; q: string; name: string; options: Option[]; value: string; onChange: (v: string) => void; compact?: boolean
}) {
  return (
    <fieldset className="rm-fieldset">
      <legend className="rm-label">{n ? `${n}. ` : ''}{q}</legend>
      <div className={compact ? 'rm-choices rm-choices-row' : 'rm-choices'}>
        {options.map(o => (
          <label key={o.value} className={`rm-choice${value === o.value ? ' is-on' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="rm-dot" aria-hidden="true" />
            <span>
              {o.label}
              {o.hint && <small className="rm-hint">{o.hint}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const RESULT_ICON: Record<Fit, string> = { private: 'crown', group: 'users', later: 'handshake' }

function Result({ f, fit, name, message }: { f: F; fit: Fit; name: string; message: string }) {
  const first = name.trim().split(/\s+/)[0] || f.brother
  const wa = NALIE_WHATSAPP ? `https://wa.me/${NALIE_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(message)}` : ''
  const r = f.result[fit]

  return (
    <div className="rm-result" role="status">
      <span className="rm-result-icon"><Icon name={RESULT_ICON[fit]} size={30} /></span>
      <p className="rm-eyebrow">{r.tag}</p>
      <h3 className="rm-h3">{r.h.replace('{name}', first)}</h3>
      <p>{r.p}</p>
      {wa ? (
        <>
          <p className="rm-result-step"><strong>{f.waStepStrong}</strong> {f.waStep}</p>
          <a className="rm-btn rm-btn-full rm-btn-wa" href={wa} target="_blank" rel="noopener noreferrer">
            <Icon name="messageCircle" size={20} /> {f.waButton}
          </a>
        </>
      ) : (
        <p className="rm-result-step">{f.noWa}</p>
      )}
    </div>
  )
}
