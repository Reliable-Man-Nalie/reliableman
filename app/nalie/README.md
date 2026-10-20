# Reliable Man · landing page

Two pages, one design:

- `/nalie` English (the main page), in `app/nalie/`
- `/nalie-de` German, in `app/nalie-de/` (a thin page that reuses `app/nalie/`)

Both folders import nothing else except React and Next.js, so they can be
copied into any Next.js (App Router) project as they are. Each page has an
EN / DE switch in the top bar linking to the other.

## Files

| File | What it is |
| --- | --- |
| `content.ts` | **Every word on both pages**, English and German side by side. |
| `config.ts` | WhatsApp number, webhook, and the rule that decides who fits which programme. |
| `page.tsx` | The English page: title, description, fonts (Oswald + Inter via `next/font`). `app/nalie-de/page.tsx` is the German one. |
| `NalieClient.tsx` | The page layout, icons and styling, used by both languages (one CSS block at the bottom). |
| `ApplyForm.tsx` | The application form and the result screen. |
| `icons.tsx` | The icons, as plain SVG data (no icon package needed). |
| `opengraph-image.tsx` | The share picture for WhatsApp, Facebook and Instagram. |
| `nalie.jpg`, `nalie-avatar.jpg` | His photo: the guide section and the small round one in the hero. |
| `layout.tsx` | Keeps the page out of Google (ad landing page). Delete it to index the page. |

## Before running ads

1. `SUBMIT_URL` in `config.ts` is already `/api/lead`, the dashboard in this
   project. Applications are saved once the dashboard's database (Supabase) is
   set up; see the README at the project root. Optionally set
   **`NALIE_WHATSAPP`** (digits only, e.g. `4915112345678`) so the result screen
   also offers a WhatsApp button with all his answers typed out to Nalie.
2. Nalie's photo is `nalie.jpg` (4:5) and `nalie-avatar.jpg` (square) in this folder. Replace the files to change it.
3. Add his own Meta pixel and cookie banner in his project; this folder has none.

## Send applications to the Business OS dashboard

Already connected: this page lives inside the dashboard project, so
`SUBMIT_URL` is simply `/api/lead`. Every application lands as a lead in
`/os/deals`, tagged `Reliable Man` plus its fit (Private / Brotherhood / Later),
with all answers in the notes. If the page ever moves to another project, set
`SUBMIT_URL` to `https://<dashboard-domain>/api/lead` and add this page's domain
to the dashboard's `LEAD_ALLOWED_ORIGINS`.

## How the form decides

`qualify()` in `config.ts`:

- **Private (1:1, 3 months, €3,000 to €5,000):** ready to invest that, starting
  now or within 30 days, and committed.
- **Brotherhood (group, ~€300 to €500/month):** ready to invest but missing one
  of the above.
- **Later:** cannot invest yet. He still gets a respectful answer, never a "no".

What the webhook receives (JSON): `source, fit, fitLabel, name, phone, email,
age, situation, struggle, goal, start, invest, commit, summary, page, submittedAt`,
plus `whatsapp, message, pageUrl, tags, hp, elapsedMs` for the dashboard.

## Moving it

Copy both folders to `app/` in a Next.js 14+ project. No other
dependencies, no database, no API routes.
