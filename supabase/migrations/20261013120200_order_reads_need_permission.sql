-- ===========================================================================
-- HIGH-3: reading a store's orders needs an order-reading permission
-- (plan §1.3 / §8.7, Phase 0d).
--
-- Until now the order tables asked only "is this caller staff of this store
-- (and of this branch)?". A staff account granted only the menu, the guest
-- list or the staff roster could read every order through the API: customer
-- names, phones, addresses, totals, and every payment.
--
--   orders (and order_items, through its EXISTS on orders)
--       one of  orders, pos, kitchen, tables, analytics, reports
--   order_payments, order_revisions (the till and the edit ledger)
--       one of  orders, pos, tables, analytics, reports      (no kitchen)
--
-- Mirrored by ORDER_READ_KEYS / PAYMENT_READ_KEYS in
-- src/lib/staff-permissions.ts and the app's copy (tests pin all three).
-- Why each key is in (every flow that reads these tables with a staff
-- session; docs/testing/permission-keys.tdd.md has the full map):
--   orders     the queue, order detail, the web orders page
--   pos        sale creation (INSERT ... RETURNING), incoming panel, sales,
--              shift card, offline replay
--   kitchen    the kitchen board and its status bumps (UPDATE ... RETURNING)
--   tables     the floor, table detail, the bill
--   analytics  every report screen in the app
--   reports    the sales reports (Phase 1)
-- Owners, superadmin and legacy full access (NULL) hold all of them. On
-- 2026-10-13 two live staff accounts hold none (one menu-only, one
-- branch-staff-only); the app hides its Home takings for such accounts.
--
-- Staff WRITES carry the same check: a plain INSERT (no RETURNING) never
-- consults a SELECT policy, so without it a menu-only account could still
-- post an order or a payment it cannot see. Every staff flow that writes
-- these tables (register, queue, kitchen bump, floor/bill, edit) holds one
-- of the keys. Customer checkout is untouched: anon inserts go through
-- their own policies, and service-role writes bypass RLS.
--
-- APPLY WITH THE DEPLOY of the app build that hides Home takings from
-- accounts without these keys; otherwise those two accounts see ₱0 at home.
-- ===========================================================================

-- One check for a list of keys, row-independent so a policy can evaluate it
-- once per statement (as an InitPlan) rather than once per row.
create or replace function public.app_user_holds_any_permission(p_tenant_id uuid, p_keys text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from unnest(p_keys) as key
     where public.app_user_has_permission(p_tenant_id, key)
  );
$$;

comment on function public.app_user_holds_any_permission(uuid, text[]) is
  'True when the caller (auth.uid()) holds at least one of p_keys for the store, by app_user_has_permission''s rules.';

revoke all on function public.app_user_holds_any_permission(uuid, text[]) from public;
-- anon included on purpose: the order policies apply to every role, and an
-- InitPlan runs before any short-circuit. An anon caller simply gets false;
-- refusing anon EXECUTE would turn its empty read into an error.
grant execute on function public.app_user_holds_any_permission(uuid, text[]) to anon, authenticated, service_role;

alter policy orders_select_by_tenant on public.orders
  using (
    (select public.app_user_is_superadmin())
    or (
      tenant_id = (select public.app_user_admin_tenant_id())
      and (
        (select public.app_user_admin_outlet_id()) is null
        or outlet_id = (select public.app_user_admin_outlet_id())
      )
      and (select public.app_user_holds_any_permission(
        (select public.app_user_admin_tenant_id()),
        array['orders', 'pos', 'kitchen', 'tables', 'analytics', 'reports']
      ))
    )
  );

alter policy order_payments_select on public.order_payments
  using (
    (select public.app_user_is_superadmin())
    or (
      tenant_id = (select public.app_user_admin_tenant_id())
      and (
        (select public.app_user_admin_outlet_id()) is null
        or outlet_id = (select public.app_user_admin_outlet_id())
      )
      and (select public.app_user_holds_any_permission(
        (select public.app_user_admin_tenant_id()),
        array['orders', 'pos', 'tables', 'analytics', 'reports']
      ))
    )
  );

alter policy order_revisions_select on public.order_revisions
  using (
    (select public.app_user_is_superadmin())
    or (
      tenant_id = (select public.app_user_admin_tenant_id())
      and (
        (select public.app_user_admin_outlet_id()) is null
        or outlet_id = (select public.app_user_admin_outlet_id())
      )
      and (select public.app_user_holds_any_permission(
        (select public.app_user_admin_tenant_id()),
        array['orders', 'pos', 'tables', 'analytics', 'reports']
      ))
    )
  );

-- ---------------------------------------------------------------------------
-- Staff writes: the same keys.
-- ---------------------------------------------------------------------------
alter policy orders_insert_admin on public.orders
  with check (
    (select public.app_user_is_superadmin())
    or (
      tenant_id = (select public.app_user_admin_tenant_id())
      and (
        (select public.app_user_admin_outlet_id()) is null
        or outlet_id = (select public.app_user_admin_outlet_id())
      )
      and (select public.app_user_holds_any_permission(
        (select public.app_user_admin_tenant_id()),
        array['orders', 'pos', 'kitchen', 'tables', 'analytics', 'reports']
      ))
    )
  );

alter policy orders_update_admin on public.orders
  using (
    (select public.app_user_is_superadmin())
    or (
      tenant_id = (select public.app_user_admin_tenant_id())
      and (
        (select public.app_user_admin_outlet_id()) is null
        or outlet_id = (select public.app_user_admin_outlet_id())
      )
      and (select public.app_user_holds_any_permission(
        (select public.app_user_admin_tenant_id()),
        array['orders', 'pos', 'kitchen', 'tables', 'analytics', 'reports']
      ))
    )
  )
  with check (
    (select public.app_user_is_superadmin())
    or (
      tenant_id = (select public.app_user_admin_tenant_id())
      and (
        (select public.app_user_admin_outlet_id()) is null
        or outlet_id = (select public.app_user_admin_outlet_id())
      )
      and (select public.app_user_holds_any_permission(
        (select public.app_user_admin_tenant_id()),
        array['orders', 'pos', 'kitchen', 'tables', 'analytics', 'reports']
      ))
    )
  );

-- order_payments_insert_admin keeps its own shape (app_user_may_see_order +
-- the refund grant) and gains the till keys.
alter policy order_payments_insert_admin on public.order_payments
  with check (
    public.app_user_may_see_order(tenant_id, outlet_id)
    and (kind <> 'refund' or public.app_user_has_permission(tenant_id, 'order_refund'))
    and (select public.app_user_holds_any_permission(
      (select public.app_user_admin_tenant_id()),
      array['orders', 'pos', 'tables', 'analytics', 'reports']
    ))
  );

alter policy order_revisions_insert_admin on public.order_revisions
  with check (
    (select public.app_user_is_superadmin())
    or (
      tenant_id = (select public.app_user_admin_tenant_id())
      and (
        (select public.app_user_admin_outlet_id()) is null
        or outlet_id = (select public.app_user_admin_outlet_id())
      )
      and (select public.app_user_holds_any_permission(
        (select public.app_user_admin_tenant_id()),
        array['orders', 'pos', 'tables', 'analytics', 'reports']
      ))
    )
  );

