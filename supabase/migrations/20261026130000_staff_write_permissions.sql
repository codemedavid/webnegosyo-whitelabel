-- Staff writes need the staff permission that owns the data (security review 2026-10-26)
--
-- HIGH, confirmed live: 26 tables had write policies (mostly FOR ALL) that only
-- asked "is this an admin of the store?". A staff account is role 'admin' with
-- a `permissions` list, so 58 limited accounts (a cashier with only `pos`, a
-- kitchen screen with only `kitchen`) could PATCH GCash numbers, prices, branch
-- details or the store row straight through PostgREST, whatever the screens
-- allowed.
--
-- What changes
--   * Every write policy now asks `app_user_has_permission(tenant, key)` (owner,
--     legacy full access `permissions IS NULL`, the key, or a superadmin).
--     It already contains the tenant-membership check.
--   * FOR ALL policies also granted SELECT. Each is split: an identical SELECT
--     policy is recreated where nothing else already grants the same rows, and
--     INSERT / UPDATE / DELETE become separate policies TO authenticated.
--     Anonymous reads (storefront, checkout) are untouched.
--   * Tables written only by the service role (Boost, Loyverse sync, analytics
--     fan-out, tenant secrets) keep staff SELECT but allow client writes from
--     superadmins only.
--   * platform_staff_* policies and the service role are untouched.
--
--   menu_items                                   menu OR analytics (Boost writes featured/badges/checkout picks)
--   categories                                   menu
--   payment_methods, payment_method_order_types,
--   order_types, order_type_item_prices,
--   customer_form_fields, product_detail_settings store_setup
--   upsell_pairs                                 analytics
--   product_costs                                costs
--   outlet_menu_items                            (menu OR store_setup) AND the account reaches that branch
--   outlets                                      store_setup on a store-wide account
--   tenants (UPDATE)                             store_setup OR settings OR analytics (privileged-column guard trigger stays)
--   push_tokens                                  own token; a branch-locked account only for its own branch
--   tenant_secrets, bundles, bundle_slots,
--   bundle_slot_price_overrides, complementary_pairs,
--   pairing_rules, tag_definitions, menu_item_tags,
--   loyverse_item_map, analytics_events,
--   daily_stats, product_analytics               superadmin only
--
-- Also
--   * get_customer_order(uuid) returned every orders column (phone, address,
--     Senior/PWD claimant IDs) to anon. It now returns the five display columns.
--   * app_signup_requests: the anon/authenticated INSERT policy is dropped (no
--     code writes it; the sign-up flow was removed). Rows are kept.
--   * facebook_pages: one ACTIVE connection per Page across all stores.
--   * Advisor: search_path on apply_presell_order / tenant_secrets_touch_updated_at;
--     the trigger function recipe_components_unit_guard is not callable by API roles.
--
-- Deliberately NOT changed
--   * reporting.has_table / method_key / trim_text / fold_name / cents /
--     discount_payload: IMMUTABLE one-line SQL functions in the non-exposed
--     `reporting` schema, called per row by the report RPCs. A SET clause stops
--     Postgres inlining them, which would slow every report on a shared DB that
--     report reads already took down once (2026-10-14). They qualify every
--     non-catalog name, so a mutable search_path cannot redirect them.
--   * app_user_holds_any_permission keeps its anon EXECUTE: orders_select_by_tenant
--     (roles public) calls it, so anon evaluates it at checkout (INSERT ... RETURNING).
--
-- Rollback: supabase/rollbacks/20261026130000_staff_write_permissions.down.sql

-- ---------------------------------------------------------------------------
-- 1. Tenant-keyed tables: SELECT kept, writes need the key
-- ---------------------------------------------------------------------------

-- menu_items -----------------------------------------------------------------
drop policy if exists menu_items_write_admin on public.menu_items;
create policy menu_items_select_admin on public.menu_items for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = menu_items.tenant_id))));
create policy menu_items_insert_staff on public.menu_items for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'menu') or public.app_user_has_permission(tenant_id, 'analytics'));
create policy menu_items_update_staff on public.menu_items for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu') or public.app_user_has_permission(tenant_id, 'analytics'))
  with check (public.app_user_has_permission(tenant_id, 'menu') or public.app_user_has_permission(tenant_id, 'analytics'));
