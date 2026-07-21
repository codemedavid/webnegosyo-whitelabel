/**
 * Canonical, standalone order-schema bundle for a tenant's OWN, separate
 * Supabase project (the analogue of `convex-template/` for the Supabase order
 * backend). This is the single source of truth applied by the auto-deploy
 * pipeline (`applySupabaseSchema` → `deployOrderSchema`).
 *
 * Design constraints that make this DIFFERENT from the platform migrations:
 *  - No `tenants` FK: a tenant's project holds only that tenant's data, and the
 *    `tenants` table does not exist there. `tenant_id` is kept as a plain column
 *    for query-shape compatibility with existing code, but is not constrained.
 *  - No `app_users` / `auth.uid()` RLS: that table lives on the platform only.
 *    Instead: server-side reads/writes use the service-role key (which bypasses
 *    RLS), realtime clients read via a permissive SELECT policy, and PII in
 *    `customers` is reachable by the service role ONLY (no anon/public policy).
 *  - No FKs to `menu_items` / `order_types` / `payment_methods`: those live on
 *    the platform. The denormalized name columns already carried on each order
 *    are the source of truth in this project.
 *  - Fully idempotent: `create table if not exists`, `create or replace
 *    function`, guarded publication adds, and `drop policy/trigger if exists`
 *    before each create — so a re-deploy on a bumped schema version is safe.
 *
 * Bump `SUPABASE_ORDER_SCHEMA_VERSION` in `supabase-deploy.ts` whenever this
 * bundle changes so `bulkDeploySupabaseAction` re-provisions every tenant.
 */
export const ORDER_SCHEMA_BUNDLE = `
-- ============================================================================
-- Per-tenant Supabase order backend — standalone schema bundle
-- Idempotent: safe to run repeatedly (schema re-deploy / version bump).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on row updates.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- customers — order-scoped customer identity (PII). Service-role access only.
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  phone_e164 text,
  email text,
  name text,
  first_order_at timestamptz,
  last_order_at timestamptz,
  order_count integer not null default 0,
  total_spent numeric(12,2) not null default 0,
  average_order_value numeric(12,2) not null default 0,
  channels_used text[] not null default '{}',
  top_items jsonb not null default '[]'::jsonb,
  sms_consent boolean not null default false,
  sms_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_order_count_ck check (order_count >= 0),
  constraint customers_total_spent_ck check (total_spent >= 0),
  constraint customers_identity_ck check (phone_e164 is not null or email is not null)
);

create unique index if not exists customers_tenant_phone_uq
  on public.customers(tenant_id, phone_e164) where phone_e164 is not null;
create unique index if not exists customers_tenant_email_uq
  on public.customers(tenant_id, email) where phone_e164 is null and email is not null;
create index if not exists customers_tenant_last_order_idx
  on public.customers(tenant_id, last_order_at desc);
create index if not exists customers_tenant_total_spent_idx
  on public.customers(tenant_id, total_spent desc);
create index if not exists customers_tenant_order_count_idx
  on public.customers(tenant_id, order_count desc);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_name text,
  customer_contact text,
  customer_id uuid references public.customers(id) on delete set null,
  customer_data jsonb default '{}'::jsonb,
  total numeric(10,2) not null check (total >= 0),
  status text not null default 'pending'
    check (status in ('pending','confirmed','preparing','ready','delivered','cancelled')),
  daily_order_number integer,
  order_type_id uuid,
  order_type text,
  payment_method_id uuid,
  payment_method_name text,
  payment_method_details text,
  payment_method_qr_code_url text,
  payment_status text default 'pending'
    check (payment_status in ('pending','paid','failed','verified')),
  delivery_fee numeric(10,2) default 0,
  service_charge_amount numeric(10,2) default 0,
  lalamove_quotation_id text,
  lalamove_order_id text,
  lalamove_status text,
  lalamove_driver_id text,
  lalamove_driver_name text,
  lalamove_driver_phone text,
  lalamove_tracking_url text,
  scheduled_for timestamptz,
  payment_proof_url text,
  payment_proof_public_id text,
  payment_proof_reference text,
  payment_proof_uploaded_at timestamptz,
  order_token_hash text,
  order_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_tenant_idx on public.orders(tenant_id);
create index if not exists orders_order_type_text_idx on public.orders(tenant_id, order_type);
create index if not exists orders_payment_status_idx on public.orders(tenant_id, payment_status);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_token_hash_idx
  on public.orders(order_token_hash) where order_token_hash is not null;
create index if not exists orders_tenant_scheduled_for_idx
  on public.orders(tenant_id, scheduled_for) where scheduled_for is not null;
create index if not exists orders_tenant_daily_number_idx
  on public.orders(tenant_id, daily_order_number);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-tenant daily order number: #1, #2, … resetting each Asia/Manila day.
-- Computed BEFORE INSERT so every order gets a stable human-facing number.
-- ---------------------------------------------------------------------------
create or replace function public.assign_daily_order_number()
returns trigger as $$
declare
  next_number integer;
begin
  if new.daily_order_number is not null then
    return new;
  end if;

  select coalesce(max(o.daily_order_number), 0) + 1
    into next_number
    from public.orders o
   where o.tenant_id = new.tenant_id
     and (o.created_at at time zone 'Asia/Manila')::date
       = (now() at time zone 'Asia/Manila')::date;

  new.daily_order_number := next_number;
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_assign_daily_number on public.orders;
create trigger orders_assign_daily_number
  before insert on public.orders
  for each row execute function public.assign_daily_order_number();

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid,
  menu_item_name text not null,
  variation text,
  addons text[] not null default '{}',
  quantity integer not null default 1 check (quantity > 0),
  price numeric(10,2) not null check (price >= 0),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  special_instructions text
);

create index if not exists order_items_order_idx on public.order_items(order_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions — Expo / web push tokens for new-order notifications.
-- Service-role access only.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  platform text not null,
  device_token text,
  endpoint text,
  auth_key text,
  p256dh text,
  expo_push_token text,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_tenant_idx
  on public.push_subscriptions(tenant_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
--   orders / order_items: RLS on. Realtime clients read via a permissive
--     SELECT policy (anon + authenticated). All writes flow through the
--     service-role key, which bypasses RLS entirely, so no write policy exists.
--   customers / push_subscriptions: RLS on with NO policies → reachable by the
--     service role ONLY. This keeps customer PII and push tokens off every
--     anon/public path.
-- Single-tenant project scope keeps the realtime read blast radius to one
-- tenant's own data.
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.customers enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists orders_realtime_read on public.orders;
create policy orders_realtime_read on public.orders
  for select to anon, authenticated using (true);

drop policy if exists order_items_realtime_read on public.order_items;
create policy order_items_realtime_read on public.order_items
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Realtime: publish orders + order_items so web admin and the merchant app
-- receive live INSERT/UPDATE events. REPLICA IDENTITY FULL so UPDATE payloads
-- carry the full row. Guarded so re-deploy never errors on already-published.
-- ---------------------------------------------------------------------------
alter table public.orders replica identity full;
alter table public.order_items replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end
$$;
`;
