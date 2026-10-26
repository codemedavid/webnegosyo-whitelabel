-- Rollback for 20261026130000_staff_write_permissions.sql
--
-- Restores the policies, function and grants EXACTLY as the live platform DB
-- had them on 2026-10-26 (pg_policies / pg_get_functiondef), including the
-- staff-write hole the migration closed. Run only to recover from a regression.
-- Not a migration: apply by hand (Supabase MCP execute_sql / psql) in one transaction.

begin;

-- 1. Drop everything the migration created --------------------------------------
drop policy if exists menu_items_select_admin on public.menu_items;
drop policy if exists menu_items_insert_staff on public.menu_items;
drop policy if exists menu_items_update_staff on public.menu_items;
drop policy if exists menu_items_delete_staff on public.menu_items;
drop policy if exists categories_select_admin on public.categories;
drop policy if exists categories_insert_staff on public.categories;
drop policy if exists categories_update_staff on public.categories;
drop policy if exists categories_delete_staff on public.categories;
drop policy if exists payment_methods_select_admin on public.payment_methods;
drop policy if exists payment_methods_insert_staff on public.payment_methods;
drop policy if exists payment_methods_update_staff on public.payment_methods;
drop policy if exists payment_methods_delete_staff on public.payment_methods;
drop policy if exists payment_method_order_types_select_admin on public.payment_method_order_types;
drop policy if exists payment_method_order_types_insert_staff on public.payment_method_order_types;
drop policy if exists payment_method_order_types_update_staff on public.payment_method_order_types;
drop policy if exists payment_method_order_types_delete_staff on public.payment_method_order_types;
drop policy if exists order_types_select_admin on public.order_types;
drop policy if exists order_types_insert_staff on public.order_types;
drop policy if exists order_types_update_staff on public.order_types;
drop policy if exists order_types_delete_staff on public.order_types;
drop policy if exists order_type_item_prices_insert_staff on public.order_type_item_prices;
drop policy if exists order_type_item_prices_update_staff on public.order_type_item_prices;
drop policy if exists order_type_item_prices_delete_staff on public.order_type_item_prices;
drop policy if exists customer_form_fields_select_admin on public.customer_form_fields;
drop policy if exists customer_form_fields_insert_staff on public.customer_form_fields;
drop policy if exists customer_form_fields_update_staff on public.customer_form_fields;
drop policy if exists customer_form_fields_delete_staff on public.customer_form_fields;
drop policy if exists product_detail_settings_insert_staff on public.product_detail_settings;
drop policy if exists product_detail_settings_update_staff on public.product_detail_settings;
drop policy if exists product_detail_settings_delete_staff on public.product_detail_settings;
drop policy if exists upsell_pairs_select_admin on public.upsell_pairs;
drop policy if exists upsell_pairs_insert_staff on public.upsell_pairs;
drop policy if exists upsell_pairs_update_staff on public.upsell_pairs;
drop policy if exists upsell_pairs_delete_staff on public.upsell_pairs;
drop policy if exists product_costs_insert_staff on public.product_costs;
drop policy if exists product_costs_update_staff on public.product_costs;
drop policy if exists product_costs_delete_staff on public.product_costs;
drop policy if exists outlet_menu_items_insert_staff on public.outlet_menu_items;
drop policy if exists outlet_menu_items_update_staff on public.outlet_menu_items;
drop policy if exists outlet_menu_items_delete_staff on public.outlet_menu_items;
drop policy if exists outlets_insert_staff on public.outlets;
drop policy if exists outlets_update_staff on public.outlets;
drop policy if exists outlets_delete_staff on public.outlets;
drop policy if exists tenants_update_staff on public.tenants;
drop policy if exists push_tokens_insert_own on public.push_tokens;
drop policy if exists push_tokens_update_own on public.push_tokens;
drop policy if exists bundles_select_admin on public.bundles;
drop policy if exists bundles_write_superadmin on public.bundles;
drop policy if exists bundle_slots_write_superadmin on public.bundle_slots;
drop policy if exists bundle_overrides_write_superadmin on public.bundle_slot_price_overrides;
drop policy if exists complementary_pairs_select_admin on public.complementary_pairs;
drop policy if exists complementary_pairs_write_superadmin on public.complementary_pairs;
drop policy if exists pairing_rules_write_superadmin on public.pairing_rules;
drop policy if exists tag_definitions_write_superadmin on public.tag_definitions;
drop policy if exists menu_item_tags_write_superadmin on public.menu_item_tags;
drop policy if exists loyverse_item_map_select_admin on public.loyverse_item_map;
drop policy if exists loyverse_item_map_write_superadmin on public.loyverse_item_map;
drop policy if exists analytics_events_write_superadmin on public.analytics_events;
drop policy if exists daily_stats_write_superadmin on public.daily_stats;
drop policy if exists product_analytics_write_superadmin on public.product_analytics;

