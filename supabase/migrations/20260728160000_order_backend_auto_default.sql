-- supabase/migrations/20260728160000_order_backend_auto_default.sql
--
-- Make `order_backend` selectable without reintroducing the Coffee Mode bug.
--
-- The column defaulted to 'platform', which reads as a deliberate "use the
-- shared platform database" choice. Any write path that forgot to set it —
-- the superadmin form and the MCP provisioning ops both did — therefore pointed
-- a Convex tenant's admin queue at an empty database while checkout wrote to
-- Convex.
--
-- 'auto' is now the default and means "derive from the configured credentials"
-- (Convex when a deployment URL is present, else platform). A forgotten column
-- can no longer contradict the write path, while 'platform' and 'convex' stay
-- available as deliberate pins from the superadmin tenant form.

alter table public.tenants
  drop constraint if exists tenants_order_backend_ck;

alter table public.tenants
  add constraint tenants_order_backend_ck
    check (order_backend in ('auto', 'convex', 'supabase', 'platform'));

alter table public.tenants
  alter column order_backend set default 'auto';

comment on column public.tenants.order_backend is
  'Where this tenant''s orders live: auto (default — derive from credentials: Convex when convex_deployment_url is set, else the shared platform DB) | convex | supabase (own separate Supabase project) | platform (pinned to the shared platform DB). Resolved via src/lib/order-backend.ts.';

-- Existing rows are left alone: the 20260728140000 backfill already aligned every
-- Convex tenant, and a 'platform' row with no Convex URL resolves identically
-- under either value.

-- Rollback:
--   alter table public.tenants alter column order_backend set default 'platform';
--   update public.tenants set order_backend = 'platform' where order_backend = 'auto';
--   alter table public.tenants drop constraint tenants_order_backend_ck;
--   alter table public.tenants add constraint tenants_order_backend_ck
--     check (order_backend in ('convex', 'supabase', 'platform'));
