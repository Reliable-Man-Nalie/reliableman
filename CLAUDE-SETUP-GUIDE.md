# Setup guide for the owner's Claude

You are helping the owner set up this business dashboard and use it to launch a
Group Coaching program in early January. Work through the steps in order. Ask
the owner only for what you cannot look up yourself, one thing at a time.

## What this is

A private dashboard at `/os` for the whole sales side of a coaching business:
leads and pipeline, contacts and companies, events with public registration
pages, offers, proposals the client signs online, invoices and receipts,
payment links, finance, tasks and projects. It starts completely empty.

## Part 1: get it running (about 20 minutes)

1. **Supabase.** Create a project at supabase.com. From Project Settings, API,
   copy the URL, the anon key and the service_role key. From Project Settings,
   Database, copy the connection string (Session pooler URI) for `DATABASE_URL`.
2. **GitHub.** Put this folder in a new private repository on the owner's
   account.
3. **Vercel.** Import the repository. Add every variable from `.env.example`.
   Required: the four Supabase values, `OS_ADMIN_PASSWORD` (16+ characters),
   `AUTH_SECRET` (a long random string). Fill the brand block too:
   business name, owner name, contact email, site URL, currency, time zone.
4. **Deploy.** The build creates all tables by itself. Check the build log for
   "Database is ready". If it says DATABASE_URL is not set, add it and redeploy.
5. **Sign in** at `https://<domain>/os/login` with `OS_ADMIN_PASSWORD`.
6. **Brand images.** Replace `public/logo.png`, `public/icon.png` and
   `public/event-default.png`.
7. **Email (Resend).** Create an account at resend.com, verify a sending domain
   (a subdomain like `mail.<domain>` is safest), set `RESEND_API_KEY`,
   `EMAIL_FROM` and `OWNER_EMAIL`. Without it nothing is emailed; the rest works.
8. **Optional:** `STRIPE_SECRET_KEY` for card payment links, `PDFSHIFT_API_KEY`
   for PDF copies, the Meta pixel ids.
9. **Bank details** in the `NEXT_PUBLIC_BANK_*` variables, so invoices show
   where to transfer.

Test: create a test contact, a test invoice to the owner's own email, send it,
open the link, then delete both.

## Part 2: connect the landing page

**Done for Reliable Man (option B):** the landing page is `app/nalie/` and
`app/nalie-de/` in this project and its form posts to `/api/lead`. Only test it
once with a real submission after the database is set up.

The owner already has a landing page. Two options.

**A. Keep the landing page where it is (simplest).** Set
`LEAD_ALLOWED_ORIGINS` to the landing page's domain (comma separated if more
than one, e.g. `https://www.domain.com,https://domain.com`) and redeploy. Then
make the landing page's form post here:

```js
await fetch('https://<dashboard-domain>/api/lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name, email,
    whatsapp: phone,            // optional
    business: '',               // optional
    message: answers,           // optional free text, lands in notes
    source: 'landing-page',     // shows where the lead came from
    tags: ['Group Coaching'],   // up to 8 tags, used for filters
    pageUrl: location.href,
    hp: '',                     // honeypot: leave empty
    elapsedMs: Date.now() - pageLoadedAt, // time on the form; under 1.2s is treated as a bot
  }),
})
```

Each submission becomes a lead in `/os/deals` and `/os/contacts`, and the owner
gets an email (when Resend is set). Test it once with a real submission.

**B. Merge into the same Next.js project.** Only if the landing page is also
Next.js. Copy the landing page into `app/` and post to `/api/lead` with a
relative URL. Keep `/os` and `/api` as they are.

## Part 3: launch the January Group Coaching program

Goal: **8 Premium seats**, or if not, **16 seats filled** in total. Write this
goal in `/os` on the dashboard goal bar so it is in front of the owner every day.

### Set up the offers (`/os/offers`)
Create two offers. The owner sets the prices; do not invent them.
- **Group Coaching** (the standard seat).
- **Group Coaching Premium** (the same group plus the extra one-to-one layer).
Write exactly what each includes and what is NOT included. Clear limits stop
scope creep later.

### The flow
1. **Free live event** in `/os/events`: create it, set the date, time zone,
   capacity and a Zoom or Meet link, publish it. Its public page is
   `/events/<slug>`. Registrants become contacts. Confirmation and reminder
   emails go out on their own once Resend is set.
2. **At the end of the event**, invite people to apply (the landing page form,
   tagged `Group Coaching`).
3. **Application call.** Move each applicant through the pipeline in
   `/os/deals`. Log every call with a note.
4. **Proposal** in `/os/proposals`: pick the offer, send it. The client reads
   and signs online. On signing, the first invoice is created and emailed
   automatically.
5. **Payment.** Bank transfer from the invoice, or a Stripe payment link from
   `/os/payments`. When the money arrives, open the invoice and press
   **Record a payment**; the client gets a receipt.
6. **Onboarding** as a task list in `/os/tasks`.

### Weekly rhythm until January
- Count: seats sold (Premium / standard) against 8 Premium or 16 total.
- Pipeline: anyone quiet for 3+ days gets a personal follow-up.
- One event or live session a week until the seats are full.
- Use tags (`Premium interest`, `Applied`, `Paid`) to filter fast.

### Rules for you (the AI)
- Never send anything to a client without the owner's OK on that message.
- No income promises in any copy.
- Keep messages to clients short and personal.
