-- supabase/migrations/20260721000000_order_backend.sql
--
-- Per-tenant order backend selection (Supabase | Convex | Platform).
--
-- Adds an explicit `order_backend` column so a tenant's order database is a
-- deliberate choice rather than an implicit side effect of whether a Convex URL
-- happens to be set. Also adds the credential columns for the new option: each
-- tenant may run their orders in their OWN, fully separate Supabase project
-- (the mirror of how each tenant already runs their own Convex deployment).
--
-- Backend meanings (see src/lib/order-backend.ts — the single source of truth):
--   'convex'   — the tenant's own Convex deployment (existing convex_* columns).
--   'supabase' — the tenant's own dedicated, separate Supabase project (NEW).
--   'platform' — this shared platform Supabase (the legacy default).
--
-- `platform` is kept distinct from `supabase` on purpose: tenants with no Convex
-- credentials have always written to THIS database, and collapsing them into
-- `supabase` would silently reroute them to a per-tenant project they lack.
--
-- Safety / reversibility: purely additive — one enum-checked column plus four
-- nullable credential columns. The backfill only encodes today's implicit
-- behavior (Convex URL present => 'convex', else => 'platform'), so no tenant's
-- effective routing changes. Rollback block at the bottom.
--
-- Secret handling: the service-role key and DB connection string are sensitive.
-- They are stored the same way as the existing `convex_deploy_key` (tenant row,
-- protected by the tenants table's RLS, read only via the service-role client).
-- Encrypting these at rest is a tracked follow-up, applied uniformly with the
-- Convex deploy key rather than piecemeal here.

-- 1. Backend selector -----------------------------------------------------------
alter table public.tenants
  add column if not exists order_backend text not null default 'platform'
    constraint tenants_order_backend_ck
      check (order_backend in ('convex', 'supabase', 'platform'));

-- 2. Per-tenant Supabase order-project credentials (nullable) --------------------
alter table public.tenants
  add column if not exists supabase_order_url text,
  add column if not exists supabase_order_anon_key text,
  add column if not exists supabase_order_service_key text,
  add column if not exists supabase_order_db_url text,
  add column if not exists supabase_order_schema_version integer;

-- 3. Backfill to preserve today's implicit routing exactly -----------------------
-- Only touches rows still on the default; encodes the historical rule.
update public.tenants
  set order_backend = case
    when convex_deployment_url is not null and convex_deployment_url <> '' then 'convex'
    else 'platform'
  end
  where order_backend = 'platform';

-- 4. Documentation ---------------------------------------------------------------
comment on column public.tenants.order_backend is
  'Where this tenant''s orders live: convex (own Convex deployment) | supabase (own separate Supabase project) | platform (shared platform Supabase, legacy default). Resolved via src/lib/order-backend.ts.';
comment on column public.tenants.supabase_order_url is
  'The tenant''s own Supabase project URL (only when order_backend = supabase).';
comment on column public.tenants.supabase_order_anon_key is
  'Anon key for the tenant''s Supabase project — used for client reads / realtime subscriptions.';
comment on column public.tenants.supabase_order_service_key is
  'Service-role key for the tenant''s Supabase project — server-side order writes/reads. Sensitive.';
comment on column public.tenants.supabase_order_db_url is
  'Postgres connection string for the tenant''s Supabase project — used only to auto-deploy the order schema (DDL the anon key cannot run). Sensitive.';
comment on column public.tenants.supabase_order_schema_version is
  'Version of the order-schema bundle last deployed to the tenant''s Supabase project (mirrors convex_schema_version).';

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   alter table public.tenants
--     drop column if exists supabase_order_schema_version,
--     drop column if exists supabase_order_db_url,
--     drop column if exists supabase_order_service_key,
--     drop column if exists supabase_order_anon_key,
--     drop column if exists supabase_order_url;
--   alter table public.tenants drop constraint if exists tenants_order_backend_ck;
--   alter table public.tenants drop column if exists order_backend;
-- ------------------------------------------------------------------------------
