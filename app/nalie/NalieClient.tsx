'use client'

import { useState } from 'react'
import Image from 'next/image'
import ApplyForm from './ApplyForm'
import { Icon } from './icons'
import { COPY, type Lang } from './content'
// Nalie's photo lives IN this folder, so it travels with the code. To change
// it, replace these two files (portrait 4:5, avatar square).
import photo from './nalie.jpg'
import avatar from './nalie-avatar.jpg'

// ─────────────────────────────────────────────────────────────────────────────
// RELIABLE MAN · Nalie's landing page. ONE component, TWO pages:
//   /nalie     English (main)      app/nalie/page.tsx     -> lang="en"
//   /nalie-de  German              app/nalie-de/page.tsx  -> lang="de"
// Every word comes from content.ts. Icons and layout are shared, so the two
// pages can never drift apart in structure.
//
// Audience: men with Kurdish, Moroccan and Arab roots (mainly in Germany),
// roughly 20 to 45, eldest sons raised on family first.
//
// VISUAL FIRST: short lines, icons, and three pictures that carry the argument:
//   the backpack  same weight, with and without straps (structure)
//   the battery   running on 5% (the cost)
//   the house     family is the roof, you are the foundation (the method)
//
// THE SPINE (StoryBrand + a Hormozi-style offer): hero -> is this you ->
// two worlds -> what you really want -> the backpack -> the battery -> the
// guide -> the house -> the plan -> one programme, two ways -> before/after ->
// FAQ -> apply. Every button goes to #apply.
//
// TRUTH RULES: no invented testimonials, numbers or income promises. Coaching,
// not therapy or financial advice. No ethnicity named about the READER: Meta's
// ad policy forbids implying a viewer's ethnicity; "two worlds" says it better.
// ─────────────────────────────────────────────────────────────────────────────

// Icons pair with the copy arrays in content.ts BY POSITION.
const LOAD = [
  { icon: 'users', v: 100 },
  { icon: 'heart', v: 100 },
  { icon: 'wallet', v: 94 },
  { icon: 'target', v: 88 },
  { icon: 'flame', v: 80 },
]
const PAIN_ICONS = ['siren', 'heart', 'wallet', 'clock', 'messageCircleOff', 'flame']
const HOME_ICONS = ['users', 'handHeart', 'shieldCheck']
const OUT_ICONS = ['clock', 'gem', 'target']
const WANT_ICONS = ['gem', 'crown', 'flame', 'house', 'dumbbell', 'mountain']
const COST_ICONS = ['users', 'flame', 'handshake', 'user']
const CHIP_ICONS = ['listChecks', 'calendarCheck', 'messageCircle']
const PILLAR_ICONS = ['calendarCheck', 'wallet', 'brain', 'crown']
const PLAN_ICONS = ['listChecks', 'phone', 'trendingUp']
const APPLY_ICONS = ['clock', 'eye', 'target']
// Same system; Private is the Brotherhood plus the one-to-one layer.
const COMPARE_MARKS: { group: boolean; vip: boolean }[] = [
  { group: true, vip: true },
  { group: true, vip: true },
  { group: true, vip: true },
  { group: true, vip: true },
  { group: true, vip: false },
  { group: false, vip: true },
  { group: false, vip: true },
]

