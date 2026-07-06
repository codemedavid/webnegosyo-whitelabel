-- supabase/migrations/20260706120000_customer_identity.sql
--
-- Customer Identity + Data Collection Layer (Supabase side).
--
-- Creates a per-tenant `customers` table so each restaurant can recognize the
-- same person across orders. Identity key = normalized E.164 phone (see
-- src/lib/phone.ts); email is the fallback identity when no phone exists. No
-- accounts, no passwords — this is a derived profile, not an auth principal.
--
-- Also adds a nullable `orders.customer_id` link so the owner's customer-detail
-- view can join a customer's order history by FK instead of re-matching phones.
--
-- Safety / reversibility: purely additive — one new table plus one new nullable
-- column. No existing column changes type and no row data is modified, so this
-- is safe to apply online. A documented rollback block is at the bottom.
--
-- Access model: `customers` holds PII and is NEVER world-readable (unlike menu
-- items). RLS grants read/write only to the owning tenant's admins (+ superadmin
-- globally). The going-forward upsert (orders-service) and the backfill script
-- both run through the service-role client, which bypasses RLS by design — the
-- anonymous checkout path must not be able to read or enumerate customers.

-- 1. customers table -------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text,                          -- normalized identity key (nullable: email-only fallback)
  email text,
  name text,
  first_order_at timestamptz,
  last_order_at timestamptz,
  order_count integer not null default 0,
  total_spent numeric(12,2) not null default 0,
  -- Derived, always consistent with the two columns above; recomputed by PG.
  average_order_value numeric(12,2)
    generated always as (
      case when order_count > 0 then round(total_spent / order_count, 2) else 0 end
    ) stored,
  channels_used text[] not null default '{}',   -- {dine_in, pickup, delivery}
  top_items jsonb not null default '[]'::jsonb,  -- [{name, quantity}] top N by qty
  sms_consent boolean not null default false,
  sms_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_order_count_ck check (order_count >= 0),
  constraint customers_total_spent_ck check (total_spent >= 0),
  -- Every customer must be reachable by at least one identity handle.
  constraint customers_identity_ck check (phone_e164 is not null or email is not null)
);

-- 2. Unique identity (partial) ---------------------------------------------------
-- Phone is the primary identity: at most one customer per (tenant, phone).
create unique index if not exists customers_tenant_phone_uq
  on public.customers(tenant_id, phone_e164)
  where phone_e164 is not null;

-- Email-only fallback identity: unique per (tenant, email) only when no phone,
-- so a phone-bearing record and an email-only record never collide.
create unique index if not exists customers_tenant_email_uq
  on public.customers(tenant_id, email)
  where phone_e164 is null and email is not null;

-- 3. List indexes (owner "Regulars" sorts) --------------------------------------
create index if not exists customers_tenant_last_order_idx
  on public.customers(tenant_id, last_order_at desc);
create index if not exists customers_tenant_total_spent_idx
  on public.customers(tenant_id, total_spent desc);
create index if not exists customers_tenant_order_count_idx
  on public.customers(tenant_id, order_count desc);

-- 4. updated_at trigger (reuses the shared set_updated_at() from 0001) -----------
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row
  execute function set_updated_at();

-- 5. Row Level Security ----------------------------------------------------------
alter table public.customers enable row level security;

-- Read: tenant admins see only their own customers; superadmin sees all.
-- No public/anon SELECT — PII must never be world-readable.
create policy customers_select_by_tenant on public.customers
  for select using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and (
        au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id)
      )
    )
  );

-- Write: tenant admins within their tenant; superadmin global. The anonymous
-- checkout upsert and the backfill use the service-role client (bypasses RLS),
-- so no anon insert policy is granted here.
create policy customers_write_admin on public.customers
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))));

-- 6. orders.customer_id link (additive, nullable) -------------------------------
-- Deleting a customer must not delete their historic orders (orders are the
-- source of truth the profile is derived from), so ON DELETE SET NULL.
alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists orders_customer_id_idx on public.orders(customer_id);

-- 7. Documentation ---------------------------------------------------------------
comment on table public.customers is
  'Per-tenant customer profiles derived from order history. Identity = normalized E.164 phone (email fallback). No auth/account — derived data only. PII: tenant-scoped RLS.';
comment on column public.customers.phone_e164 is
  'Normalized E.164 identity key (see src/lib/phone.ts). Null only for email-only fallback identities.';
comment on column public.customers.average_order_value is
  'Generated column: round(total_spent / order_count, 2), or 0 when no orders.';
comment on column public.customers.channels_used is
  'Distinct order channels this customer has used: dine_in / pickup / delivery.';
comment on column public.customers.top_items is
  'JSON array of the customer''s most-ordered items: [{ "name": string, "quantity": number }].';
comment on column public.customers.sms_consent is
  'True if the customer opted in to SMS updates on any order. Default off (explicit opt-in only).';
comment on column public.orders.customer_id is
  'Optional link to the derived customers row this order rolled up into (nullable; ON DELETE SET NULL).';

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   drop index if exists public.orders_customer_id_idx;
--   alter table public.orders drop column if exists customer_id;
--   drop table if exists public.customers cascade;
-- ------------------------------------------------------------------------------
