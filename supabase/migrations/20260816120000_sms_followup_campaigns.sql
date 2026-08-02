-- supabase/migrations/20260816120000_sms_followup_campaigns.sql
--
-- SMS follow-up campaigns (Android merchant app).
--
-- The merchant app sends follow-up SMS from the merchant's OWN handset via
-- android.telephony.SmsManager. The phone is the transport; this schema is the
-- shared brain, so that:
--   * a campaign survives a reinstall and is visible from the web admin,
--   * two devices signed into the same store cannot double-send a run, and
--   * every message sent from a merchant's SIM has an auditable record, which
--     is what the PH Data Privacy Act requires of them and what a telco will
--     ask for if the SIM is ever flagged for bulk messaging.
--
-- Four tables plus two columns on `customers`:
--   sms_campaigns      — the definition: audience, message, schedule
--   sms_campaign_runs  — one due occurrence of a campaign; the DEVICE CLAIM unit
--   sms_sends          — one row per recipient per run; the idempotency unit
--   sms_suppressions   — do-not-text numbers, independent of `customers`
--
-- Safety / reversibility: purely additive. Four new tables, two new nullable-
-- defaulted columns on `customers`. No existing column changes type and no row
-- data is modified, so this is safe to apply online. Manual rollback at bottom.
--
-- Access model: campaign tables carry PII (phone numbers + message bodies) and
-- are NEVER world-readable. RLS grants access only to the owning tenant's
-- admins, plus superadmin globally — the same shape as `customers`. Note the
-- policies compare `au.tenant_id` to the ROW's tenant_id (table-qualified);
-- the `au.tenant_id = au.tenant_id` self-comparison bug fixed in
-- 20260815130000 is exactly what that qualification prevents.

-- 1. Suppression list ------------------------------------------------------------
-- Keyed by phone rather than customer_id on purpose: a merchant must be able to
-- block a number that has not ordered (yet), and a suppression must survive the
-- customer row being deleted. This is the one table the send path treats as
-- absolute — nothing overrides it.
create table if not exists public.sms_suppressions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text not null,
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists sms_suppressions_tenant_phone_uq
  on public.sms_suppressions(tenant_id, phone_e164);

-- 2. Campaigns -------------------------------------------------------------------
create table if not exists public.sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  -- Body with {{firstName}}-style placeholders; rendered per recipient by
  -- webnegosyo-app/lib/sms/message-template.ts.
  message_template text not null,
  -- Audience filter, read by lib/sms/audience.ts. Shape:
  --   { lastOrderOlderThanDays?, lastOrderWithinDays?, minOrderCount?,
  --     minTotalSpent?, channels?: string[] }
  audience jsonb not null default '{}'::jsonb,
  schedule_kind text not null default 'one_off',
  -- Local wall-clock time (Asia/Manila) the campaign becomes due, "HH:MM".
  schedule_time text not null default '10:00',
  -- every_n_days: the interval. Null for the other kinds.
  schedule_interval_days integer,
  -- weekly: ISO weekdays (1=Mon .. 7=Sun). Empty for the other kinds.
  schedule_weekdays smallint[] not null default '{}',
  -- one_off: the single date it fires, "YYYY-MM-DD". Null for the other kinds.
  schedule_date text,
  -- Sends outside this local window are held to the next day. Defaults are
  -- deliberately conservative: a 2am marketing text is how a SIM gets reported.
  quiet_hours_start text not null default '21:00',
  quiet_hours_end text not null default '08:00',
  -- Android silently rate-limits outgoing SMS (~30 per 30 min per app) before
  -- it starts prompting the user per message, which would stall a run behind a
  -- dialog. Runs are chunked to stay under it.
  max_per_run integer not null default 25,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_campaigns_schedule_kind_ck
    check (schedule_kind in ('one_off', 'every_n_days', 'weekly')),
  constraint sms_campaigns_status_ck
    check (status in ('draft', 'active', 'paused', 'archived')),
  constraint sms_campaigns_interval_ck
    check (schedule_interval_days is null or schedule_interval_days > 0),
  constraint sms_campaigns_max_per_run_ck
    check (max_per_run > 0 and max_per_run <= 200),
  constraint sms_campaigns_message_ck
    check (length(trim(message_template)) > 0),
  -- Each schedule kind must carry the field it is steered by, or the due-date
  -- computation has nothing to work from and the campaign silently never fires.
  constraint sms_campaigns_schedule_fields_ck check (
    (schedule_kind = 'one_off' and schedule_date is not null)
    or (schedule_kind = 'every_n_days' and schedule_interval_days is not null)
    or (schedule_kind = 'weekly' and array_length(schedule_weekdays, 1) > 0)
  )
);

create index if not exists sms_campaigns_tenant_status_idx
  on public.sms_campaigns(tenant_id, status);