create policy menu_items_delete_staff on public.menu_items for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu') or public.app_user_has_permission(tenant_id, 'analytics'));

-- categories -----------------------------------------------------------------
drop policy if exists categories_write_admin on public.categories;
create policy categories_select_admin on public.categories for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = categories.tenant_id))));
create policy categories_insert_staff on public.categories for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'menu'));
create policy categories_update_staff on public.categories for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu'))
  with check (public.app_user_has_permission(tenant_id, 'menu'));
create policy categories_delete_staff on public.categories for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu'));

-- payment_methods ------------------------------------------------------------
drop policy if exists payment_methods_write_admin on public.payment_methods;
create policy payment_methods_select_admin on public.payment_methods for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = payment_methods.tenant_id))));
create policy payment_methods_insert_staff on public.payment_methods for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy payment_methods_update_staff on public.payment_methods for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'))
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy payment_methods_delete_staff on public.payment_methods for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'));

-- payment_method_order_types (no tenant_id: the store is the payment method's) --
drop policy if exists payment_method_order_types_write_admin on public.payment_method_order_types;
create policy payment_method_order_types_select_admin on public.payment_method_order_types for select
  using (exists (select 1 from public.payment_methods pm
    where pm.id = payment_method_order_types.payment_method_id
      and exists (select 1 from public.app_users au where au.user_id = auth.uid()
        and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = pm.tenant_id)))));
create policy payment_method_order_types_insert_staff on public.payment_method_order_types for insert to authenticated
  with check (exists (select 1 from public.payment_methods pm
    where pm.id = payment_method_order_types.payment_method_id
      and public.app_user_has_permission(pm.tenant_id, 'store_setup')));
create policy payment_method_order_types_update_staff on public.payment_method_order_types for update to authenticated
  using (exists (select 1 from public.payment_methods pm
    where pm.id = payment_method_order_types.payment_method_id
      and public.app_user_has_permission(pm.tenant_id, 'store_setup')))
  with check (exists (select 1 from public.payment_methods pm
    where pm.id = payment_method_order_types.payment_method_id
      and public.app_user_has_permission(pm.tenant_id, 'store_setup')));
create policy payment_method_order_types_delete_staff on public.payment_method_order_types for delete to authenticated
  using (exists (select 1 from public.payment_methods pm
    where pm.id = payment_method_order_types.payment_method_id
      and public.app_user_has_permission(pm.tenant_id, 'store_setup')));

-- order_types ----------------------------------------------------------------
drop policy if exists order_types_write_admin on public.order_types;
create policy order_types_select_admin on public.order_types for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = order_types.tenant_id))));
create policy order_types_insert_staff on public.order_types for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy order_types_update_staff on public.order_types for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'))
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy order_types_delete_staff on public.order_types for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'));

-- order_type_item_prices (SELECT stays: order_type_item_prices_select_public = true) --
drop policy if exists order_type_item_prices_write_admin on public.order_type_item_prices;
create policy order_type_item_prices_insert_staff on public.order_type_item_prices for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy order_type_item_prices_update_staff on public.order_type_item_prices for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'))
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy order_type_item_prices_delete_staff on public.order_type_item_prices for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'));

-- customer_form_fields -------------------------------------------------------
drop policy if exists customer_form_fields_write_admin on public.customer_form_fields;
create policy customer_form_fields_select_admin on public.customer_form_fields for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = customer_form_fields.tenant_id))));
create policy customer_form_fields_insert_staff on public.customer_form_fields for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy customer_form_fields_update_staff on public.customer_form_fields for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'))
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy customer_form_fields_delete_staff on public.customer_form_fields for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'));

-- product_detail_settings (SELECT stays: public_read_settings = true) --------
drop policy if exists tenant_admins_manage_settings on public.product_detail_settings;
create policy product_detail_settings_insert_staff on public.product_detail_settings for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy product_detail_settings_update_staff on public.product_detail_settings for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'))
  with check (public.app_user_has_permission(tenant_id, 'store_setup'));
