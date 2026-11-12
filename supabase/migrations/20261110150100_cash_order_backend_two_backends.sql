-- ===========================================================================
-- One order backend fewer: cash.tenant_order_backend stops answering
-- 'supabase' (2026-11-10).
--
-- A store's own, separate Supabase project (`order_backend = 'supabase'`) was
-- removed from the code: no store ever used it. resolveOrderBackend
-- (src/lib/order-backend.ts) now answers only convex | platform, and a stale
-- 'supabase' pin derives from the Convex deployment URL exactly like `auto`.
-- This is the same change for its SQL twin, so the shift-sales and day-close
-- RPCs keep agreeing with the web
-- (tests/unit/cash/order-backend-sql-parity.test.ts runs this file).
--
-- The body below is the one in 20261027120200_cash_settings.sql (the only
-- migration that defines it) with 'supabase' taken out of the recognised pins;
-- nothing else changes. Same owner, same grants (CREATE OR REPLACE keeps them;
-- restated to be explicit). Before applying, compare the live body:
--   select pg_get_functiondef('cash.tenant_order_backend(uuid)'::regprocedure);
--
-- Safe to apply before or after the web deploy: no tenants row holds
-- order_backend = 'supabase' (probe it first:
--   select count(*) from public.tenants where order_backend = 'supabase';  -- 0).
-- The tenants_order_backend_ck CHECK is NOT changed here.
-- ===========================================================================

set lock_timeout = '3s';

create or replace function cash.tenant_order_backend(p_tenant uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when t.order_backend in ('convex', 'platform') then t.order_backend
           when coalesce(t.convex_deployment_url, '')
                !~ '^[\t\n\v\f\r    -     　﻿]*$' then 'convex'
           else 'platform'
         end
    from public.tenants t
   where t.id = p_tenant;
$$;

comment on function cash.tenant_order_backend(uuid) is
  'SQL twin of resolveOrderBackend (src/lib/order-backend.ts): pin convex|platform wins (the retired supabase pin derives like auto), else a non-blank convex_deployment_url = convex, else platform. Change both.';

revoke all on function cash.tenant_order_backend(uuid) from public, anon, authenticated;
grant execute on function cash.tenant_order_backend(uuid) to service_role;
