-- Platform order-backend parity with Convex.
--
-- Tenants on `order_backend = 'platform'` keep their orders in the shared
-- platform database. Everything the merchant app does against a tenant's Convex
-- deployment must therefore be possible here too. Convex carries five tables
-- that have no platform equivalent (analyticsEvents, pushTokens, productCosts,
-- productAnalytics, dailyStats); without them the analytics, product and push
-- surfaces are dead for every platform tenant. This migration adds them.
--
-- It also fixes a live defect: the `supabase_realtime` publication contained NO
-- tables, so Supabase Realtime never delivered a single `orders` change. The
-- web admin subscribed successfully and showed its "live" pulse while receiving
-- nothing. Adding orders/order_items to the publication is what actually turns
-- real-time order arrival on.
--
-- RLS note: every policy below compares `au.tenant_id` to the ROW's tenant_id.
-- Migration 20260726140000 fixed a production cross-tenant leak caused by
-- writing `au.tenant_id = au.tenant_id` (always true). Do not restructure these
-- policies without preserving that comparison.

-- ---------------------------------------------------------------------------
-- 1. Realtime publication
-- ---------------------------------------------------------------------------
-- REPLICA IDENTITY FULL makes the old row available on UPDATE/DELETE, which
-- Realtime needs to evaluate RLS against the pre-update row.
alter table public.orders replica identity full;
alter table public.order_items replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. analytics_events  (Convex: analyticsEvents)
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  metadata jsonb not null default '{}'::jsonb,
  session_id text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_tenant_type_created_idx
  on public.analytics_events (tenant_id, type, created_at desc);
create index if not exists analytics_events_tenant_created_idx
  on public.analytics_events (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. push_tokens  (Convex: pushTokens)
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per device per tenant. Re-registering the same Expo token (every
  -- cold start) must update rather than accumulate duplicates, or a merchant
  -- gets N pushes for one order.
  unique (tenant_id, token)
);

create index if not exists push_tokens_tenant_idx on public.push_tokens (tenant_id);

-- ---------------------------------------------------------------------------
-- 4. product_costs  (Convex: productCosts)
-- ---------------------------------------------------------------------------
create table if not exists public.product_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  cost_price numeric(12, 2) not null default 0,
  cost_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, menu_item_id)
);

-- ---------------------------------------------------------------------------
-- 5. product_analytics  (Convex: productAnalytics)
-- ---------------------------------------------------------------------------
create table if not exists public.product_analytics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  menu_item_name text,
  period text not null,
  total_units_sold integer not null default 0,
  total_revenue numeric(12, 2) not null default 0,
  total_cost numeric(12, 2) not null default 0,
  total_profit numeric(12, 2) not null default 0,
  margin_percent numeric(6, 2),
  avg_daily_units numeric(12, 4) not null default 0,
  revenue_trend text not null default 'flat',
  bcg_classification text not null default 'unclassified',
  recommendation text,
  pairing_recommendation text,
  pairing_item_id uuid,
  pairing_reason text,
  last_order_date timestamptz,
  computed_at timestamptz not null default now(),
  unique (tenant_id, menu_item_id, period)
);

create index if not exists product_analytics_tenant_period_idx
  on public.product_analytics (tenant_id, period);

-- ---------------------------------------------------------------------------
-- 6. daily_stats  (Convex: dailyStats)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_stats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Stored as a date string in the tenant's own timezone, matching the Convex
  -- aggregator; a timestamptz here would drift the day boundary for Asia/Manila.
  date text not null,
  total_orders integer not null default 0,
  total_revenue numeric(12, 2) not null default 0,
  avg_order_value numeric(12, 2) not null default 0,
  upsell_conversion_rate numeric(6, 2),
  top_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, date)
);

create index if not exists daily_stats_tenant_date_idx
  on public.daily_stats (tenant_id, date desc);

-- ---------------------------------------------------------------------------
-- 7. RLS — tenant isolation on all five tables
-- ---------------------------------------------------------------------------
alter table public.analytics_events  enable row level security;
alter table public.push_tokens       enable row level security;
alter table public.product_costs     enable row level security;
alter table public.product_analytics enable row level security;
alter table public.daily_stats       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'analytics_events', 'push_tokens', 'product_costs',
    'product_analytics', 'daily_stats'
  ]
  loop
    execute format('drop policy if exists %I_select_by_tenant on public.%I', t, t);
    execute format($f$
      create policy %I_select_by_tenant on public.%I
        for select using (
          exists (
            select 1 from public.app_users au
            where au.user_id = auth.uid()
              and (
                au.role = 'superadmin'
                or (au.role = 'admin' and au.tenant_id = public.%I.tenant_id)
              )
          )
        )
    $f$, t, t, t);

    execute format('drop policy if exists %I_write_admin on public.%I', t, t);
    execute format($f$
      create policy %I_write_admin on public.%I
        for all using (
          exists (
            select 1 from public.app_users au
            where au.user_id = auth.uid()
              and (
                au.role = 'superadmin'
                or (au.role = 'admin' and au.tenant_id = public.%I.tenant_id)
              )
          )
        )
    $f$, t, t, t);
  end loop;
end $$;

-- No anonymous insert policy on analytics_events, deliberately. Storefront
-- events come from customers with no app_users row, but they are written by
-- `trackAnalyticsEventAction` through the service-role client, which bypasses
-- RLS. A permissive `with check (true)` would add nothing for that path while
-- letting anyone forge events for any tenant.