create policy product_detail_settings_delete_staff on public.product_detail_settings for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup'));

-- upsell_pairs ---------------------------------------------------------------
drop policy if exists "Admins can manage upsell pairs" on public.upsell_pairs;
create policy upsell_pairs_select_admin on public.upsell_pairs for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = upsell_pairs.tenant_id))));
create policy upsell_pairs_insert_staff on public.upsell_pairs for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'analytics'));
create policy upsell_pairs_update_staff on public.upsell_pairs for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'analytics'))
  with check (public.app_user_has_permission(tenant_id, 'analytics'));
create policy upsell_pairs_delete_staff on public.upsell_pairs for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'analytics'));

-- product_costs (SELECT stays: product_costs_select_by_tenant is the same rule) --
drop policy if exists product_costs_write_admin on public.product_costs;
create policy product_costs_insert_staff on public.product_costs for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'costs'));
create policy product_costs_update_staff on public.product_costs for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'costs'))
  with check (public.app_user_has_permission(tenant_id, 'costs'));
create policy product_costs_delete_staff on public.product_costs for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'costs'));

-- outlet_menu_items (SELECT stays: outlet_menu_items_select_public = true) ---
-- A superadmin has no tenant_id, so app_user_may_reach_branch is false for them.
drop policy if exists outlet_menu_items_write_admin on public.outlet_menu_items;
create policy outlet_menu_items_insert_staff on public.outlet_menu_items for insert to authenticated
  with check (
    (public.app_user_has_permission(tenant_id, 'menu') or public.app_user_has_permission(tenant_id, 'store_setup'))
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, outlet_id)));
create policy outlet_menu_items_update_staff on public.outlet_menu_items for update to authenticated
  using (
    (public.app_user_has_permission(tenant_id, 'menu') or public.app_user_has_permission(tenant_id, 'store_setup'))
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, outlet_id)))
  with check (
    (public.app_user_has_permission(tenant_id, 'menu') or public.app_user_has_permission(tenant_id, 'store_setup'))
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, outlet_id)));
create policy outlet_menu_items_delete_staff on public.outlet_menu_items for delete to authenticated
  using (
    (public.app_user_has_permission(tenant_id, 'menu') or public.app_user_has_permission(tenant_id, 'store_setup'))
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, outlet_id)));

-- outlets (SELECT stays: outlets_select_public = true) -----------------------
-- may_reach_branch(tenant, NULL) = a store-wide account (or the owner).
drop policy if exists outlets_write_admin on public.outlets;
create policy outlets_insert_staff on public.outlets for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'store_setup')
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, null)));
create policy outlets_update_staff on public.outlets for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup')
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, null)))
  with check (public.app_user_has_permission(tenant_id, 'store_setup')
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, null)));
create policy outlets_delete_staff on public.outlets for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'store_setup')
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, null)));

-- tenants (UPDATE only; tenants_write_superadmin and the column guard stay) --
drop policy if exists tenants_write_admin on public.tenants;
create policy tenants_update_staff on public.tenants for update to authenticated
  using (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']))
  with check (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']));

-- push_tokens: own token; a branch-locked account files tokens only for its
-- own branch (outlet_id NULL = every branch's alerts). USING keeps the old rule
-- so a stale row can still be corrected or deleted by its owner.
drop policy if exists push_tokens_insert_own on public.push_tokens;
drop policy if exists push_tokens_update_own on public.push_tokens;
create policy push_tokens_insert_own on public.push_tokens for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.app_users au where au.user_id = auth.uid()
      and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id)))
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, outlet_id)));
create policy push_tokens_update_own on public.push_tokens for update to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.app_users au where au.user_id = auth.uid()
      and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id))))
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.app_users au where au.user_id = auth.uid()
      and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id)))
    and (public.app_user_is_superadmin() or public.app_user_may_reach_branch(tenant_id, outlet_id)));

-- ---------------------------------------------------------------------------
-- 2. Service-role-written tables: staff keep SELECT, client writes superadmin only
-- ---------------------------------------------------------------------------

