-- Security floor — Phase 0 of Store Activity & Approvals
--
-- An activity feed is only worth reading if the rows it reads cannot be
-- rewritten by the people it is reporting on. A 2026-10-12 audit found the
-- money and stock ledgers still editable or forgeable from a staff phone, and
-- every per-feature permission enforced in TypeScript only. This migration
-- closes those gaps at the database, where a modified client cannot skip them.
-- Contract: docs/plans/store-activity/contract.md ("SQL permission helper").
-- Live definitions were read from pg_policies / pg_get_functiondef on
-- 2026-10-12 before writing this (the repo had drifted: see 1).
--
-- 1. public.app_user_has_permission(p_tenant_id, p_permission)
--    The SQL twin of hasPermission() in src/lib/staff-permissions.ts.
--    It ALREADY EXISTS live (created by the gov-discounts branch,
--    20261012120000, not yet on this branch) and four gov_discount_* policies
--    call it, so the signature — including the parameter NAME p_permission —
--    is kept: renaming a parameter needs DROP FUNCTION, which those policies
--    block. What changes:
--      * permissions IS NULL (legacy full access) no longer grants the opt-in
--        keys activity_view / approve_requests (OPT_IN_PERMISSION_KEYS);
--      * kitchen / tables are granted by 'orders' (IMPLIED_BY);
--      * SECURITY DEFINER + search_path '' (it reads app_users, and must not
--        depend on the caller's RLS view of that table).
--    Every key the gov-discount policies use ('discount_review') keeps
--    exactly its previous answer.
--
-- 2. order_payments / order_revisions become append-only.
--    order_payments_update_admin and order_revisions_update_admin let any
--    staff token rewrite a payment's amount or kind, or move it to another
--    order (UPDATE order_id), which the amount_paid trigger then credits —
--    an inferred cross-tenant write. Both are dropped, UPDATE is revoked, and
--    a BEFORE UPDATE OR DELETE trigger refuses every role (service role
--    included). A wrong payment is corrected by appending a refund, never by
--    editing history. No server path updates or deletes these rows (grepped
--    src/, supabase/functions, webnegosyo-app, webnegosyo-desktop on
--    2026-10-12). The only exceptions are the cascades the schema itself
--    performs, and the guard recognises them precisely:
--      * DELETE when the parent order or the store is already gone
--        (execute_order_deletion, tenant deletion: ON DELETE CASCADE);
--      * UPDATE that only clears outlet_id when that branch is already gone
--        (outlets ON DELETE SET NULL).
--    restore_order_deletion only INSERTs, so it is unaffected.
--    Owner-run maintenance must disable the trigger explicitly, on purpose.
--
-- 3. Actor and time are stamped by the database, not asserted by the client.
--    recorded_by / revised_by / created_by and created_at were whatever the
--    phone sent, so a cashier could file a refund under the owner's name or
--    backdate it. A BEFORE INSERT trigger overwrites them with auth.uid() and
--    now() when the statement runs as a client role (anon/authenticated).
--    The service role and SECURITY DEFINER functions (current_user is then
--    the function owner) keep what they sent: the server attributes on behalf
--    of a verified caller, and restore_order_deletion must keep the original
--    actor and time. Same rule as shift_cash_movement_guard
--    (20261001120000_cash_drawers.sql).
--
-- 4. Permission keys reach the database.
--    * order_payments: a refund row needs order_refund.
--    * orders: a client cancelling needs orders; nobody on a client role can
--      cancel an order that was already delivered (the customer has the
--      food). Moving an order OUT of delivered needs order_edit and out of
--      cancelled needs orders, so the cancel rule cannot be sidestepped by
--      cycling the status (see 4b for the audited flows). No anon/customer
--      path updates orders (no anon UPDATE policy); the web admin's
--      updateOrderStatus runs as the caller and already checks 'orders'.
--    * vouchers / voucher_targets: writes need vouchers (reads stay open to
--      every account of the store — the register applies vouchers).
--    * voucher_redemptions: no client writes at all. Redemptions are made
--      only by redeem_voucher() (SECURITY DEFINER, service role) behind
--      /api/vouchers/redeem.
--    * stock_movements: a client insert needs menu (the grant that gates
--      inventory on every surface) on top of branch reach. Sales and voids
--      are written by the service role and are unaffected.
--    Platform staff (role platform_staff) keep their own, separate
--    platform_staff_* policies; the cancel guard honours stores.edit for them.
--
-- Rollback (manual, in order):
--   drop trigger if exists orders_client_status_guard on public.orders;
--   drop trigger if exists order_payments_append_only on public.order_payments;
--   drop trigger if exists order_revisions_append_only on public.order_revisions;
--   drop trigger if exists order_payments_stamp_actor on public.order_payments;
--   drop trigger if exists order_revisions_stamp_actor on public.order_revisions;
--   drop trigger if exists stock_movements_stamp_actor on public.stock_movements;
--   then recreate the previous policies from 20260926131000 /
--   20260924120000 / the live definitions recorded in the Phase 0 report.

-- ============================================
-- 1. Permission helper
-- ============================================

create or replace function public.app_user_has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_users au
     where au.user_id = auth.uid()
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin'
           and au.tenant_id = p_tenant_id
           and (
             au.is_owner is true
             -- Full access, minus the opt-in keys (OPT_IN_PERMISSION_KEYS).
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests']))
             or p_permission = any (au.permissions)
             -- IMPLIED_BY: the pass and the floor are slices of the order queue.
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
           )
         )
       )
  );
