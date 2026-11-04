-- ===========================================================================
-- Inventory permission hardening, part 1: tables only the server writes.
-- (inventory DB security audit 2026-11-03, findings M1, M2, L5)
--
-- M1 stock_alerts: `stock_alerts_manage_branch` was FOR ALL, so any staff
--    account could INSERT a fake alert (the definer trigger
--    stock_alerts_to_notifications turns it into a merchant notification and
--    an Expo push) or resolve/delete real ones. The only writer is
--    src/lib/inventory/stock-alerts-service.ts with the SERVICE ROLE. Clients
--    now SELECT only, with the same branch scoping as before.
-- M2 presell_stock: "Admins manage own-tenant rows" was FOR ALL with no guard,
--    so staff could rewrite sold_qty / stock_qty. The only writer is
--    syncPresellAllocationsAction (src/app/actions/presell.ts): `menu` is
--    checked, then the SERVICE ROLE writes; sales go through the service-role
--    RPC apply_presell_order. Clients now SELECT only.
-- L5 inventory_audit_log: the client insert needed no permission. The only
--    client writer is auditManualMovement (stock-audit-service.ts), right after
--    the caller's own manual movement, which already needs `inventory`. Now:
--    `inventory`, outcome 'applied', the branch inside the store, and a
--    "suspected duplicate" flag only when this account really recorded two
--    movements in this store within the last 15 minutes (the web flags at 10).
--
-- TRUNCATE (which RLS does not cover) is also taken back from the API roles on
-- these tables and the other inventory tables that still carried it.
-- Runner: tests/sql/run-inventory-permission-hardening.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- M1 stock_alerts: read-only for clients.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on table public.stock_alerts from anon, authenticated;

drop policy if exists stock_alerts_manage_branch on public.stock_alerts;
drop policy if exists stock_alerts_select_branch on public.stock_alerts;
create policy stock_alerts_select_branch on public.stock_alerts
  for select to authenticated
  using (
    exists (
      select 1 from public.app_users au
       where au.user_id = auth.uid()
         and au.tenant_id = stock_alerts.tenant_id
         and au.role = any (array['admin', 'superadmin'])
    )
    and (outlet_id is null or public.app_user_may_reach_branch(tenant_id, outlet_id))
  );

drop policy if exists "Superadmins manage all rows" on public.stock_alerts;
drop policy if exists stock_alerts_select_superadmin on public.stock_alerts;
create policy stock_alerts_select_superadmin on public.stock_alerts
  for select to authenticated
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));

-- ---------------------------------------------------------------------------
-- M2 presell_stock: read-only for clients.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on table public.presell_stock from anon, authenticated;

drop policy if exists "Admins manage own-tenant rows" on public.presell_stock;
drop policy if exists presell_stock_select_member on public.presell_stock;
create policy presell_stock_select_member on public.presell_stock
  for select to authenticated
  using (
    tenant_id in (
      select au.tenant_id from public.app_users au
       where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])
    )
  );

drop policy if exists "Superadmins manage all rows" on public.presell_stock;
drop policy if exists presell_stock_select_superadmin on public.presell_stock;
create policy presell_stock_select_superadmin on public.presell_stock
  for select to authenticated
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));

-- ---------------------------------------------------------------------------
-- L5 inventory_audit_log: client inserts need `inventory` and cannot forge an
-- outcome, a foreign branch or a duplicate flag.
-- ---------------------------------------------------------------------------

-- Branch belongs to the store. Definer so the answer does not depend on who
-- may read `outlets`; it says only whether that pair exists.
create or replace function public.inventory_outlet_in_tenant(p_tenant_id uuid, p_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_outlet_id is null
      or exists (select 1 from public.outlets o where o.id = p_outlet_id and o.tenant_id = p_tenant_id);
$$;

revoke all on function public.inventory_outlet_in_tenant(uuid, uuid) from public, anon;
grant execute on function public.inventory_outlet_in_tenant(uuid, uuid) to authenticated, service_role;

-- How many stock movements (capped at 2) the CALLER wrote in this store in the
-- last 15 minutes. Invoker: it reads only rows the caller may already see.
create or replace function public.inventory_recent_own_movements(p_tenant_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
    from (
      select 1
        from public.stock_movements m
       where m.tenant_id = p_tenant_id
         and m.created_by = auth.uid()
         and m.created_at > now() - interval '15 minutes'
       limit 2
    ) recent;
$$;

revoke all on function public.inventory_recent_own_movements(uuid) from public, anon;
grant execute on function public.inventory_recent_own_movements(uuid) to authenticated, service_role;

drop policy if exists inventory_audit_log_insert_branch on public.inventory_audit_log;
create policy inventory_audit_log_insert_branch on public.inventory_audit_log
  for insert to authenticated
  with check (
    public.app_user_may_reach_branch(tenant_id, outlet_id)
    and public.app_user_has_permission(tenant_id, 'inventory')
    and actor_user_id = auth.uid()
    and event = 'manual_movement'
    and outcome = 'applied'
    and order_id is null
    and public.inventory_outlet_in_tenant(tenant_id, outlet_id)
    and (not is_suspected_duplicate or public.inventory_recent_own_movements(tenant_id) >= 2)
  );

-- ---------------------------------------------------------------------------
-- TRUNCATE bypasses RLS; no API role needs it on an inventory table.
-- ---------------------------------------------------------------------------
revoke truncate on table public.inventory_counts from anon, authenticated;
revoke truncate on table public.merchant_notifications from anon, authenticated;