function goApply(e?: React.MouseEvent) {
  e?.preventDefault()
  document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Cta({ label }: { label: string }) {
  return (
    <a href="#apply" onClick={goApply} className="rm-btn">
      {label} <span aria-hidden="true">→</span>
    </a>
  )
}

function Head({ eyebrow, title, dark }: { eyebrow: string; title: React.ReactNode; dark?: boolean }) {
  return (
    <>
      <p className={`rm-eyebrow${dark ? ' rm-eyebrow-dark' : ''}`}>{eyebrow}</p>
      <h2 className="rm-h2">{title}</h2>
    </>
  )
}

export default function NalieClient({ lang }: { lang: Lang }) {
  const c = COPY[lang]
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <main className="rm" lang={c.htmlLang}>
      <style>{CSS}</style>

      <header className="rm-top">
        <div className="rm-wrap rm-top-in">
          <span className="rm-mark"><span className="rm-mark-bar" aria-hidden="true" />RELIABLE MAN</span>
          <div className="rm-top-right">
            <nav className="rm-lang" aria-label="Language">
              <span className="rm-lang-on" aria-current="page">{lang.toUpperCase()}</span>
              <a href={c.switchHref} hrefLang={lang === 'en' ? 'de' : 'en'} aria-label={c.switchAria}>{c.switchLabel}</a>
            </nav>
            <a href="#apply" onClick={goApply} className="rm-top-cta">{c.apply}</a>
          </div>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="rm-hero">
        <div className="rm-wrap rm-hero-grid">
          <div>
            <p className="rm-eyebrow">{c.hero.eyebrow}</p>
            <h1 className="rm-h1">{c.hero.h1a} <span className="rm-accent">{c.hero.h1b}</span></h1>
            <p className="rm-lede">{c.hero.lede}</p>
            <div className="rm-hero-cta">
              <Cta label={c.hero.cta} />
              <p className="rm-coach">
                <Image src={avatar} alt="" width={44} height={44} className="rm-avatar" priority />
                <span><strong>{c.hero.coach}</strong><br />{c.hero.coachSub}</span>
              </p>
            </div>
          </div>

          <div className="rm-load" aria-label={c.hero.loadAria}>
            <p className="rm-load-h">{c.hero.loadTitle}</p>
            {LOAD.map((l, i) => (
              <div key={l.icon + i} className="rm-load-row">
                <span className="rm-load-ic"><Icon name={l.icon} size={18} /></span>
                <span className="rm-load-l">{c.hero.load[i]}</span>
                <span className="rm-bar"><span className="rm-bar-fill rm-bar-hot" style={{ width: `${l.v}%` }} /></span>
              </div>
            ))}
            <div className="rm-load-row rm-load-struct">
              <span className="rm-load-ic"><Icon name="calendarCheck" size={18} /></span>
              <span className="rm-load-l">{c.hero.structure}</span>
              <span className="rm-bar"><span className="rm-bar-fill rm-bar-low" style={{ width: '12%' }} /></span>
            </div>
            <p className="rm-load-foot">{c.hero.loadFoot} <strong>{c.hero.loadFootStrong}</strong></p>
          </div>
        </div>
      </section>

      {/* ── IS THIS YOU ──────────────────────────────────────────────────── */}
      <section className="rm-band rm-light">
        <div className="rm-wrap">
          <Head dark eyebrow={c.pains.eyebrow} title={c.pains.title} />
          <div className="rm-tiles">
            {c.pains.items.map((t, i) => (
              <div key={t} className="rm-tile">
                <span className="rm-tile-ic"><Icon name={PAIN_ICONS[i]} size={26} /></span>
                <p>{t}</p>
              </div>
            ))}
          </div>
          <p className="rm-punch">{c.pains.punch} <strong>{c.pains.punchStrong}</strong></p>
        </div>
      </section>

      {/* ── TWO WORLDS ───────────────────────────────────────────────────── */}
      <section className="rm-band">
        <div className="rm-wrap">
          <Head eyebrow={c.worlds.eyebrow} title={c.worlds.title} />
          <div className="rm-worlds">
            <div className="rm-world">
              <p className="rm-world-h"><Icon name="house" size={20} /> {c.worlds.homeH}</p>
              <ul>{c.worlds.home.map((t, i) => <li key={t}><Icon name={HOME_ICONS[i]} size={18} /> {t}</li>)}</ul>
            </div>
            <div className="rm-world-you">
              <span className="rm-you"><Icon name="user" size={34} /></span>
              <p>{c.worlds.you}<br /><strong>{c.worlds.youStrong}</strong></p>
            </div>
            <div className="rm-world">
              <p className="rm-world-h"><Icon name="trendingUp" size={20} /> {c.worlds.outH}</p>
              <ul>{c.worlds.out.map((t, i) => <li key={t}><Icon name={OUT_ICONS[i]} size={18} /> {t}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT YOU WANT ────────────────────────────────────────────────── */}
      <section className="rm-band rm-steel">
        <div className="rm-wrap">
          <Head eyebrow={c.wants.eyebrow} title={<>{c.wants.titleA} <span className="rm-accent">{c.wants.titleB}</span></>} />
          <p className="rm-sub">{c.wants.sub}</p>
          <div className="rm-wants">
            {c.wants.items.map((w, i) => (
              <div key={w.t} className="rm-want">
                <span className="rm-want-ic"><Icon name={WANT_ICONS[i]} size={28} /></span>
                <h3 className="rm-h4">{w.t}</h3>
                <p>{w.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE BACKPACK ─────────────────────────────────────────────────── */}
      <section className="rm-band rm-light">
        <div className="rm-wrap">
          <Head dark eyebrow={c.pack.eyebrow} title={c.pack.title} />
          <div className="rm-packs">
            <figure className="rm-pack rm-pack-bad">
              <Backpack straps={false} label={c.pack.badAria} />
              <figcaption><span className="rm-pill rm-pill-bad"><Icon name="x" size={16} /> {c.pack.bad}</span>{c.pack.badText}</figcaption>
            </figure>
            <figure className="rm-pack rm-pack-good">
              <Backpack straps label={c.pack.goodAria} />
              <figcaption><span className="rm-pill rm-pill-good"><Icon name="check" size={16} /> {c.pack.good}</span>{c.pack.goodText}</figcaption>
            </figure>
          </div>
          <p className="rm-punch rm-center">{c.pack.punchA} <strong>{c.pack.punchStrong}</strong><br />{c.pack.punchB}</p>
        </div>
      </section>

      {/* ── THE BATTERY ──────────────────────────────────────────────────── */}
      <section className="rm-band">
        <div className="rm-wrap rm-battery-grid">
          <div className="rm-battery-side">
            <div className="rm-battery" role="img" aria-label={c.battery.aria}>
              <span className="rm-battery-fill" />
              <span className="rm-battery-cap" />
            </div>
            <p className="rm-battery-n" aria-hidden="true">5%</p>
          </div>
          <div>
            <Head eyebrow={c.battery.eyebrow} title={c.battery.title} />
            <div className="rm-costs">
              {c.battery.items.map((x, i) => (
                <div key={x.t} className="rm-cost">
                  <span className="rm-cost-ic"><Icon name={COST_ICONS[i]} size={20} /></span>
                  <div><strong>{x.t}</strong><p>{x.d}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── NALIE ────────────────────────────────────────────────────────── */}
      <section className="rm-band rm-light">
        <div className="rm-wrap rm-guide">
          <div className="rm-guide-photo">
            <Image src={photo} alt={c.guide.alt} sizes="(max-width: 960px) 260px, 300px" placeholder="blur" loading="eager" />
          </div>
          <div>
            <Head dark eyebrow={c.guide.eyebrow} title={c.guide.title} />
            <p className="rm-p">{c.guide.text}</p>
            <div className="rm-chips">
              {c.guide.chips.map((t, i) => <span key={t}><Icon name={CHIP_ICONS[i]} size={18} /> {t}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ── THE HOUSE ────────────────────────────────────────────────────── */}
      <section className="rm-band">
        <div className="rm-wrap">
          <Head eyebrow={c.house.eyebrow} title={<>{c.house.titleA} <span className="rm-accent">{c.house.titleB}</span></>} />
          <div className="rm-house" role="img" aria-label={c.house.aria}>
            <div className="rm-roof"><Icon name="users" size={28} /><span>{c.house.roof}</span></div>
            <div className="rm-pillars">
              {c.house.pillars.map((p, i) => (
                <div key={p.t} className="rm-pillar">
                  <Icon name={PILLAR_ICONS[i]} size={24} />
                  <span>{p.t}</span>
                </div>
              ))}
            </div>
            <div className="rm-base">{c.house.base}</div>
          </div>
          <div className="rm-pillar-text">
            {c.house.pillars.map(p => <div key={p.t}><strong>{p.t}</strong><p>{p.d}</p></div>)}
          </div>
        </div>
      </section>

      {/* ── THE PLAN ─────────────────────────────────────────────────────── */}
      <section className="rm-band rm-light">
        <div className="rm-wrap">
          <Head dark eyebrow={c.plan.eyebrow} title={c.plan.title} />
          <ol className="rm-plan">
            {c.plan.items.map((s, i) => (
              <li key={s.t}>
                <span className="rm-plan-n">{i + 1}</span>
                <span className="rm-plan-ic"><Icon name={PLAN_ICONS[i]} size={26} /></span>
                <h3 className="rm-h4">{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="rm-center rm-mt"><Cta label={c.hero.cta} /></div>
        </div>
      </section>

      {/* ── ONE PROGRAMME, TWO WAYS ──────────────────────────────────────── */}
      <section className="rm-band">
        <div className="rm-wrap">
          <Head eyebrow={c.compare.eyebrow} title={c.compare.title} />
          <div className="rm-compare" role="table" aria-label={c.compare.aria}>
            <div className="rm-cmp-row rm-cmp-head" role="row">
              <span role="columnheader" />
              <span role="columnheader"><Icon name="users" size={22} /><strong>{c.compare.group}</strong><small>{c.compare.groupSub}</small></span>
              <span role="columnheader"><Icon name="crown" size={22} /><strong>{c.compare.vip}</strong><small>{c.compare.vipSub}</small></span>
            </div>
            {c.compare.rows.map((t, i) => {
              const r = COMPARE_MARKS[i]
              return (
                <div key={t} className="rm-cmp-row" role="row">
                  <span role="cell">{t}</span>
                  <span role="cell" className={r.group ? 'rm-yes' : 'rm-no'}><Icon name={r.group ? 'check' : 'x'} size={20} /></span>
                  <span role="cell" className={r.vip ? 'rm-yes' : 'rm-no'}><Icon name={r.vip ? 'check' : 'x'} size={20} /></span>
                </div>
              )
            })}
          </div>
          <p className="rm-cmp-note"><Icon name="sparkles" size={18} /> {c.compare.note}</p>
          <div className="rm-center"><Cta label={c.compare.cta} /></div>
        </div>
      </section>

      {/* ── BEFORE / AFTER ───────────────────────────────────────────────── */}
      <section className="rm-band rm-light">
        <div className="rm-wrap">
          <Head dark eyebrow={c.futures.eyebrow} title={c.futures.title} />
          <div className="rm-futures">
            <div className="rm-future rm-future-no">
              <p className="rm-future-h"><Icon name="batteryLow" size={22} /> {c.futures.noH}</p>
              <ul>{c.futures.before.map(t => <li key={t}><Icon name="x" size={18} />{t}</li>)}</ul>
            </div>
            <div className="rm-future rm-future-yes">
              <p className="rm-future-h"><Icon name="shieldCheck" size={22} /> {c.futures.yesH}</p>
              <ul>{c.futures.after.map(t => <li key={t}><Icon name="check" size={18} />{t}</li>)}</ul>
            </div>
          </div>
          <p className="rm-punch rm-center">{c.futures.punch}<br /><strong>{c.futures.punchStrong}</strong></p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="rm-band">
        <div className="rm-wrap rm-narrow">
          <Head eyebrow={c.faq.eyebrow} title={c.faq.title} />
          <div className="rm-faq">
            {c.faq.items.map((f, i) => {
              const open = openFaq === i
              return (
                <div key={f.q} className="rm-faq-item">
                  <button type="button" aria-expanded={open} onClick={() => setOpenFaq(open ? null : i)}>
                    {f.q}<span aria-hidden="true">{open ? '−' : '+'}</span>
                  </button>
                  {open && <p>{f.a}</p>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── APPLY ────────────────────────────────────────────────────────── */}
      <section id="apply" className="rm-band rm-apply">
        <div className="rm-wrap rm-apply-in">
          <div className="rm-apply-copy">
            <Head eyebrow={c.applyBlock.eyebrow} title={<>{c.applyBlock.titleA} <span className="rm-accent">{c.applyBlock.titleB}</span></>} />
            <ul className="rm-apply-points">
              {c.applyBlock.points.map((t, i) => <li key={t}><Icon name={APPLY_ICONS[i]} size={20} /> {t}</li>)}
            </ul>
          </div>
          <ApplyForm f={c.form} lang={lang} />
        </div>
      </section>

      <footer className="rm-foot">
        <div className="rm-wrap rm-foot-in">
          <span className="rm-mark"><span className="rm-mark-bar" aria-hidden="true" />RELIABLE MAN</span>
          <p>{c.footer}<br />© {new Date().getFullYear()} Reliable Man</p>
        </div>
      </footer>
    </main>
  )
}

/** The analogy, drawn: one figure, the same pack, with and without straps. */
function Backpack({ straps, label }: { straps: boolean; label: string }) {
  const ink = straps ? '#15171b' : '#6b665d'
  const pack = straps ? '#d4a24c' : '#b9a27a'
  return (
    <svg viewBox="0 0 200 220" className="rm-pack-svg" role="img" aria-label={label}>
      <line x1="30" y1="206" x2="170" y2="206" stroke="#d8d2c6" strokeWidth="4" strokeLinecap="round" />
      <g transform={straps ? undefined : 'rotate(-13 100 204)'} stroke={ink} strokeWidth="7" strokeLinecap="round" fill="none">
        {/* the pack sits behind the body */}
        <rect x={straps ? 104 : 110} y={straps ? 66 : 92} width="46" height="62" rx="12" fill={pack} stroke={ink} strokeWidth="5"
          transform={straps ? undefined : 'rotate(28 133 123)'} />
        {straps ? (
          <>
            <path d="M104 72 C 92 78, 92 100, 100 110" strokeWidth="5" />
            <path d="M106 118 L 100 124" strokeWidth="5" />
          </>
        ) : (
          <path d="M104 74 C 118 80, 120 92, 116 98" strokeWidth="4" strokeDasharray="4 5" />
        )}
        <circle cx="100" cy="40" r="17" fill="#fff" />
        <line x1="100" y1="58" x2="100" y2="134" />
        <line x1="100" y1="80" x2={straps ? 74 : 80} y2={straps ? 116 : 122} />
        <line x1="100" y1="80" x2={straps ? 126 : 118} y2={straps ? 116 : 70} />
        <line x1="100" y1="134" x2={straps ? 80 : 84} y2="202" />
        <line x1="100" y1="134" x2={straps ? 120 : 112} y2="202" />
      </g>
      {!straps && (
        <g fill="#c24a36">
          <path d="M40 40 l8 -14 l2 9 l8 -3 l-8 15 l-2 -9 z" />
          <path d="M156 34 l8 -14 l2 9 l8 -3 l-8 15 l-2 -9 z" />
        </g>
      )}
      {straps && (
        <g stroke="#d4a24c" strokeWidth="4" strokeLinecap="round">
          <line x1="44" y1="44" x2="56" y2="50" />
          <line x1="40" y1="64" x2="54" y2="64" />
          <line x1="156" y1="44" x2="144" y2="50" />
          <line x1="160" y1="64" x2="146" y2="64" />
        </g>
      )}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Near-black and bone, one brass accent, a condensed display face. Measured on
// #0d0f12: ink #f3eee4 16.9:1, body #b9b4aa 9.4:1, muted #8e8a83 5.6:1,
// brass 8.2:1. On bone #f3eee4: ink #15171b 16.6:1, body #4a4740 8.4:1,
// brass-ink #7a5718 5.9:1.
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
.rm{--bg:#0d0f12;--surf:#161a20;--line:rgba(243,238,228,.09);--ink:#f3eee4;--body:#b9b4aa;--muted:#8e8a83;--brass:#d4a24c;--brass-2:#e7bd6c;--bone:#f3eee4;--bone-ink:#15171b;--bone-body:#4a4740;--brass-ink:#7a5718;--hot:#c9553f;
  background:var(--bg);color:var(--body);font-family:var(--rm-body),system-ui,sans-serif;font-size:17px;line-height:1.6;min-height:100vh;overflow-x:hidden}
.rm *{box-sizing:border-box}
.rm svg{flex:0 0 auto}
.rm-wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.rm-narrow{max-width:780px}
.rm-center{text-align:center}
.rm-mt{margin-top:40px}.rm-mt-s{margin-top:28px}
.rm-top{position:sticky;top:0;z-index:50;background:rgba(13,15,18,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.rm-top-in{display:flex;align-items:center;justify-content:space-between;height:62px}
.rm-mark{display:inline-flex;align-items:center;gap:10px;font-family:var(--rm-display),sans-serif;font-weight:700;letter-spacing:.22em;color:var(--ink);font-size:16px}
.rm-mark-bar{width:22px;height:4px;background:var(--brass);display:inline-block}
.rm-top-right{display:flex;align-items:center;gap:14px}
.rm-lang{display:inline-flex;border:1px solid rgba(243,238,228,.2);border-radius:8px;overflow:hidden;font-size:13px;font-weight:700;letter-spacing:.06em}
.rm-lang > *{padding:8px 11px;min-height:40px;display:inline-flex;align-items:center}
.rm-lang-on{background:rgba(243,238,228,.12);color:var(--ink)}
.rm-lang a{color:var(--muted);text-decoration:none}
.rm-lang a:hover{color:var(--brass-2)}
.rm-top-cta{background:var(--brass);color:#14110b;font-weight:700;text-decoration:none;padding:9px 18px;border-radius:8px;font-size:14px;min-height:40px;display:inline-flex;align-items:center}
.rm-top-cta:hover{background:var(--brass-2)}

.rm-hero{padding:72px 0 88px;background:radial-gradient(70% 60% at 85% 10%,rgba(212,162,76,.16),rgba(13,15,18,0) 70%),linear-gradient(180deg,#0d0f12,#12151a)}
.rm-hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:center}
.rm-eyebrow{font-family:var(--rm-display),sans-serif;text-transform:uppercase;letter-spacing:.16em;font-size:13px;font-weight:600;color:var(--brass);margin:0 0 16px}
.rm-eyebrow-dark{color:var(--brass-ink)}
.rm-h1{font-family:var(--rm-display),sans-serif;font-weight:700;text-transform:uppercase;color:var(--ink);font-size:clamp(38px,5.6vw,70px);line-height:1.03;margin:0 0 24px}
.rm-accent{color:var(--brass)}
.rm-lede{font-size:clamp(17px,1.6vw,20px);color:#cfcac0;max-width:600px;margin:0 0 32px}
.rm-hero-cta{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.rm-load{background:var(--surf);border:1px solid var(--line);border-radius:18px;padding:24px 22px;box-shadow:0 30px 70px rgba(0,0,0,.45)}
.rm-load-h{font-family:var(--rm-display),sans-serif;text-transform:uppercase;letter-spacing:.14em;font-size:13px;color:var(--muted);margin:0 0 16px}
.rm-load-row{display:grid;grid-template-columns:26px 110px 1fr;gap:10px;align-items:center;margin-bottom:12px;color:var(--ink);font-size:15px}
.rm-load-ic{color:var(--hot);display:inline-flex}
.rm-load-struct{margin-top:18px;padding-top:16px;border-top:1px dashed rgba(243,238,228,.18)}
.rm-load-struct .rm-load-ic{color:var(--brass)}
.rm-bar{height:10px;border-radius:99px;background:rgba(243,238,228,.08);overflow:hidden}
.rm-bar-fill{display:block;height:100%;border-radius:99px}
.rm-bar-hot{background:linear-gradient(90deg,#b8472f,#e06a4f)}
.rm-bar-low{background:var(--brass);animation:rm-blink 1.6s ease-in-out infinite}
@keyframes rm-blink{50%{opacity:.35}}
.rm-load-foot{margin:14px 0 0;font-size:14.5px;color:var(--body)}
.rm-load-foot strong{color:var(--brass)}

.rm-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--brass);color:#14110b;font-weight:700;font-size:17px;text-decoration:none;padding:17px 30px;border-radius:10px;border:0;cursor:pointer;min-height:54px;transition:transform .15s ease,background .15s ease;box-shadow:0 10px 30px rgba(212,162,76,.2);font-family:inherit}
.rm-btn:hover{background:var(--brass-2);transform:translateY(-1px)}
.rm-btn:disabled{opacity:.6;cursor:wait;transform:none}
.rm-btn-full{width:100%}
.rm-btn-wa{background:#25d366;color:#07210f;box-shadow:0 10px 30px rgba(37,211,102,.25);margin-top:6px}
.rm-btn-wa:hover{background:#3ee07a}
.rm-fine{font-size:14px;color:var(--muted);margin:0}

.rm-band{padding:88px 0;border-top:1px solid var(--line)}
.rm-light{background:var(--bone);color:var(--bone-body);border-top:0}
.rm-light .rm-h2,.rm-light .rm-h3,.rm-light .rm-h4{color:var(--bone-ink)}
.rm-steel{background:linear-gradient(180deg,#171b22,#111418)}
.rm-h2{font-family:var(--rm-display),sans-serif;font-weight:700;text-transform:uppercase;color:var(--ink);font-size:clamp(30px,4.2vw,50px);line-height:1.06;margin:0 0 30px;max-width:900px}
.rm-h3{font-family:var(--rm-display),sans-serif;font-weight:600;color:var(--ink);font-size:clamp(22px,2.2vw,27px);line-height:1.2;margin:0 0 10px}
.rm-h4{font-family:var(--rm-display),sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);font-size:19px;margin:0 0 6px}
.rm-sub{font-size:18px;margin:-12px 0 36px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rm-sub.rm-center{justify-content:center;color:var(--body)}
.rm-p{margin:0 0 18px;font-size:18px}
.rm-punch{font-family:var(--rm-display),sans-serif;font-size:clamp(21px,2.3vw,28px);line-height:1.3;margin:40px 0 0;color:var(--bone-ink)}
.rm-punch strong{color:var(--brass-ink)}

.rm-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.rm-tile{background:#fff;border:1px solid rgba(21,23,27,.08);border-radius:14px;padding:22px 20px;display:flex;gap:14px;align-items:center}
.rm-tile p{margin:0;font-size:17px;color:var(--bone-ink);font-weight:500;line-height:1.35}
.rm-tile-ic{flex:0 0 48px;height:48px;border-radius:12px;background:var(--bone-ink);color:var(--brass-2);display:inline-flex;align-items:center;justify-content:center}

.rm-worlds{display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:stretch}
.rm-world{background:var(--surf);border:1px solid var(--line);border-radius:16px;padding:24px}
.rm-world-h{display:flex;gap:10px;align-items:center;font-family:var(--rm-display),sans-serif;text-transform:uppercase;letter-spacing:.1em;color:var(--brass);margin:0 0 14px;font-size:17px}
.rm-world ul{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.rm-world li{display:flex;gap:10px;align-items:center;color:var(--ink);font-size:17px}
.rm-world li svg{color:var(--muted)}
.rm-world-you{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;max-width:250px;gap:12px}
.rm-world-you p{margin:0;font-size:16px}
.rm-world-you strong{color:var(--ink)}
.rm-you{width:74px;height:74px;border-radius:50%;background:var(--brass);color:#14110b;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 8px rgba(212,162,76,.15)}

.rm-wants{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.rm-want{background:rgba(243,238,228,.04);border:1px solid var(--line);border-radius:16px;padding:24px 22px}
.rm-want p{margin:0;font-size:16px}
.rm-want-ic{display:inline-flex;width:54px;height:54px;border-radius:14px;align-items:center;justify-content:center;background:rgba(212,162,76,.12);color:var(--brass);margin-bottom:14px}

.rm-packs{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.rm-pack{margin:0;background:#fff;border-radius:18px;padding:24px 20px;text-align:center;border:2px solid transparent}
.rm-pack-good{border-color:var(--brass)}
.rm-pack-svg{width:100%;max-width:240px;height:auto;display:block;margin:0 auto 10px}
.rm-pack figcaption{font-size:16px;color:var(--bone-body)}
.rm-pill{display:flex;width:max-content;margin:0 auto 8px;gap:6px;align-items:center;font-weight:700;font-size:14px;padding:5px 12px;border-radius:99px;text-transform:uppercase;letter-spacing:.06em}
.rm-pill-bad{background:#f6ded8;color:#9b3a2a}
.rm-pill-good{background:var(--bone-ink);color:var(--brass-2)}

.rm-battery-grid{display:grid;grid-template-columns:260px 1fr;gap:56px;align-items:center}
.rm-battery-side{display:flex;flex-direction:column;align-items:center}
.rm-battery{position:relative;width:120px;height:210px;border:6px solid var(--ink);border-radius:18px;padding:8px;display:flex;align-items:flex-end}
.rm-battery-cap{position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:44px;height:12px;background:var(--ink);border-radius:5px 5px 0 0}
.rm-battery-fill{display:block;width:100%;height:9%;background:var(--hot);border-radius:6px;animation:rm-blink 1.4s ease-in-out infinite}
.rm-battery-n{font-family:var(--rm-display),sans-serif;font-size:56px;font-weight:700;color:var(--hot);margin:12px 0 0;line-height:1}
.rm-costs{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rm-cost{display:flex;gap:12px;align-items:flex-start;background:var(--surf);border:1px solid var(--line);border-radius:14px;padding:16px}
.rm-cost strong{color:var(--ink);font-family:var(--rm-display),sans-serif;text-transform:uppercase;letter-spacing:.06em}
.rm-cost p{margin:2px 0 0;font-size:15.5px}
.rm-cost-ic{flex:0 0 38px;height:38px;border-radius:10px;background:rgba(201,85,63,.14);color:#e38670;display:inline-flex;align-items:center;justify-content:center}

.rm-guide{display:grid;grid-template-columns:300px 1fr;gap:52px;align-items:center}
.rm-guide-photo{aspect-ratio:4/5;border-radius:18px;background:linear-gradient(160deg,#1b2029,#0d0f12);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 30px 60px rgba(21,23,27,.25)}
.rm-guide-photo img{width:100%;height:100%;object-fit:cover;object-position:50% 30%}
.rm-coach{display:flex;gap:12px;align-items:center;margin:0;font-size:14px;color:var(--muted);line-height:1.4}
.rm-coach strong{color:var(--ink);font-weight:600}
.rm-avatar{width:44px;height:44px;border-radius:50%;border:2px solid var(--brass);flex:0 0 44px;object-fit:cover}
.rm-chips{display:flex;flex-wrap:wrap;gap:10px}
.rm-chips span{display:inline-flex;gap:8px;align-items:center;background:#fff;border:1px solid rgba(21,23,27,.1);border-radius:99px;padding:9px 16px;color:var(--bone-ink);font-weight:600;font-size:15px}
.rm-chips svg{color:var(--brass-ink)}

.rm-house{max-width:760px;margin:0 auto}
.rm-roof{height:130px;clip-path:polygon(50% 0,100% 100%,0 100%);background:linear-gradient(180deg,var(--brass-2),var(--brass));display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:16px;color:#14110b;gap:4px}
.rm-roof span{font-family:var(--rm-display),sans-serif;font-weight:700;letter-spacing:.24em;font-size:18px}
.rm-pillars{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:0 6%}
.rm-pillar{height:170px;background:linear-gradient(90deg,#20252e,#2b313b 50%,#20252e);border-left:1px solid var(--line);border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--brass)}
.rm-pillar span{color:var(--ink);font-family:var(--rm-display),sans-serif;text-transform:uppercase;letter-spacing:.08em;font-size:15px}
.rm-base{background:var(--ink);color:var(--bone-ink);text-align:center;font-family:var(--rm-display),sans-serif;font-weight:700;letter-spacing:.4em;font-size:22px;padding:14px;border-radius:0 0 12px 12px}
.rm-pillar-text{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:30px}
.rm-pillar-text strong{color:var(--brass);font-family:var(--rm-display),sans-serif;text-transform:uppercase;letter-spacing:.08em}
.rm-pillar-text p{margin:4px 0 0;font-size:15.5px}

.rm-plan{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;position:relative}
.rm-plan li{background:#fff;border:1px solid rgba(21,23,27,.08);border-radius:16px;padding:26px 22px;position:relative}
.rm-plan p{margin:0}
.rm-plan-n{position:absolute;top:18px;right:20px;font-family:var(--rm-display),sans-serif;font-size:44px;font-weight:700;color:rgba(21,23,27,.1);line-height:1}
.rm-plan-ic{display:inline-flex;width:52px;height:52px;border-radius:14px;background:var(--bone-ink);color:var(--brass-2);align-items:center;justify-content:center;margin-bottom:14px}

.rm-compare{background:var(--surf);border:1px solid var(--line);border-radius:18px;overflow:hidden;max-width:860px;margin:0 auto}
.rm-cmp-row{display:grid;grid-template-columns:1fr 140px 140px;align-items:center;border-top:1px solid var(--line);background:linear-gradient(90deg,transparent calc(100% - 140px),rgba(212,162,76,.08) 0)}
.rm-cmp-note{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center;margin:28px 0 24px;font-size:17px}
.rm-cmp-row > span{padding:14px 18px;color:var(--ink);font-size:16px}
.rm-cmp-row > span:not(:first-child){display:flex;justify-content:center}
.rm-cmp-head{border-top:0}
.rm-cmp-head > span{flex-direction:column;align-items:center;gap:4px;color:var(--brass);padding:20px 10px}
.rm-cmp-head strong{color:var(--ink);font-family:var(--rm-display),sans-serif;text-transform:uppercase;letter-spacing:.06em;font-size:17px}
.rm-cmp-head small{color:var(--muted);font-size:13px}
.rm-yes{color:var(--brass)!important}
.rm-no{color:rgba(243,238,228,.25)!important}

.rm-futures{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.rm-future{border-radius:18px;padding:28px 26px}
.rm-future-h{display:flex;gap:10px;align-items:center;font-family:var(--rm-display),sans-serif;text-transform:uppercase;letter-spacing:.06em;font-size:18px;margin:0 0 16px}
.rm-future ul{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.rm-future li{display:flex;gap:10px;align-items:center;font-size:17px}
.rm-future-no{background:#e6e1d7;color:var(--bone-body)}
.rm-future-no .rm-future-h{color:var(--bone-ink)}
.rm-future-no svg{color:#b0412c}
.rm-future-yes{background:var(--bone-ink);color:#e3ded4}
.rm-future-yes .rm-future-h,.rm-future-yes svg{color:var(--brass-2)}

.rm-faq{border-top:1px solid var(--line)}
.rm-faq-item{border-bottom:1px solid var(--line)}
.rm-faq-item button{width:100%;display:flex;justify-content:space-between;gap:16px;align-items:center;background:none;border:0;color:var(--ink);font-family:var(--rm-display),sans-serif;font-size:clamp(18px,1.8vw,21px);text-align:left;padding:20px 0;cursor:pointer;min-height:44px}
.rm-faq-item button span{color:var(--brass);font-size:26px;line-height:1}
.rm-faq-item p{margin:0 0 20px;max-width:680px}

.rm-apply{background:radial-gradient(60% 50% at 15% 0%,rgba(212,162,76,.12),rgba(13,15,18,0) 70%),#0d0f12}
.rm-apply-in{display:grid;grid-template-columns:.85fr 1.15fr;gap:52px;align-items:start}
.rm-apply-copy{position:sticky;top:96px}
.rm-apply-points{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.rm-apply-points li{display:flex;gap:12px;align-items:center;color:var(--ink);font-size:17px}
.rm-apply-points svg{color:var(--brass)}
.rm-form{background:var(--surf);border:1px solid rgba(212,162,76,.28);border-radius:20px;padding:28px 24px;display:grid;gap:22px;box-shadow:0 30px 70px rgba(0,0,0,.4);position:relative}
.rm-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rm-field{display:grid;gap:8px;min-width:0}
.rm-fieldset{border:0;padding:0;margin:0;min-width:0}
.rm-label{font-size:15px;font-weight:600;color:var(--ink);line-height:1.4;padding:0;margin-bottom:8px}
.rm-field > .rm-label{margin-bottom:0}
.rm-input{width:100%;background:#0f1216;border:1px solid rgba(243,238,228,.16);border-radius:10px;padding:14px;color:var(--ink);caret-color:var(--brass);font-size:16px;font-family:inherit;outline:none;resize:vertical}
.rm-input::placeholder{color:#8e8a83}
.rm-input:focus{border-color:var(--brass);box-shadow:0 0 0 3px rgba(212,162,76,.18)}
.rm-choices{display:grid;gap:8px}
.rm-choices-row{grid-template-columns:repeat(4,1fr)}
.rm-choice{position:relative;display:flex;gap:12px;align-items:flex-start;background:#0f1216;border:1px solid rgba(243,238,228,.12);border-radius:10px;padding:13px 14px;cursor:pointer;color:#d9d4ca;font-size:15.5px;line-height:1.45;min-height:48px;transition:border-color .15s ease,background .15s ease}
.rm-choices-row .rm-choice{align-items:center;padding:12px 10px;font-size:15px}
.rm-choice:hover{border-color:rgba(212,162,76,.5)}
.rm-choice.is-on{border-color:var(--brass);background:rgba(212,162,76,.1);color:var(--ink)}
.rm-choice input{position:absolute;opacity:0;width:1px;height:1px}
.rm-choice:focus-within{box-shadow:0 0 0 3px rgba(212,162,76,.25)}
.rm-dot{flex:0 0 18px;height:18px;border-radius:50%;border:2px solid rgba(243,238,228,.35);margin-top:2px}
.rm-choices-row .rm-dot{margin-top:0}
.rm-choice.is-on .rm-dot{border-color:var(--brass);background:radial-gradient(circle,var(--brass) 45%,transparent 50%)}
.rm-hint{display:block;color:var(--brass);font-size:13px;font-weight:600;margin-top:3px}
.rm-err{margin:0;padding:12px 14px;border-radius:10px;background:rgba(217,130,111,.12);border:1px solid rgba(217,130,111,.4);color:#f0b5a8;font-size:15px}
.rm-result{background:linear-gradient(160deg,#1f1a10,#14171c 60%);border:1px solid rgba(212,162,76,.55);border-radius:20px;padding:32px 28px;color:#d9d4ca}
.rm-result p{margin:0 0 14px}
.rm-result strong{color:var(--ink)}
.rm-result-icon{display:inline-flex;width:60px;height:60px;border-radius:16px;background:var(--brass);color:#14110b;align-items:center;justify-content:center;margin-bottom:16px}
.rm-result-step{padding-top:14px;border-top:1px solid var(--line)}
.rm-foot{border-top:1px solid var(--line);padding:34px 0 46px}
.rm-foot-in{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;flex-wrap:wrap}
.rm-foot p{margin:0;font-size:13.5px;color:var(--muted);max-width:620px}

@media (max-width:960px){
  .rm-hero-grid,.rm-guide,.rm-apply-in,.rm-battery-grid{grid-template-columns:1fr;gap:36px}
  .rm-tiles,.rm-wants{grid-template-columns:1fr 1fr}
  .rm-worlds{grid-template-columns:1fr}
  .rm-world-you{max-width:none;flex-direction:row;text-align:left;justify-content:flex-start}
  .rm-plan,.rm-pillar-text{grid-template-columns:1fr 1fr}
  .rm-guide-photo{max-width:260px}
  .rm-apply-copy{position:static}
}
@media (max-width:720px){
  .rm{font-size:16px}
  .rm-mark{font-size:14px;letter-spacing:.14em;gap:8px}
  .rm-mark-bar{width:14px}
  .rm-top-right{gap:8px}
  .rm-lang > *{padding:8px 9px}
  .rm-top-cta{padding:9px 14px}
  .rm-band{padding:60px 0}
  .rm-hero{padding:44px 0 60px}
  .rm-tiles,.rm-wants,.rm-costs,.rm-plan,.rm-futures,.rm-row2{grid-template-columns:1fr}
  .rm-packs{grid-template-columns:1fr 1fr;gap:10px}
  .rm-pack{padding:14px 8px}
  .rm-pack figcaption{font-size:14px}
  .rm-pill{font-size:12px;padding:4px 9px}
  .rm-hero-cta,.rm-hero-cta .rm-btn{width:100%}
  .rm-load-row{grid-template-columns:22px 96px 1fr;font-size:14px}
  .rm-battery-side{flex-direction:row;gap:22px;justify-content:center}
  .rm-battery{width:80px;height:140px;border-width:5px}
  .rm-battery-n{margin:0;font-size:46px}
  .rm-pillars{gap:6px;padding:0 3%}
  .rm-pillar{height:130px;gap:6px}
  .rm-pillar span{font-size:11.5px;letter-spacing:.04em}
  .rm-roof{height:100px}
  .rm-pillar-text{grid-template-columns:1fr;gap:12px}
  .rm-cmp-row{grid-template-columns:1fr 82px 72px;background:linear-gradient(90deg,transparent calc(100% - 72px),rgba(212,162,76,.08) 0)}
  .rm-cmp-row > span{padding:12px 8px;font-size:14.5px}
  .rm-cmp-head > span{padding:16px 4px}
  .rm-cmp-head strong{font-size:12px;letter-spacing:.02em}
  .rm-cmp-head small{display:none}
  .rm-choices-row{grid-template-columns:1fr 1fr}
  .rm-form,.rm-result{padding:22px 16px}
  .rm-p{font-size:16.5px}
}
@media (max-width:380px){
  .rm-mark{font-size:13px;letter-spacing:.1em}
  .rm-mark-bar{display:none}
  .rm-top-cta{padding:9px 11px;font-size:13px}
}
@media (prefers-reduced-motion:reduce){.rm *{transition:none!important;animation:none!important}}
`
