-- Business OS database. Safe to run any number of times.
-- You never paste this by hand: `npm run build` (and every Vercel deploy) runs
-- scripts/setup-db.mjs, which applies this file when DATABASE_URL is set.

create table if not exists leads (
  id text primary key, name text default '', email text default '', phone text,
  company text, source text default 'manual', status text default 'new', notes text,
  role text, company_size text, product text, website text,
  tags jsonb default '[]'::jsonb, activity jsonb default '[]'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists deals (
  id text primary key, lead_id text, client_name text default '', client_email text default '',
  client_company text, stage text default 'new', value numeric default 0, currency text default 'USD',
  service text, notes text, client_phone text, client_vat text, client_address text,
  client_website text, client_role text, location text, instagram text, priority text,
  next_step text, next_step_date text, current_state text, desired_outcome text, goals text,
  blockers text, budget text, activity jsonb default '[]'::jsonb, tags jsonb default '[]'::jsonb,
  revenue_type text, retainer_months integer, close_date text, organization text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists proposals (
  id text primary key, token text, ref text, deal_id text, deleted_at timestamptz,
  client_name text default '', client_email text default '', client_company text,
  client_phone text, client_address text, client_vat text, one_time boolean,
  title text default '', intro text, services jsonb default '[]'::jsonb,
  deliverables jsonb default '[]'::jsonb, payment_schedule jsonb default '[]'::jsonb,
  total numeric default 0, currency text default 'USD', valid_days integer default 7,
  status text default 'draft', payment_link text, bank_info text, notes text,
  payment_methods jsonb, created_at timestamptz default now(), sent_at timestamptz,
  signed_at timestamptz, signer_name text, signer_signature text, offer_id text,
  linked_invoice_id text, billing_day integer default 1, version integer default 1,
  parent_proposal_id text, viewed_at timestamptz, reminder_sent_at timestamptz
);
create index if not exists proposals_token_idx on proposals (token);

create table if not exists invoices (
  id text primary key, number text, client_name text default '', client_email text default '',
  client_company text, client_address text, client_phone text, client_vat text,
  project_title text, line_items jsonb default '[]'::jsonb, taxes numeric default 0,
  tax_label text, tax_rate numeric, amount_paid numeric default 0, currency text default 'USD',
  status text default 'draft', notes text, issue_date text, due_date text,
  created_at timestamptz default now(), sent_at timestamptz, paid_at timestamptz,
  reminders jsonb default '[]'::jsonb, deleted_at timestamptz, proposal_id text,
  phase_index integer, recurring boolean default false, recurring_day integer,
  recurring_parent_id text, recurring_overrides jsonb, payment_reminder_at timestamptz,
  viewed_at timestamptz, payment_methods jsonb
);

create table if not exists clients (
  id text primary key, deal_id text, name text default '', email text default '', phone text,
  company text, program text, status text default 'active', delivery_stage text,
  started_at text, coach_note text, monthly_amount numeric, currency text, photo_url text,
  plan_name text, website text, instagram text, role text, location text,
  enrolled_program_ids jsonb, token text, created_at timestamptz default now()
);

create table if not exists offers (
  id text primary key, category text, pyramid_tier text, name text default '', tagline text,
  price numeric default 0, currency text default 'USD', billing_type text,
  services jsonb default '[]'::jsonb, deliverables jsonb default '[]'::jsonb,
  payment_schedule jsonb default '[]'::jsonb, notes text, active boolean default true,
  created_at timestamptz default now()
);

create table if not exists offer_tiers (
  id text primary key, level integer default 0, name text default '', price text default '',
  price_note text default '', headline text default '', subheadline text default '',
  cta text default '', owner text default '', color text default '#6366f1', href text default '',
  active boolean default true, description text default '', included jsonb default '[]'::jsonb,
  funnels jsonb default '[]'::jsonb, stripe_price_id text default '', stripe_mode text default '',
  program_id text default '', program_ids jsonb default '[]'::jsonb, updated_at timestamptz default now()
);

create table if not exists business_expenses (
  id text primary key, name text default '', category text, amount numeric default 0,
  frequency text, currency text default 'USD', notes text, date text,
  created_at timestamptz default now()
);

create table if not exists finance_time_entries (
  id text primary key, date text default '', hours numeric default 0, rate numeric default 0,
  project text default '', notes text default '', created_at timestamptz default now()
);

create table if not exists tasks (
  id text primary key, title text default '', description text default '', status text,
  priority text, assignee text, due_date text, account_id text, parent_id text,
  project_id text, owner text default 'me', area text, fields jsonb default '{}'::jsonb,
  related_account_id text, sort_order integer, objective_id text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists task_columns (
  id text primary key, name text not null, kind text not null default 'text',
  sort_order integer default 0, created_at timestamptz default now()
);

create table if not exists business_accounts (
  id text primary key, name text default '', client_name text default '', client_email text default '',
  source text not null default 'manual', in_project_feed boolean, monthly_amount numeric,
  monthly_currency text, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists company_goal (
  id text primary key, title text not null, due_date date, created_at timestamptz not null default now()
);

create table if not exists company_objectives (
  id text primary key, title text not null default '', key_result text, area text,
  due_date text, completed_at timestamptz, sort_order integer, created_at timestamptz default now()
);

create table if not exists funnel_events (
  id text primary key, visitor_id text, funnel_id text, step text, path text, referrer text,
  created_at timestamptz default now()
);
create index if not exists funnel_events_funnel_idx on funnel_events (funnel_id);

create table if not exists events (
  id                    text primary key,
  slug                  text unique not null,
  status                text not null default 'draft',   -- draft | published | cancelled | completed
  title                 text not null default '',
  tagline               text default '',
  date                  text default '',                 -- ISO date (YYYY-MM-DD)
  time                  text default '',
  end_time              text default '',
  timezone              text default '',
  format                text default 'in_person',        -- in_person | online | hybrid
  location              text default '',
  location_name         text default '',
  capacity              integer default 0,               -- 0 = unlimited
  price                 numeric default 0,
  currency              text default 'USD',
  cover_image           text default '',
  thumbnail_image       text default '',
  tags                  jsonb default '[]'::jsonb,
  speakers              jsonb default '[]'::jsonb,
  agenda                jsonb default '[]'::jsonb,
  faq                   jsonb default '[]'::jsonb,
  waitlist_enabled      boolean default false,
  requires_approval     boolean default false,
  email_confirmation    text default '',
  email_reminder        text default '',
  email_follow_up       text default '',
  reminder_hours_before integer default 24,
  seo_title             text default '',
  seo_description       text default '',
  data                  text default '',                 -- full event JSON for the public page
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index if not exists events_status_idx on events (status);
create index if not exists events_slug_idx   on events (slug);

create table if not exists event_attendees (
  id             text primary key,
  event_id       text not null,
  event_title    text default '',
  name           text default '',
  email          text default '',
  phone          text default '',
  company        text default '',
  status         text default 'registered',  -- registered | attended | cancelled | no_show | waitlisted
  paid           boolean default false,
  paid_at        timestamptz,
  paid_amount    numeric default 0,
  checked_in     boolean default false,
  checked_in_at  timestamptz,
  ticket_code    text default '',
  source         text default 'website',
  notes          text default '',
  reminder_sent  boolean default false,         -- 1-hour-before reminder dispatched?
  reminder_sent_at timestamptz,
  registered_at  timestamptz default now()
);

create index if not exists event_attendees_event_idx on event_attendees (event_id);
create index if not exists event_attendees_email_idx on event_attendees (event_id, email);
alter table event_attendees add column if not exists reminder_sent_24 boolean default false;
alter table event_attendees add column if not exists reminder_sent_10 boolean default false;
alter table event_attendees add column if not exists reminder_sent_5 boolean default false;
alter table event_attendees add column if not exists reminder_sent_3 boolean default false;
alter table event_attendees add column if not exists followup_sent boolean default false;
alter table event_attendees add column if not exists payment_method text;
alter table event_attendees add column if not exists proof_path text;
alter table event_attendees add column if not exists proof_check jsonb;
alter table event_attendees add column if not exists referral_code text;
alter table event_attendees add column if not exists referred_by text;
alter table event_attendees add column if not exists referral_rewards jsonb default '[]'::jsonb;

-- Every table is deny-all for the public key. The app reads and writes with the
-- server-only SERVICE_ROLE key, so the browser can never read your contacts.
do $$ declare t text; begin
  foreach t in array array['leads','deals','proposals','invoices','clients','offers','offer_tiers',
    'business_expenses','finance_time_entries','tasks','task_columns','business_accounts',
    'company_goal','company_objectives','funnel_events','events','event_attendees'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Tell the API about new columns straight away.
notify pgrst, 'reload schema';
