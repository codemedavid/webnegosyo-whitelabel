-- Order RLS: evaluate the caller's grant ONCE per statement, not once per row.
--
-- APPLIED 2026-09-26 via Supabase MCP (apply_migration, name order_rls_initplan).
-- Verified after apply: 0 visible-row mismatches (orders + order_items) for
-- superadmin, owner, branch admins and anon; plans show InitPlan nodes.
--
-- Why
-- ---
-- Every order-family policy calls `app_user_may_see_order(tenant_id, outlet_id)`.
-- It is a SQL function with `SET search_path`, which makes it non-inlinable, and
-- it takes row columns as arguments, so Postgres cannot hoist it into an
-- InitPlan. Result: one function call + one `app_users` index probe PER ROW
-- scanned. `app_users_pkey` shows 523,773,473 index scans on a 281-row table.
--
-- Measured on the live database (Gungjeon, 2,012 orders), same query, 20-run
-- average, JSON aggregation excluded:
--   no RLS predicate            1.5 ms
--   current per-row function   36.9 ms   (x25)
--   predicate below (InitPlan)  3.2 ms
-- And for the branch "all orders" page (677 rows, json_agg included):
--   30.1 ms -> 17.3 ms (no-RLS floor 16.5 ms).
-- `order_items` pays it twice: its policy runs an EXISTS into `orders` per line
-- item, and `orders`' own policy is applied inside that EXISTS as well.
--
-- What changes
-- ------------
-- Three zero-argument helpers expose the caller's own `app_users` row. Wrapped
-- as `(select public.fn())` in a policy they become InitPlans: evaluated once,
-- then compared per row like a constant (and usable as index conditions).
--
-- Semantics are IDENTICAL to `app_user_may_see_order`, because `app_users` is
-- keyed by `user_id` (one row per user):
--   superadmin                         -> every row
--   admin, outlet_id IS NULL           -> every row of their tenant
--   admin, outlet_id = B               -> rows of their tenant with outlet_id = B
--                                         (an order with NULL outlet_id stays owner-only)
--   anyone else / anon                 -> nothing (adm tenant is NULL, `=` is NULL)
-- Verified before writing: for all 282 app_users accounts plus an anonymous
-- caller, the visible-order count under the old function and under this
-- predicate matched exactly (0 mismatches, 22,784 = 22,784 rows).
--
-- Like the function they replace, the helpers are STABLE and NOT security
-- definer: they read `app_users` as the caller, whose `app_users_select_self`
-- policy already exposes exactly that one row.
--
-- `app_user_may_see_order` itself is kept (unused by these policies afterwards)
-- so nothing else that references it breaks; drop it in a later cleanup.
-- Policies are ALTERed in place — no window in which a table has no policy.

begin;

create or replace function public.app_user_is_superadmin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid() and au.role = 'superadmin'
  );
$$;

-- The tenant an ADMIN account belongs to; NULL for anyone else.
create or replace function public.app_user_admin_tenant_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select au.tenant_id from public.app_users au
  where au.user_id = auth.uid() and au.role = 'admin';
$$;

-- The branch an ADMIN account is pinned to; NULL = every branch (or not an
-- admin, which `app_user_admin_tenant_id()` being NULL already refuses).
create or replace function public.app_user_admin_outlet_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select au.outlet_id from public.app_users au
  where au.user_id = auth.uid() and au.role = 'admin';
$$;

revoke all on function public.app_user_is_superadmin() from public;
revoke all on function public.app_user_admin_tenant_id() from public;
revoke all on function public.app_user_admin_outlet_id() from public;
grant execute on function public.app_user_is_superadmin() to anon, authenticated, service_role;
grant execute on function public.app_user_admin_tenant_id() to anon, authenticated, service_role;
grant execute on function public.app_user_admin_outlet_id() to anon, authenticated, service_role;

-- The predicate, spelled out per table (policies cannot share a macro, and a
-- row-argument function is exactly what defeats the InitPlan):
--
--   (select public.app_user_is_superadmin())
--   or (
--     tenant_id = (select public.app_user_admin_tenant_id())
--     and (
--       (select public.app_user_admin_outlet_id()) is null
--       or outlet_id = (select public.app_user_admin_outlet_id())
--     )
--   )

-- orders -----------------------------------------------------------------------
alter policy orders_select_by_tenant on public.orders
  using (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

alter policy orders_update_admin on public.orders
  using (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  )
  with check (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

alter policy orders_insert_admin on public.orders
  with check (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

-- order_payments ---------------------------------------------------------------
alter policy order_payments_select on public.order_payments
  using (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

alter policy order_payments_update_admin on public.order_payments
  using (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  )
  with check (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

alter policy order_payments_insert_admin on public.order_payments
  with check (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

-- order_revisions --------------------------------------------------------------
alter policy order_revisions_select on public.order_revisions
  using (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

alter policy order_revisions_update_admin on public.order_revisions
  using (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  )
  with check (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

alter policy order_revisions_insert_admin on public.order_revisions
  with check (
    (select public.app_user_is_superadmin())
    or (tenant_id = (select public.app_user_admin_tenant_id())
        and ((select public.app_user_admin_outlet_id()) is null
             or outlet_id = (select public.app_user_admin_outlet_id())))
  );

-- order_items (no tenant_id of its own: scoped through the parent order) -------
-- `order_items_write_admin` is FOR ALL and so also grants SELECT; both are kept
-- and both rewritten, exactly as `20260804120000` warns.
alter policy order_items_select_by_order on public.order_items
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and ((select public.app_user_is_superadmin())
             or (o.tenant_id = (select public.app_user_admin_tenant_id())
                 and ((select public.app_user_admin_outlet_id()) is null
                      or o.outlet_id = (select public.app_user_admin_outlet_id()))))
    )
  );

alter policy order_items_write_admin on public.order_items
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and ((select public.app_user_is_superadmin())
             or (o.tenant_id = (select public.app_user_admin_tenant_id())
                 and ((select public.app_user_admin_outlet_id()) is null
                      or o.outlet_id = (select public.app_user_admin_outlet_id()))))
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and ((select public.app_user_is_superadmin())
             or (o.tenant_id = (select public.app_user_admin_tenant_id())
                 and ((select public.app_user_admin_outlet_id()) is null
                      or o.outlet_id = (select public.app_user_admin_outlet_id()))))
    )
  );

commit;

-- Post-apply checks (run as `authenticated` with a real admin's claims):
--   * EXPLAIN a tenant orders read: expect `InitPlan` nodes and NO
--     `Filter: app_user_may_see_order(...)`.
--   * Re-run the 282-account visible-count comparison: 0 mismatches.
--   * get_advisors(performance): no new auth_rls_initplan findings on these tables.