-- tenant_secrets: tenant_secrets_admin_select and tenant_secrets_superadmin_all stay.
drop policy if exists tenant_secrets_admin_insert on public.tenant_secrets;
drop policy if exists tenant_secrets_admin_update on public.tenant_secrets;

-- bundles
drop policy if exists bundles_admin_all on public.bundles;
create policy bundles_select_admin on public.bundles for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = bundles.tenant_id))));
create policy bundles_write_superadmin on public.bundles for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- bundle_slots (SELECT stays: bundle_slots_public_read = true)
drop policy if exists bundle_slots_admin_all on public.bundle_slots;
create policy bundle_slots_write_superadmin on public.bundle_slots for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- bundle_slot_price_overrides (SELECT stays: bundle_overrides_public_read = true)
drop policy if exists bundle_overrides_admin_all on public.bundle_slot_price_overrides;
create policy bundle_overrides_write_superadmin on public.bundle_slot_price_overrides for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- complementary_pairs
drop policy if exists complementary_pairs_admin_all on public.complementary_pairs;
create policy complementary_pairs_select_admin on public.complementary_pairs for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = complementary_pairs.tenant_id))));
create policy complementary_pairs_write_superadmin on public.complementary_pairs for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- pairing_rules (SELECT stays: pairing_rules_public_read = true)
drop policy if exists pairing_rules_admin_all on public.pairing_rules;
create policy pairing_rules_write_superadmin on public.pairing_rules for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- tag_definitions (SELECT stays: tag_definitions_public_read = true)
drop policy if exists tag_definitions_admin_all on public.tag_definitions;
create policy tag_definitions_write_superadmin on public.tag_definitions for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- menu_item_tags (SELECT stays: menu_item_tags_public_read = true)
drop policy if exists menu_item_tags_admin_all on public.menu_item_tags;
create policy menu_item_tags_write_superadmin on public.menu_item_tags for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- loyverse_item_map
drop policy if exists loyverse_item_map_rw_admin on public.loyverse_item_map;
create policy loyverse_item_map_select_admin on public.loyverse_item_map for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
    and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = loyverse_item_map.tenant_id))));
create policy loyverse_item_map_write_superadmin on public.loyverse_item_map for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- analytics_events / daily_stats / product_analytics (their *_select_by_tenant
-- policies already grant the same rows the FOR ALL policy did)
drop policy if exists analytics_events_write_admin on public.analytics_events;
create policy analytics_events_write_superadmin on public.analytics_events for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

drop policy if exists daily_stats_write_admin on public.daily_stats;
create policy daily_stats_write_superadmin on public.daily_stats for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

drop policy if exists product_analytics_write_admin on public.product_analytics;
create policy product_analytics_write_superadmin on public.product_analytics for all to authenticated
  using (public.app_user_is_superadmin()) with check (public.app_user_is_superadmin());

-- ---------------------------------------------------------------------------
-- 3. get_customer_order: the order's display fields only
-- ---------------------------------------------------------------------------
drop function if exists public.get_customer_order(uuid);
create function public.get_customer_order(p_order_id uuid)
returns table (id uuid, status text, daily_number integer, total numeric, customer_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id, o.status, o.daily_number, o.total, o.customer_name
    from public.orders o
   where o.id = p_order_id;
$$;
comment on function public.get_customer_order(uuid) is
  'Anonymous order-status read for the customer app: the order uuid is the capability. Display fields only, never contact details or claimant IDs.';
revoke all on function public.get_customer_order(uuid) from public, anon, authenticated;
grant execute on function public.get_customer_order(uuid) to anon, service_role;

-- ---------------------------------------------------------------------------
-- 4. Smaller fixes
-- ---------------------------------------------------------------------------
drop policy if exists "anyone can submit signup request" on public.app_signup_requests;

create unique index if not exists facebook_pages_active_page_id_key
  on public.facebook_pages (page_id) where is_active;

alter function public.apply_presell_order(uuid, text, text, jsonb) set search_path = public, pg_temp;
alter function public.tenant_secrets_touch_updated_at() set search_path = '';
revoke execute on function public.recipe_components_unit_guard() from public, anon, authenticated;

