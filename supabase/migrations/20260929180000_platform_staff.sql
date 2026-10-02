-- Platform staff: limited superadmin-console accounts.
--
-- A new role, NOT a flavour of 'superadmin'. 107 RLS policies (and the
-- tenant privileged-column guard) grant everything to `role = 'superadmin'`,
-- so a restricted account that kept that role would be restricted only in the
-- UI — one PostgREST call from the browser console would delete a tenant.
-- 'platform_staff' matches none of those policies, so it starts with NOTHING;
-- the policies below open exactly the verbs each account was granted.
--
-- Grants live in app_users.platform_permissions as 'section.action' strings
-- (registry: src/lib/platform-staff/permissions.ts). NULL = no access.
-- app_users has no write policy for `authenticated`, so an account cannot
-- widen its own grants; only the service role (superadmin Team page) writes.

-- 1. Role + grants column ---------------------------------------------------

alter table public.app_users drop constraint if exists app_users_role_ck;
alter table public.app_users
  add constraint app_users_role_ck
  check (role = any (array['superadmin'::text, 'admin'::text, 'platform_staff'::text]));

alter table public.app_users
  add column if not exists platform_permissions text[];

comment on column public.app_users.platform_permissions is
  'platform_staff only: section.action grants (e.g. tenants.view, stores.edit). NULL = no access.';

-- Platform staff belong to no store: no tenant, no ownership, no branch.
alter table public.app_users drop constraint if exists app_users_platform_staff_shape_ck;
alter table public.app_users
  add constraint app_users_platform_staff_shape_ck
  check (
    role <> 'platform_staff'
    or (tenant_id is null and is_owner = false and outlet_id is null)
  );

alter table public.app_users drop constraint if exists app_users_platform_permissions_ck;
alter table public.app_users
  add constraint app_users_platform_permissions_ck
  check (platform_permissions is null or role = 'platform_staff');

-- 2. The one check every policy below uses ---------------------------------

-- True when the caller is platform staff holding ANY of the given grants.
-- SECURITY DEFINER so policies on other tables never recurse into app_users
-- RLS; it reads only the caller's own row.
create or replace function public.app_user_platform_can(p_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and au.role = 'platform_staff'
      and au.platform_permissions && p_permissions
  );
$$;

revoke all on function public.app_user_platform_can(text[]) from public, anon;
grant execute on function public.app_user_platform_can(text[]) to authenticated;

-- 3. Store-dashboard data ---------------------------------------------------
--
-- For each store table: the verbs superadmins hold on it today (never more),
-- each mapped to its stores.* grant. SELECT is also open to the console
-- overview/restaurant viewers, whose dashboards aggregate these rows — except
-- for tables holding customer personal data, which need stores.view itself.
--
-- Deliberately absent: tenant_secrets, facebook_pages (page tokens),
-- push_tokens (device tokens), mcp_* (API credentials), and every platform
-- table (leads, announcements, university, releases) — those are reached only
-- through server actions that check the grant and use the service role.

do $$
declare
  store_tables constant text[][] := array[
    -- table, verbs superadmin holds (r=select a=insert w=update d=delete), pii
    array['addon_library', 'rawd', 'no'],
    array['analytics_events', 'rawd', 'no'],
    array['bundle_slot_price_overrides', 'rawd', 'no'],
    array['bundle_slots', 'rawd', 'no'],
    array['bundles', 'rawd', 'no'],
    array['categories', 'rawd', 'no'],
    array['complementary_pairs', 'rawd', 'no'],
    array['customer_external_orders', 'rawd', 'yes'],
    array['customer_form_fields', 'rawd', 'no'],
    array['customers', 'rawd', 'yes'],
    array['daily_stats', 'rawd', 'no'],
    array['dining_tables', 'rawd', 'no'],
    array['inventory_audit_log', 'r', 'no'],
    array['inventory_counts', 'rawd', 'no'],
    array['inventory_items', 'rawd', 'no'],
    array['inventory_stock', 'rawd', 'no'],
    array['inventory_units', 'rawd', 'no'],
    array['loyverse_item_map', 'rawd', 'no'],
    array['menu_item_tags', 'rawd', 'no'],
    array['menu_items', 'rawd', 'no'],
    array['modifier_group_library', 'rawd', 'no'],
    array['order_items', 'rawd', 'no'],
    array['order_payments', 'raw', 'no'],
    array['order_revisions', 'raw', 'no'],
    array['order_status_events', 'r', 'no'],
    array['order_stock_applications', 'rawd', 'no'],
    array['order_type_item_prices', 'rawd', 'no'],
    array['order_types', 'rawd', 'no'],
    array['orders', 'raw', 'no'],
    array['outlet_menu_items', 'rawd', 'no'],
    array['outlets', 'rawd', 'no'],
    array['pairing_rules', 'rawd', 'no'],
    array['payment_method_order_types', 'rawd', 'no'],
    array['payment_methods', 'rawd', 'no'],
    array['presell_stock', 'rawd', 'no'],
    array['presell_stock_applications', 'r', 'no'],
    array['product_analytics', 'rawd', 'no'],
    array['product_costs', 'rawd', 'no'],
    array['product_detail_settings', 'rawd', 'no'],
    array['recipe_components', 'rawd', 'no'],
    array['recipes', 'rawd', 'no'],
    array['sms_campaign_runs', 'rawd', 'yes'],
    array['sms_campaigns', 'rawd', 'no'],
    array['sms_sends', 'rawd', 'yes'],
    array['sms_suppressions', 'rawd', 'yes'],
    array['stock_alerts', 'rawd', 'no'],
    array['stock_movements', 'ra', 'no'],
    array['stock_transfer_lines', 'rawd', 'no'],
    array['stock_transfers', 'rawd', 'no'],
    array['table_seatings', 'rawd', 'no'],
    array['tag_definitions', 'rawd', 'no'],
    array['upsell_pairs', 'rawd', 'no'],
    array['voucher_redemptions', 'rawd', 'yes'],
    array['voucher_targets', 'rawd', 'no'],
    array['vouchers', 'rawd', 'no']
  ];
  entry text[];
  tbl text;
  verbs text;
  read_grants text;