$$;

comment on function public.app_user_has_permission(uuid, text) is
  'SQL twin of hasPermission() (src/lib/staff-permissions.ts): superadmin/owner always; permissions NULL = all keys except opt-in activity_view/approve_requests; kitchen,tables implied by orders. Caller = auth.uid().';

revoke all on function public.app_user_has_permission(uuid, text) from public, anon;
grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;

-- ============================================
-- 2. order_payments / order_revisions: append-only
-- ============================================

drop policy if exists order_payments_update_admin on public.order_payments;
drop policy if exists order_revisions_update_admin on public.order_revisions;
-- Platform staff could UPDATE through the generic platform_staff loop
-- (20260929180000). The guard below refuses them anyway; dropping the policy
-- keeps what the policies say equal to what the database allows.
drop policy if exists platform_staff_update on public.order_payments;
drop policy if exists platform_staff_update on public.order_revisions;

-- TRUNCATE bypasses row triggers; PostgREST cannot issue it, but a client
-- role holding it is one mistake away from emptying the ledger.
revoke update, truncate on public.order_payments from anon, authenticated;
revoke update, truncate on public.order_revisions from anon, authenticated;

create or replace function public.order_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- outlets ON DELETE SET NULL: the branch is gone and only outlet_id moved.
    if new.outlet_id is null
       and old.outlet_id is not null
       and to_jsonb(new) - 'outlet_id' = to_jsonb(old) - 'outlet_id'
       and not exists (select 1 from public.outlets b where b.id = old.outlet_id) then
      return new;
    end if;
    raise exception '% rows are append-only: record a new row (a refund) instead of changing one', tg_table_name
      using errcode = '42501';
  end if;

  -- DELETE: only as the cascade of the order, or the whole store, being deleted.
  if exists (select 1 from public.orders o where o.id = old.order_id)
     and exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    raise exception '% rows are append-only and cannot be deleted', tg_table_name
      using errcode = '42501';
  end if;
  return old;
end;
$$;

comment on function public.order_ledger_append_only() is
  'Refuses UPDATE/DELETE on order_payments/order_revisions for every role, except the schema''s own cascades (order/store deleted; branch deleted -> outlet_id SET NULL). Phase 0 security floor.';

revoke all on function public.order_ledger_append_only() from public, anon, authenticated;

drop trigger if exists order_payments_append_only on public.order_payments;
create trigger order_payments_append_only before update or delete on public.order_payments for each row execute function public.order_ledger_append_only();

drop trigger if exists order_revisions_append_only on public.order_revisions;
create trigger order_revisions_append_only before update or delete on public.order_revisions for each row execute function public.order_ledger_append_only();

-- ============================================
-- 3. Actor + time stamped server-side on client inserts
-- ============================================

-- SECURITY INVOKER on purpose: current_user must be the role running the
-- INSERT. A definer trigger would always see its owner and stamp nothing.
-- TG_ARGV[0] names the actor column of the table it is attached to.
create or replace function public.stamp_client_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid(), 'created_at', now()));
  end if;
  return new;
end;
$$;

comment on function public.stamp_client_actor() is
  'BEFORE INSERT: on a client role, overwrites the actor column (TG_ARGV[0]) with auth.uid() and created_at with now(). Service role and SECURITY DEFINER writers keep what they sent. Phase 0 security floor.';

revoke all on function public.stamp_client_actor() from public, anon, authenticated;

drop trigger if exists order_payments_stamp_actor on public.order_payments;
create trigger order_payments_stamp_actor before insert on public.order_payments for each row execute function public.stamp_client_actor('recorded_by');

