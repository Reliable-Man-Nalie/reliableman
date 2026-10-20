# Reliable Man

Nalie's website and business dashboard, in one Next.js 16 project
(React 19, TypeScript, Supabase).

| What | Path | Files |
|---|---|---|
| Landing page, English | `/nalie` (the domain root `/` opens it) | `app/nalie/` |
| Landing page, German | `/nalie-de` | `app/nalie-de/` |
| Dashboard (private, password) | `/os`, sign in at `/os/login` | `app/os/` |
| Public event pages | `/events/<slug>` | `app/events/` |
| Client links: proposals, invoices, receipts | `/proposal/…`, `/invoice/…`, `/receipt/…` | `app/proposal/`, `app/invoice/`, `app/receipt/` |

Every application from the landing page goes to `/api/lead` and lands in the
dashboard under Leads (`/os/deals`), tagged `Reliable Man` plus its fit
(Private / Brotherhood / Later), with all answers in the notes.

## Landing page

Works with no setup at all. Every word is in `app/nalie/content.ts`; the
settings (WhatsApp number, where applications go, who fits which programme)
are in `app/nalie/config.ts`. Details in `app/nalie/README.md`.

Applications are only **saved** once the dashboard's database is connected
(step 1 below). Until then the form still works for the visitor, but nothing
is stored.

## Dashboard setup (about 20 minutes)

1. **Supabase** (database): create a project at supabase.com. Copy the Project
   URL, the anon key, the service_role key, and the connection string
   (Connect, then Session pooler URI).
2. **Environment variables**: in Vercel, Project → Settings → Environment
   Variables, add every name from `.env.example`. Required: the four Supabase
   values, `OS_ADMIN_PASSWORD` (16+ characters) and `AUTH_SECRET`
   (`openssl rand -hex 32`). Fill the brand block too (business name and owner
   are pre-filled; add contact email and `NEXT_PUBLIC_SITE_URL`, your domain).
3. **Redeploy** (Deployments → ⋯ → Redeploy). The build creates every database
   table by itself (`scripts/setup-db.mjs` reads `db/schema.sql`); look for
   "Database is ready" in the build log. There is no SQL to paste. Running it
   again changes nothing that is already there.
4. Open `https://<your-domain>/os/login` and sign in with `OS_ADMIN_PASSWORD`.
5. Test: send one real application from `/nalie` and check it shows up in Leads.

Optional, when you want them:
- **Resend** (emails: lead alerts, confirmations, invoices, proposals). Verify a
  sending domain, set `RESEND_API_KEY`, `EMAIL_FROM` and `OWNER_EMAIL`.
- **Stripe** (card payment links). Set `STRIPE_SECRET_KEY`. There is no webhook:
  when a card payment arrives, open the invoice and press Record a payment.
- **PDFShift** (PDF copies of invoices and proposals). Set `PDFSHIFT_API_KEY`.
- **Meta pixel**. Set `NEXT_PUBLIC_META_PIXEL_IDS` and `META_CAPI_TOKEN`.
- **Bank details** in the `NEXT_PUBLIC_BANK_*` variables, so invoices show
  where to transfer.

Brand images: replace `public/logo.png`, `public/icon.png` and
`public/event-default.png`.

The full setup and launch plan (offers, events, proposals, weekly rhythm) is in
`CLAUDE-SETUP-GUIDE.md`.

## What is inside the dashboard

| Area | Where | What it does |
|---|---|---|
| Dashboard | `/os` | Leads, pipeline value, what needs you today |
| Leads + Contacts | `/os/deals`, `/os/contacts` | Pipeline board, every person in one list, tags, notes, call log |
| Companies | `/os/companies` | Contacts grouped by their company |
| Offers | `/os/offers` | Your offer ladder and service catalog |
| Events | `/os/events`, public `/events/<slug>` | Event pages with registration, attendees, check-in, emails |
| Proposals | `/os/proposals` | Proposals the client signs online by typing their name |
| Invoices | `/os/invoices` | Invoices, receipts, payment reminders |
| Payments + links | `/os/payments`, `/os/transactions` | Stripe payment links and every payment in one feed |
| Finance | `/os/finance` | Income, costs, profit per month |
| Tasks + Projects | `/os/tasks`, `/os/projects` | Your own board, and a board per client |
| Forms | `/os/forms` | Where each form on your site sends its leads |

## Safety

- Every table is locked for the public. The app talks to the database with the
  server-only service_role key, so nobody can read your contacts from a browser.
- Nothing goes to a client until you press Send. One exception: when a client
  signs a proposal, the first invoice is created and emailed to them
  automatically.
- Deleted invoices and proposals stay in a 30-day trash.
- The landing page, dashboard and client links are all kept out of Google.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000 (landing), http://localhost:3000/os (dashboard)
```

Locally, without `OS_ADMIN_PASSWORD`, `/os` opens without a password.