begin
  foreach entry slice 1 in array store_tables loop
    tbl := entry[1];
    verbs := entry[2];
    read_grants := case when entry[3] = 'yes'
      then $g$array['stores.view']$g$
      else $g$array['stores.view','tenants.view','overview.view']$g$
    end;

    if to_regclass(format('public.%I', tbl)) is null then
      raise notice 'platform_staff: skipping missing table %', tbl;
      continue;
    end if;

    execute format('drop policy if exists platform_staff_select on public.%I', tbl);
    execute format('drop policy if exists platform_staff_insert on public.%I', tbl);
    execute format('drop policy if exists platform_staff_update on public.%I', tbl);
    execute format('drop policy if exists platform_staff_delete on public.%I', tbl);

    if position('r' in verbs) > 0 then
      execute format(
        'create policy platform_staff_select on public.%I for select to authenticated using ((select public.app_user_platform_can(%s)))',
        tbl, read_grants);
    end if;
    if position('a' in verbs) > 0 then
      execute format(
        $p$create policy platform_staff_insert on public.%I for insert to authenticated with check ((select public.app_user_platform_can(array['stores.create'])))$p$,
        tbl);
    end if;
    if position('w' in verbs) > 0 then
      execute format(
        $p$create policy platform_staff_update on public.%I for update to authenticated using ((select public.app_user_platform_can(array['stores.edit']))) with check ((select public.app_user_platform_can(array['stores.edit'])))$p$,
        tbl);
    end if;
    if position('d' in verbs) > 0 then
      execute format(
        $p$create policy platform_staff_delete on public.%I for delete to authenticated using ((select public.app_user_platform_can(array['stores.delete'])))$p$,
        tbl);
    end if;
  end loop;
end $$;

-- 4. Platform tables that store dashboards and console lists read ----------

-- Restaurants: readable by any viewer of the console lists or a store
-- dashboard; editable (non-privileged columns — branding, hours, contact) with
-- stores.edit. The privileged-column guard still refuses feature flags,
-- domains and backends for anyone but a superadmin; console edits of those go
-- through server actions that check tenants.edit.
drop policy if exists platform_staff_select on public.tenants;
create policy platform_staff_select on public.tenants
  for select to authenticated
  using ((select public.app_user_platform_can(array['stores.view','tenants.view','overview.view','subscriptions.view'])));

drop policy if exists platform_staff_update on public.tenants;
create policy platform_staff_update on public.tenants
  for update to authenticated
  using ((select public.app_user_platform_can(array['stores.edit'])))
  with check ((select public.app_user_platform_can(array['stores.edit'])));

drop policy if exists platform_staff_select on public.tenant_subscriptions;
create policy platform_staff_select on public.tenant_subscriptions
  for select to authenticated
  using ((select public.app_user_platform_can(array['subscriptions.view','tenants.view','overview.view'])));

drop policy if exists platform_staff_select on public.subscription_payments;
create policy platform_staff_select on public.subscription_payments
  for select to authenticated
  using ((select public.app_user_platform_can(array['subscriptions.view'])));