-- 3. Runs ------------------------------------------------------------------------
-- One row per occurrence. `claimed_by_device` is what stops the merchant's
-- phone and the branch tablet from both sending the same campaign: a device
-- claims the run (conditional update on claimed_by_device is null) before it
-- sends the first message, and a claim older than the stale window can be
-- taken over so a phone that died mid-run does not freeze the campaign.
create table if not exists public.sms_campaign_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.sms_campaigns(id) on delete cascade,
  due_at timestamptz not null,
  claimed_by_device text,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint sms_campaign_runs_status_ck
    check (status in ('pending', 'running', 'completed', 'cancelled'))
);

-- One run per campaign per due moment: the app computes due_at deterministically
-- and inserts on conflict do nothing, so a second device computing the same
-- occurrence reuses the row instead of creating a duplicate campaign send.
create unique index if not exists sms_campaign_runs_campaign_due_uq
  on public.sms_campaign_runs(campaign_id, due_at);

create index if not exists sms_campaign_runs_tenant_due_idx
  on public.sms_campaign_runs(tenant_id, due_at desc);

-- 4. Sends -----------------------------------------------------------------------
-- The unique (run_id, customer_id) index is the whole idempotency story: a run
-- resumed after the app was killed re-reads this table, skips what is already
-- here, and cannot text the same guest twice.
create table if not exists public.sms_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null references public.sms_campaign_runs(id) on delete cascade,
  -- Orders outlive customer rows, and so must the send record; the phone and
  -- body below stand on their own as the audit trail.
  customer_id uuid references public.customers(id) on delete set null,
  phone_e164 text not null,
  message_body text not null,
  result text not null,
  error_code text,
  error_message text,
  sent_at timestamptz not null default now(),
  constraint sms_sends_result_ck check (result in ('sent', 'failed', 'skipped'))
);

create unique index if not exists sms_sends_run_customer_uq
  on public.sms_sends(run_id, customer_id)
  where customer_id is not null;

create index if not exists sms_sends_tenant_sent_at_idx
  on public.sms_sends(tenant_id, sent_at desc);

-- Powers the "don't text the same person twice in N days" guard across
-- campaigns, which is the difference between follow-up and harassment.
create index if not exists sms_sends_tenant_phone_sent_at_idx
  on public.sms_sends(tenant_id, phone_e164, sent_at desc);

-- 5. customers opt-out -----------------------------------------------------------
-- `customers.sms_consent` already exists (20260706120000) and is the opt-IN.
-- Opt-out is stored separately rather than by flipping consent to false so that
-- a later order re-deriving the profile cannot silently resurrect a guest who
-- asked to be left alone.
alter table public.customers
  add column if not exists sms_opt_out boolean not null default false;
alter table public.customers
  add column if not exists sms_opt_out_at timestamptz;

create index if not exists customers_tenant_smsable_idx
  on public.customers(tenant_id, last_order_at desc)
  where sms_consent = true and sms_opt_out = false and phone_e164 is not null;

-- 6. updated_at trigger (reuses the shared set_updated_at() from 0001) -----------
drop trigger if exists sms_campaigns_set_updated_at on public.sms_campaigns;
create trigger sms_campaigns_set_updated_at
  before update on public.sms_campaigns
  for each row
  execute function set_updated_at();

-- 7. Row Level Security ----------------------------------------------------------
alter table public.sms_campaigns enable row level security;
alter table public.sms_campaign_runs enable row level security;
alter table public.sms_sends enable row level security;
alter table public.sms_suppressions enable row level security;

create policy sms_campaigns_rw on public.sms_campaigns
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = sms_campaigns.tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = sms_campaigns.tenant_id))));

create policy sms_campaign_runs_rw on public.sms_campaign_runs
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = sms_campaign_runs.tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = sms_campaign_runs.tenant_id))));

create policy sms_sends_rw on public.sms_sends
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = sms_sends.tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = sms_sends.tenant_id))));

create policy sms_suppressions_rw on public.sms_suppressions
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = sms_suppressions.tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = sms_suppressions.tenant_id))));

-- 8. Documentation ---------------------------------------------------------------
comment on table public.sms_campaigns is
  'SMS follow-up campaign definitions. Sent from the merchant''s own Android handset; this is the shared definition, not the transport.';
comment on table public.sms_campaign_runs is
  'One due occurrence of a campaign. claimed_by_device is the lock that stops two signed-in devices double-sending the same run.';
comment on table public.sms_sends is
  'One row per recipient per run. UNIQUE(run_id, customer_id) makes a resumed run idempotent.';
comment on table public.sms_suppressions is
  'Do-not-text numbers, keyed by phone so a suppression outlives the customer row. Absolute: nothing overrides it.';
comment on column public.customers.sms_opt_out is
  'Guest asked not to be texted. Separate from sms_consent so a later order re-deriving the profile cannot resurrect them.';

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   drop table if exists public.sms_sends cascade;
--   drop table if exists public.sms_campaign_runs cascade;
--   drop table if exists public.sms_campaigns cascade;
--   drop table if exists public.sms_suppressions cascade;
--   drop index if exists public.customers_tenant_smsable_idx;
--   alter table public.customers drop column if exists sms_opt_out_at;
--   alter table public.customers drop column if exists sms_opt_out;
-- ------------------------------------------------------------------------------