drop trigger if exists order_revisions_stamp_actor on public.order_revisions;
create trigger order_revisions_stamp_actor before insert on public.order_revisions for each row execute function public.stamp_client_actor('revised_by');

drop trigger if exists stock_movements_stamp_actor on public.stock_movements;
create trigger stock_movements_stamp_actor before insert on public.stock_movements for each row execute function public.stamp_client_actor('created_by');

-- ============================================
-- 4a. Refunds need order_refund
-- ============================================

-- Branch reach via the shared predicate app_user_may_see_order (superadmin,
-- or an admin of this store whose branch lock matches) — the same rule as the
-- live initplan form from 20260926131000, kept as the shared function because
-- branch-scoped-order-children.test.ts requires it and an INSERT checks one
-- row, so the initplan saving does not apply. Plus the refund gate.
-- RLS WITH CHECK runs after the BEFORE triggers, so tenant_id/outlet_id are
-- already the parent order's (order_child_inherit_branch), not the client's.
drop policy if exists order_payments_insert_admin on public.order_payments;
create policy order_payments_insert_admin on public.order_payments
  for insert to authenticated
  with check (
    public.app_user_may_see_order(tenant_id, outlet_id)
    and (kind <> 'refund' or public.app_user_has_permission(tenant_id, 'order_refund'))
  );

-- ============================================
-- 4b. Order status moves that undo the past (cancel, un-deliver, reopen)
-- ============================================

-- One guard for every client status change that takes something back. A
-- cancel-only guard was sidestepped by cycling (security review M2): set a
-- delivered order back to 'pending', then cancel it. So the moves OUT of the
-- two terminal states are gated too:
--
--   anything -> cancelled     needs orders; never from 'delivered'
--   delivered -> anything     needs order_edit (owners hold it; so does
--                             legacy full access) — "marked delivered by
--                             mistake" is a correction to a settled sale
--   cancelled -> anything     needs orders (reopen; the web admin re-deducts
--                             stock for it in updateOrderStatus)
--
-- Legitimate client flows, audited 2026-10-12:
--   * web admin status dropdown (src/components/admin/order-status-management.tsx,
--     a free select) -> updateOrderStatus (src/lib/orders-service.ts), which
--     runs as the caller and already requires orders. Its un-deliver now also
--     needs order_edit; its reopen keeps working for orders holders.
--   * merchant app: only forward moves (order/[orderId].tsx NEXT_STATUS,
--     orders.tsx list advance, scan.tsx pickup -> delivered, pos-sales.tsx
--     confirm), kitchen bump -> ready and recall -> preparing (kitchen.tsx),
--     cancel (supabase-adapter.ts cancelOrder, already skips delivered).
--     The app never moves an order out of delivered or cancelled; a kitchen
--     recall racing a handover is now refused, which is correct.
--   * no register "void a sale" flow writes status on the platform DB.
-- Residual, by design: a holder of BOTH order_edit and orders can still
-- un-deliver and then cancel — two deliberate moves by trusted grants, each
-- recorded in order_status_events / store_activity.
--
-- SECURITY INVOKER for the same reason as stamp_client_actor: the rule is
-- about client roles; the service role and definer functions are the server.
-- Platform staff with stores.edit keep the reach their policies give them.
create or replace function public.orders_client_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status = 'delivered' and new.status = 'cancelled' then
    raise exception 'This order was already delivered, so it can no longer be cancelled.'
      using errcode = 'P0001';
  end if;
  -- No anon path updates orders today (no anon UPDATE policy); should one
  -- appear, a customer still may not move an order through it. Checked before
  -- the helpers, which anon may not execute.
  if current_user = 'anon' then
    raise exception 'Changing an order needs a signed-in staff account.'
      using errcode = '42501';
  end if;
  if public.app_user_platform_can(array['stores.edit']) then
    return new;
  end if;
  if old.status = 'delivered' then
    if not public.app_user_has_permission(new.tenant_id, 'order_edit') then
      raise exception 'This order was already delivered. Moving it back needs the Edit Orders permission.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if (old.status = 'cancelled' or new.status = 'cancelled')
     and not public.app_user_has_permission(new.tenant_id, 'orders') then
    raise exception 'Cancelling or reopening an order needs the Orders permission. Ask the owner or a manager.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.orders_client_status_guard() is
  'BEFORE UPDATE OF status on orders, client roles only: ->cancelled needs orders and never from delivered; delivered-> needs order_edit; cancelled-> needs orders. Platform stores.edit exempt. Phase 0 security floor (review M2).';