-- 2. Recreate the live policies of 2026-10-26 ------------------------------------
create policy menu_items_write_admin on public.menu_items for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = menu_items.tenant_id))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = menu_items.tenant_id))));
create policy categories_write_admin on public.categories for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = categories.tenant_id))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = categories.tenant_id))));
create policy payment_methods_write_admin on public.payment_methods for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = payment_methods.tenant_id))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = payment_methods.tenant_id))));
create policy payment_method_order_types_write_admin on public.payment_method_order_types for all
  using (exists (select 1 from payment_methods pm where pm.id = payment_method_order_types.payment_method_id and exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = pm.tenant_id)))))
  with check (exists (select 1 from payment_methods pm where pm.id = payment_method_order_types.payment_method_id and exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = pm.tenant_id)))));
create policy order_types_write_admin on public.order_types for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = order_types.tenant_id))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = order_types.tenant_id))));
create policy order_type_item_prices_write_admin on public.order_type_item_prices for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = order_type_item_prices.tenant_id))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = order_type_item_prices.tenant_id))));
create policy customer_form_fields_write_admin on public.customer_form_fields for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = customer_form_fields.tenant_id))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = customer_form_fields.tenant_id))));
create policy tenant_admins_manage_settings on public.product_detail_settings for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = product_detail_settings.tenant_id))));
create policy "Admins can manage upsell pairs" on public.upsell_pairs for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = upsell_pairs.tenant_id))));
create policy product_costs_write_admin on public.product_costs for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = product_costs.tenant_id))));
create policy outlet_menu_items_write_admin on public.outlet_menu_items for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = outlet_menu_items.tenant_id and (au.outlet_id is null or au.outlet_id = outlet_menu_items.outlet_id)))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = outlet_menu_items.tenant_id and (au.outlet_id is null or au.outlet_id = outlet_menu_items.outlet_id)))));
create policy outlets_write_admin on public.outlets for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = outlets.tenant_id and au.outlet_id is null))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = outlets.tenant_id and au.outlet_id is null))));
create policy tenants_write_admin on public.tenants for update
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role = 'admin' and au.tenant_id = tenants.id))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role = 'admin' and au.tenant_id = tenants.id));
create policy push_tokens_insert_own on public.push_tokens for insert
  with check (user_id = auth.uid() and exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id))));
create policy push_tokens_update_own on public.push_tokens for update
  using (user_id = auth.uid() and exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id))))
  with check (user_id = auth.uid() and exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id))));
create policy tenant_secrets_admin_insert on public.tenant_secrets for insert to authenticated
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role = 'admin' and au.tenant_id = tenant_secrets.tenant_id));
create policy tenant_secrets_admin_update on public.tenant_secrets for update to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role = 'admin' and au.tenant_id = tenant_secrets.tenant_id))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role = 'admin' and au.tenant_id = tenant_secrets.tenant_id));
create policy bundles_admin_all on public.bundles for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = bundles.tenant_id))));
create policy bundle_slots_admin_all on public.bundle_slots for all
  using (exists (select 1 from (bundles b join app_users au on au.user_id = auth.uid()) where b.id = bundle_slots.bundle_id and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = b.tenant_id))));
create policy bundle_overrides_admin_all on public.bundle_slot_price_overrides for all
  using (exists (select 1 from ((bundle_slots bs join bundles b on b.id = bs.bundle_id) join app_users au on au.user_id = auth.uid()) where bs.id = bundle_slot_price_overrides.slot_id and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = b.tenant_id))));
create policy complementary_pairs_admin_all on public.complementary_pairs for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = complementary_pairs.tenant_id))));
create policy pairing_rules_admin_all on public.pairing_rules for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = pairing_rules.tenant_id))));
create policy tag_definitions_admin_all on public.tag_definitions for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tag_definitions.tenant_id))));
create policy menu_item_tags_admin_all on public.menu_item_tags for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = menu_item_tags.tenant_id))));
create policy loyverse_item_map_rw_admin on public.loyverse_item_map for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = loyverse_item_map.tenant_id))))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = loyverse_item_map.tenant_id))));
create policy analytics_events_write_admin on public.analytics_events for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = analytics_events.tenant_id))));
create policy daily_stats_write_admin on public.daily_stats for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = daily_stats.tenant_id))));
create policy product_analytics_write_admin on public.product_analytics for all
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = product_analytics.tenant_id))));

-- 3. get_customer_order as it was (every orders column) ---------------------------
drop function if exists public.get_customer_order(uuid);
create function public.get_customer_order(p_order_id uuid)
returns setof public.orders
language sql stable security definer
set search_path = public, pg_temp
as $$ select * from public.orders o where o.id = p_order_id; $$;
revoke all on function public.get_customer_order(uuid) from public, anon, authenticated;
grant execute on function public.get_customer_order(uuid) to anon, service_role;

-- 4. Smaller fixes ----------------------------------------------------------------
create policy "anyone can submit signup request" on public.app_signup_requests
  for insert to anon, authenticated with check (true);
drop index if exists public.facebook_pages_active_page_id_key;
alter function public.apply_presell_order(uuid, text, text, jsonb) reset search_path;
alter function public.tenant_secrets_touch_updated_at() reset search_path;
grant execute on function public.recipe_components_unit_guard() to public, anon, authenticated;

commit;
