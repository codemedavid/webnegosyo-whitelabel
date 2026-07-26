-- Fix cross-tenant RLS leak on the customer PII tables.
--
-- The tenant-isolation clause on these policies was written as
--   au.tenant_id = au.tenant_id
-- which compares the app_users row to ITSELF and is therefore always true.
-- The intent was to compare it to the row being read:
--   au.tenant_id = <table>.tenant_id
--
-- Effect of the bug: ANY authenticated tenant admin could read (and write)
-- EVERY other tenant's rows. Verified in production before this migration —
-- one tenant's admin could see 481 other tenants' customer rows, including
-- names and phone numbers.
--
-- The application layer always filters by tenant_id and gates on
-- verifyTenantPermission, so the leak was not reachable through the normal
-- admin UI. It WAS reachable by anyone calling PostgREST directly with a
-- tenant-admin token, which is exactly what RLS exists to prevent.
--
-- Superadmin access is unchanged: the `role = 'superadmin'` branch still
-- grants full cross-tenant visibility.

-- 1. customers ---------------------------------------------------------------
drop policy if exists customers_select_by_tenant on public.customers;
create policy customers_select_by_tenant on public.customers
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = customers.tenant_id)
        )
    )
  );

drop policy if exists customers_write_admin on public.customers;
create policy customers_write_admin on public.customers
  for all
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = customers.tenant_id)
        )
    )
  );

-- 2. customer_external_orders -------------------------------------------------
drop policy if exists customer_external_orders_select_by_tenant on public.customer_external_orders;
create policy customer_external_orders_select_by_tenant on public.customer_external_orders
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = customer_external_orders.tenant_id)
        )
    )
  );

drop policy if exists customer_external_orders_write_admin on public.customer_external_orders;
create policy customer_external_orders_write_admin on public.customer_external_orders
  for all
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = customer_external_orders.tenant_id)
        )
    )
  );

-- 3. orders -------------------------------------------------------------------
-- Same tautology, same PII exposure (customer name, contact, delivery address).
drop policy if exists orders_select_by_tenant on public.orders;
create policy orders_select_by_tenant on public.orders
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = orders.tenant_id)
        )
    )
  );

-- `orders_write_admin` is FOR ALL, so it also grants SELECT. Permissive
-- policies are OR-ed together, which means tightening the select policy alone
-- would change nothing while this one still matches every row.
drop policy if exists orders_write_admin on public.orders;
create policy orders_write_admin on public.orders
  for all
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = orders.tenant_id)
        )
    )
  );

-- NOTE: `orders_insert` is deliberately untouched — it is what lets the
-- anonymous storefront checkout create an order.

-- Rollback: restore the previous (leaky) predicates by replacing
-- `au.tenant_id = <table>.tenant_id` with `au.tenant_id = au.tenant_id`.
-- Only do this to unblock an incident; it disables tenant isolation.
