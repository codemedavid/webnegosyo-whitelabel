-- Customer app (Phase 4): which orders belong to which signed-in customer.
--
-- One row per checkout attempt from a store's app. The row is claimed BEFORE
-- the order is placed (state 'placing', keyed by the app's Idempotency-Key),
-- then marked 'placed' with the backend's order id and a snapshot of what was
-- ordered, or 'failed' when nothing was written. A retry of a placed key is
-- answered with the same order; a retry while 'placing' never places a second
-- one. The same table works for every order backend, so history and tracking
-- never need a per-backend "orders by phone" query.
--
-- This is the APP's index, not the order: the order itself lives in
-- public.orders (platform), the store's Convex deployment or its own database.
-- Deleting the customer record cascades this index away and never touches the
-- order (public.orders.customer_id is ON DELETE SET NULL; Convex and tenant
-- databases are not reached by a cascade at all).
--
-- Service role only: the app talks to /api/app/v1/*, never to this table.
-- Plan: docs/plans/2026-11-04-customer-app-p4-ordering.md §3.

create table if not exists public.customer_app_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- tenant_apps is keyed by tenant_id (one app per store). NO ACTION (not
  -- cascade): removing a store's app must not silently erase its customers'
  -- history; deleting the whole store still cascades both in one statement.
  app_id uuid not null references public.tenant_apps(tenant_id),
  customer_id uuid not null references public.customers(id) on delete cascade,
  backend text not null check (backend in ('platform', 'convex', 'supabase')),
  -- NULL while placing. Text because Convex ids are not uuids.
  order_id text check (order_id is null or char_length(order_id) between 1 and 200),
  -- Printable ASCII, 8..100 characters (the app sends a uuid per attempt).
  idempotency_key text not null check (idempotency_key ~ '^[!-~]{8,100}$'),
  state text not null default 'placing' check (state in ('placing', 'placed', 'failed')),
  -- Lines, totals and names as placed (zod: src/lib/app-api/orders/order-index.ts).
  summary jsonb check (summary is null or jsonb_typeof(summary) = 'object'),
  last_status text check (last_status is null or char_length(last_status) between 1 and 40),
  last_status_at timestamptz,
  placed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_app_orders_app_is_store_ck check (app_id = tenant_id),
  constraint customer_app_orders_placed_ck check (
    state <> 'placed' or (order_id is not null and placed_at is not null and summary is not null)
  ),
  constraint customer_app_orders_key_uq unique (tenant_id, idempotency_key),
  constraint customer_app_orders_order_uq unique (tenant_id, backend, order_id)
);

-- History paging: keyset on (created_at, id) per customer. customer_id leads
-- so the same index serves the customers(id) ON DELETE CASCADE lookup; the
-- list query fixes both tenant_id and customer_id by equality.
create index if not exists customer_app_orders_history_idx
  on public.customer_app_orders (customer_id, tenant_id, created_at desc, id desc);

drop trigger if exists customer_app_orders_set_updated_at on public.customer_app_orders;
create trigger customer_app_orders_set_updated_at
  before update on public.customer_app_orders
  for each row execute function public.set_updated_at();

comment on table public.customer_app_orders is
  'Customer-app checkout attempts and the orders they placed (idempotency + history index; the order lives in its backend). Service role only.';

alter table public.customer_app_orders enable row level security;
revoke all on public.customer_app_orders from public, anon, authenticated;
grant all on public.customer_app_orders to service_role;

-- Rollback:
--   drop table if exists public.customer_app_orders;