revoke all on function public.orders_client_status_guard() from public, anon, authenticated;

-- The first draft of this file (never applied) named it orders_client_cancel_guard.
drop trigger if exists orders_client_cancel_guard on public.orders;
drop function if exists public.orders_client_cancel_guard();
drop trigger if exists orders_client_status_guard on public.orders;
create trigger orders_client_status_guard before update of status on public.orders for each row execute function public.orders_client_status_guard();

-- ============================================
-- 4c. Vouchers and their targets: writes need vouchers
-- ============================================

drop policy if exists vouchers_tenant_access on public.vouchers;

drop policy if exists vouchers_select_members on public.vouchers;
create policy vouchers_select_members on public.vouchers
  for select to authenticated
  using (exists (
    select 1 from public.app_users au
     where au.user_id = (select auth.uid())
       and (au.role = 'superadmin' or au.tenant_id = vouchers.tenant_id)
  ));

drop policy if exists vouchers_insert_managers on public.vouchers;
create policy vouchers_insert_managers on public.vouchers
  for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'vouchers'));

drop policy if exists vouchers_update_managers on public.vouchers;
create policy vouchers_update_managers on public.vouchers
  for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'vouchers'))
  with check (public.app_user_has_permission(tenant_id, 'vouchers'));

drop policy if exists vouchers_delete_managers on public.vouchers;
create policy vouchers_delete_managers on public.vouchers
  for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'vouchers'));

drop policy if exists voucher_targets_tenant_access on public.voucher_targets;

drop policy if exists voucher_targets_select_members on public.voucher_targets;
create policy voucher_targets_select_members on public.voucher_targets
  for select to authenticated
  using (exists (
    select 1
      from public.vouchers v
      join public.app_users au on au.user_id = (select auth.uid())
     where v.id = voucher_targets.voucher_id
       and (au.role = 'superadmin' or au.tenant_id = v.tenant_id)
  ));

drop policy if exists voucher_targets_insert_managers on public.voucher_targets;
create policy voucher_targets_insert_managers on public.voucher_targets
  for insert to authenticated
  with check (exists (
    select 1 from public.vouchers v
     where v.id = voucher_targets.voucher_id
       and public.app_user_has_permission(v.tenant_id, 'vouchers')
  ));

drop policy if exists voucher_targets_update_managers on public.voucher_targets;
create policy voucher_targets_update_managers on public.voucher_targets
  for update to authenticated
  using (exists (
    select 1 from public.vouchers v
     where v.id = voucher_targets.voucher_id
       and public.app_user_has_permission(v.tenant_id, 'vouchers')
  ))
  with check (exists (
    select 1 from public.vouchers v
     where v.id = voucher_targets.voucher_id
       and public.app_user_has_permission(v.tenant_id, 'vouchers')
  ));

drop policy if exists voucher_targets_delete_managers on public.voucher_targets;
create policy voucher_targets_delete_managers on public.voucher_targets
  for delete to authenticated
  using (exists (
    select 1 from public.vouchers v
     where v.id = voucher_targets.voucher_id
       and public.app_user_has_permission(v.tenant_id, 'vouchers')
  ));

-- ============================================
-- 4d. Voucher redemptions: read-only to clients
-- ============================================

drop policy if exists voucher_redemptions_tenant_access on public.voucher_redemptions;
drop policy if exists platform_staff_insert on public.voucher_redemptions;
drop policy if exists platform_staff_update on public.voucher_redemptions;
drop policy if exists platform_staff_delete on public.voucher_redemptions;

drop policy if exists voucher_redemptions_select_members on public.voucher_redemptions;
create policy voucher_redemptions_select_members on public.voucher_redemptions
  for select to authenticated
  using (exists (
    select 1 from public.app_users au
     where au.user_id = (select auth.uid())
       and (au.role = 'superadmin' or au.tenant_id = voucher_redemptions.tenant_id)
  ));

revoke insert, update, delete, truncate on public.voucher_redemptions from anon, authenticated;

-- ============================================
-- 4e. Stock movements: a client insert needs menu
-- ============================================

drop policy if exists stock_movements_insert_branch on public.stock_movements;
create policy stock_movements_insert_branch on public.stock_movements
  for insert to authenticated
  with check (
    public.app_user_may_reach_branch(tenant_id, outlet_id)
    and public.app_user_has_permission(tenant_id, 'menu')
  );

revoke truncate on public.stock_movements from anon, authenticated;
