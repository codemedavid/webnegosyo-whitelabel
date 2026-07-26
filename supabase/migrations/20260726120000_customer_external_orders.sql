-- supabase/migrations/20260726120000_customer_external_orders.sql
--
-- Customer capture for orders stored OUTSIDE the platform database.
--
-- Problem: `customers` profiles are derived by recomputing from the orders
-- linked via `public.orders.customer_id`. That only works for tenants whose
-- orders live in this database. Convex-backed and tenant-Supabase-backed
-- tenants write their orders elsewhere, so their customers' phone numbers never
-- reached `customers` at all — the merchant's Regulars list silently froze on
-- the day they switched backends.
--
-- Fix: a thin platform-side ledger of the few facts a profile is derived from
-- (who, how much, when, which channel, which items). It is NOT an order mirror:
-- no statuses, no payment data, no addresses — the merchant's real order queue
-- stays in its own backend and remains the source of truth for fulfilment.
--
-- Idempotency: `(tenant_id, backend, external_order_id)` is unique, so replaying
-- a webhook/checkout upserts the same row and the recomputed profile never
-- double-counts — the same guarantee the platform-Supabase path already has.
--
-- Safety / reversibility: purely additive (one new table). No existing table or
-- column is changed. Rollback block at the bottom.
--
-- Access model: derived from PII, so same rules as `customers` — tenant admins
-- read their own rows, superadmin reads all, and the anonymous checkout capture
-- runs through the service-role client (bypasses RLS). No anon policy.

create table if not exists public.customer_external_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  -- Which foreign backend this order lives in. Part of the identity key so two
  -- backends can never collide on a coincidentally equal order id.
  backend text not null check (backend in ('convex', 'tenant_supabase')),
  external_order_id text not null,
  total numeric(12,2) not null default 0,
  ordered_at timestamptz not null,
  channel text,
  items jsonb not null default '[]'::jsonb,   -- [{name, quantity}]
  sms_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_external_orders_total_ck check (total >= 0)
);

-- Idempotency key: one ledger row per real order, forever.
create unique index if not exists customer_external_orders_identity_uq
  on public.customer_external_orders(tenant_id, backend, external_order_id);

-- The profile recompute reads every row for one customer.
create index if not exists customer_external_orders_customer_idx
  on public.customer_external_orders(customer_id);

-- Tenant-scoped reporting reads (owner dashboards, backfills).
create index if not exists customer_external_orders_tenant_ordered_idx
  on public.customer_external_orders(tenant_id, ordered_at desc);

drop trigger if exists customer_external_orders_set_updated_at on public.customer_external_orders;
create trigger customer_external_orders_set_updated_at
  before update on public.customer_external_orders
  for each row
  execute function set_updated_at();

alter table public.customer_external_orders enable row level security;

create policy customer_external_orders_select_by_tenant on public.customer_external_orders
  for select using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and (
        au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id)
      )
    )
  );

create policy customer_external_orders_write_admin on public.customer_external_orders
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))));

comment on table public.customer_external_orders is
  'Minimal platform-side ledger of orders stored in a tenant''s own Convex or Supabase backend, used ONLY to derive customers profiles. Not an order mirror — the tenant backend remains the source of truth for fulfilment.';
comment on column public.customer_external_orders.backend is
  'Which foreign backend the order lives in: convex | tenant_supabase. Part of the (tenant, backend, external_order_id) idempotency key.';
comment on column public.customer_external_orders.external_order_id is
  'The order''s id in its own backend (Convex document id / tenant Supabase uuid).';
comment on column public.customer_external_orders.items is
  'JSON array of line items used for the customer''s top-items tally: [{ "name": string, "quantity": number }].';

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   drop table if exists public.customer_external_orders cascade;
-- ------------------------------------------------------------------------------
