// Stub of the live platform schema that 20261026130000_staff_write_permissions.sql
// rewrites: only the columns its policies read, the helper functions it calls
// (bodies copied VERBATIM from the live DB on 2026-10-26, SELECT only), and the
// write policies exactly as live had them before the migration.
//
// Every table carries a `note` column so a runner can attempt a harmless UPDATE.

const HELPERS = `
  create table app_users (
    user_id uuid primary key, tenant_id uuid, role text, is_owner boolean,
    permissions text[], outlet_id uuid, platform_permissions text[]
  );

  -- Live bodies (pg_get_functiondef, 2026-10-26).
  CREATE OR REPLACE FUNCTION public.app_user_has_permission(p_tenant_id uuid, p_permission text)
   RETURNS boolean
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $function$
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
               or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses']))
               or p_permission = any (au.permissions)
               -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
               or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
               or (p_permission = 'reports' and 'analytics' = any (au.permissions))
             )
           )
         )
    );
  $function$;

  CREATE OR REPLACE FUNCTION public.app_user_holds_any_permission(p_tenant_id uuid, p_keys text[])
   RETURNS boolean
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $function$
    select exists (
      select 1
        from unnest(p_keys) as key
       where public.app_user_has_permission(p_tenant_id, key)
    );
  $function$;

  CREATE OR REPLACE FUNCTION public.app_user_may_reach_branch(target_tenant_id uuid, target_outlet_id uuid)
   RETURNS boolean
   LANGUAGE sql
   STABLE
   SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1
        FROM app_users au
       WHERE au.user_id = auth.uid()
         AND au.tenant_id = target_tenant_id
         AND au.role = ANY (ARRAY['admin','superadmin'])
         AND (
           au.outlet_id IS NULL
           OR COALESCE(au.is_owner, false)
           OR au.outlet_id = target_outlet_id
         )
    );
  $function$;

  CREATE OR REPLACE FUNCTION public.app_user_admin_outlet_id()
   RETURNS uuid
   LANGUAGE sql
   STABLE
   SET search_path TO 'public'
  AS $function$
    select au.outlet_id from public.app_users au
    where au.user_id = auth.uid() and au.role = 'admin';
  $function$;

  CREATE OR REPLACE FUNCTION public.app_user_is_superadmin()
   RETURNS boolean
   LANGUAGE sql
   STABLE
   SET search_path TO 'public'
  AS $function$
    select exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and au.role = 'superadmin'
    );
  $function$;

  CREATE OR REPLACE FUNCTION public.app_user_platform_can(p_permissions text[])
   RETURNS boolean
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO 'public'
  AS $function$
    select exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.role = 'platform_staff'
        and au.platform_permissions && p_permissions
    );
  $function$;

  -- Live grants on the helpers.
  revoke all on function public.app_user_has_permission(uuid, text) from public, anon;
  grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;
`

const TABLES = `
  create table tenants (id uuid primary key, is_active boolean default true, note text);
  create table outlets (id uuid primary key, tenant_id uuid, note text);
  create table menu_items (id uuid primary key, tenant_id uuid, is_available boolean default true, note text);
  create table categories (id uuid primary key, tenant_id uuid, is_active boolean default true, note text);
  create table payment_methods (id uuid primary key, tenant_id uuid, is_active boolean default true, note text);
  create table order_types (id uuid primary key, tenant_id uuid, is_enabled boolean default true, note text);
  create table payment_method_order_types (id uuid primary key, payment_method_id uuid, order_type_id uuid, note text);
  create table order_type_item_prices (id uuid primary key, tenant_id uuid, note text);
  create table customer_form_fields (id uuid primary key, tenant_id uuid, order_type_id uuid, note text);
  create table product_detail_settings (id uuid primary key, tenant_id uuid, note text);
  create table upsell_pairs (id uuid primary key, tenant_id uuid, is_active boolean default true, note text);
  create table product_costs (id uuid primary key, tenant_id uuid, note text);
  create table outlet_menu_items (id uuid primary key, tenant_id uuid, outlet_id uuid, note text);
  create table push_tokens (id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
    token text, outlet_id uuid, note text, unique (tenant_id, token));
  create table tenant_secrets (id uuid primary key, tenant_id uuid unique, note text);
  create table bundles (id uuid primary key, tenant_id uuid, is_active boolean default true, note text);
  create table bundle_slots (id uuid primary key, bundle_id uuid, note text);
  create table bundle_slot_price_overrides (id uuid primary key, slot_id uuid, note text);
  create table complementary_pairs (id uuid primary key, tenant_id uuid, is_active boolean default true, note text);
  create table pairing_rules (id uuid primary key, tenant_id uuid, note text);
  create table tag_definitions (id uuid primary key, tenant_id uuid, note text);
  create table menu_item_tags (id uuid primary key, tenant_id uuid, note text);
  create table loyverse_item_map (id uuid primary key, tenant_id uuid, note text);
  create table analytics_events (id uuid primary key, tenant_id uuid, note text);
  create table daily_stats (id uuid primary key, tenant_id uuid, note text);
  create table product_analytics (id uuid primary key, tenant_id uuid, note text);
  create table orders (id uuid primary key, tenant_id uuid, status text, daily_number integer, total numeric,
    customer_name text, customer_contact text, customer_data jsonb, note text);
  create table facebook_pages (id uuid primary key, tenant_id uuid, page_id text, is_active boolean, note text,
    unique (tenant_id, page_id));
  create table app_signup_requests (id uuid primary key default gen_random_uuid(), email text);

  -- Functions the migration re-configures (signatures as live; bodies trimmed).
  create table presell_stock (tenant_id uuid);
  CREATE FUNCTION public.apply_presell_order(p_tenant_id uuid, p_order_id text, p_direction text, p_lines jsonb)
   RETURNS text LANGUAGE plpgsql AS $function$ BEGIN PERFORM 1 FROM presell_stock; RETURN 'applied'; END; $function$;
  revoke all on function public.apply_presell_order(uuid, text, text, jsonb) from public, anon, authenticated;
  CREATE FUNCTION public.tenant_secrets_touch_updated_at() RETURNS trigger LANGUAGE plpgsql
   AS $function$ begin return new; end $function$;
  CREATE FUNCTION public.recipe_components_unit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
   SET search_path TO '' AS $function$ begin return new; end $function$;
  grant execute on function public.recipe_components_unit_guard() to public;

  -- get_customer_order as live before the fix: every column of orders, anon only.
  CREATE FUNCTION public.get_customer_order(p_order_id uuid)
   RETURNS SETOF orders LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ select * from public.orders o where o.id = p_order_id; $function$;
  revoke all on function public.get_customer_order(uuid) from public, authenticated;
  grant execute on function public.get_customer_order(uuid) to anon, service_role;
`

// pg_policies on the live platform DB, 2026-10-26, for the tables above
// (platform_staff_* kept for menu_items only, to show they are untouched).
const member = (expr) => `(EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND ((au.role = 'superadmin'::text) OR ((au.role = 'admin'::text) AND (au.tenant_id = ${expr}))))))`

const forAll = (table, name, withCheck = true) =>
  `create policy "${name}" on ${table} for all using ${member(`${table}.tenant_id`)}${withCheck ? ` with check ${member(`${table}.tenant_id`)}` : ''};`

const PRE_POLICIES = `
  alter table tenants enable row level security;
  create policy tenants_read_active on tenants for select using (is_active = true);
  create policy tenants_write_admin on tenants for update
    using (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'admin'::text) AND (au.tenant_id = tenants.id))))
    with check (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'admin'::text) AND (au.tenant_id = tenants.id))));
  create policy tenants_write_superadmin on tenants for all
    using (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'superadmin'::text))))
    with check (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'superadmin'::text))));

  alter table menu_items enable row level security;
  create policy menu_items_read_available on menu_items for select using ((is_available = true) AND (EXISTS ( SELECT 1 FROM tenants t WHERE ((t.id = menu_items.tenant_id) AND (t.is_active = true)))));
  ${forAll('menu_items', 'menu_items_write_admin')}
  create policy platform_staff_update on menu_items for update to authenticated
    using (( SELECT app_user_platform_can(ARRAY['stores.edit'::text]) AS app_user_platform_can))
    with check (( SELECT app_user_platform_can(ARRAY['stores.edit'::text]) AS app_user_platform_can));
  create policy platform_staff_select on menu_items for select to authenticated
    using (( SELECT app_user_platform_can(ARRAY['stores.view'::text, 'tenants.view'::text, 'overview.view'::text]) AS app_user_platform_can));

  alter table categories enable row level security;
  create policy categories_read_active on categories for select using ((EXISTS ( SELECT 1 FROM tenants t WHERE ((t.id = categories.tenant_id) AND (t.is_active = true)))) AND (is_active = true));
  ${forAll('categories', 'categories_write_admin')}

  alter table payment_methods enable row level security;
  create policy payment_methods_read_active on payment_methods for select using ((is_active = true) AND (EXISTS ( SELECT 1 FROM tenants t WHERE ((t.id = payment_methods.tenant_id) AND (t.is_active = true)))));
  ${forAll('payment_methods', 'payment_methods_write_admin')}

  alter table order_types enable row level security;
  create policy order_types_read_active on order_types for select using ((is_enabled = true) AND (EXISTS ( SELECT 1 FROM tenants t WHERE ((t.id = order_types.tenant_id) AND (t.is_active = true)))));
  ${forAll('order_types', 'order_types_write_admin')}

  alter table payment_method_order_types enable row level security;
  create policy payment_method_order_types_read_active on payment_method_order_types for select using (EXISTS ( SELECT 1 FROM (payment_methods pm JOIN tenants t ON ((t.id = pm.tenant_id))) WHERE ((pm.id = payment_method_order_types.payment_method_id) AND (pm.is_active = true) AND (t.is_active = true))));
  create policy payment_method_order_types_write_admin on payment_method_order_types for all
    using (EXISTS ( SELECT 1 FROM payment_methods pm WHERE ((pm.id = payment_method_order_types.payment_method_id) AND ${member('pm.tenant_id')})))
    with check (EXISTS ( SELECT 1 FROM payment_methods pm WHERE ((pm.id = payment_method_order_types.payment_method_id) AND ${member('pm.tenant_id')})));

  alter table order_type_item_prices enable row level security;
  create policy order_type_item_prices_select_public on order_type_item_prices for select using (true);
  ${forAll('order_type_item_prices', 'order_type_item_prices_write_admin')}

  alter table customer_form_fields enable row level security;
  create policy customer_form_fields_read_active on customer_form_fields for select using (EXISTS ( SELECT 1 FROM (order_types ot JOIN tenants t ON ((t.id = ot.tenant_id))) WHERE ((ot.id = customer_form_fields.order_type_id) AND (ot.is_enabled = true) AND (t.is_active = true))));
  ${forAll('customer_form_fields', 'customer_form_fields_write_admin')}

  alter table product_detail_settings enable row level security;
  create policy public_read_settings on product_detail_settings for select using (true);
  ${forAll('product_detail_settings', 'tenant_admins_manage_settings', false)}

  alter table upsell_pairs enable row level security;
  create policy "Public can view active upsell pairs" on upsell_pairs for select using (is_active = true);
  ${forAll('upsell_pairs', 'Admins can manage upsell pairs', false)}

  alter table product_costs enable row level security;
  create policy product_costs_select_by_tenant on product_costs for select using ${member('product_costs.tenant_id')};
  ${forAll('product_costs', 'product_costs_write_admin', false)}

  alter table outlet_menu_items enable row level security;
  create policy outlet_menu_items_select_public on outlet_menu_items for select using (true);
  create policy outlet_menu_items_write_admin on outlet_menu_items for all
    using (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND ((au.role = 'superadmin'::text) OR ((au.role = 'admin'::text) AND (au.tenant_id = outlet_menu_items.tenant_id) AND ((au.outlet_id IS NULL) OR (au.outlet_id = outlet_menu_items.outlet_id)))))))
    with check (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND ((au.role = 'superadmin'::text) OR ((au.role = 'admin'::text) AND (au.tenant_id = outlet_menu_items.tenant_id) AND ((au.outlet_id IS NULL) OR (au.outlet_id = outlet_menu_items.outlet_id)))))));

  alter table outlets enable row level security;
  create policy outlets_select_public on outlets for select using (true);
  create policy outlets_write_admin on outlets for all
    using (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND ((au.role = 'superadmin'::text) OR ((au.role = 'admin'::text) AND (au.tenant_id = outlets.tenant_id) AND (au.outlet_id IS NULL))))))
    with check (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND ((au.role = 'superadmin'::text) OR ((au.role = 'admin'::text) AND (au.tenant_id = outlets.tenant_id) AND (au.outlet_id IS NULL))))));

  alter table push_tokens enable row level security;
  create policy push_tokens_select_by_tenant on push_tokens for select using ${member('push_tokens.tenant_id')};
  create policy push_tokens_insert_own on push_tokens for insert with check ((user_id = auth.uid()) AND ${member('push_tokens.tenant_id')});
  create policy push_tokens_update_own on push_tokens for update using ((user_id = auth.uid()) AND ${member('push_tokens.tenant_id')}) with check ((user_id = auth.uid()) AND ${member('push_tokens.tenant_id')});
  create policy push_tokens_delete_own on push_tokens for delete using ((user_id = auth.uid()) AND ${member('push_tokens.tenant_id')});

  alter table tenant_secrets enable row level security;
  create policy tenant_secrets_admin_select on tenant_secrets for select to authenticated using (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'admin'::text) AND (au.tenant_id = tenant_secrets.tenant_id))));
  create policy tenant_secrets_admin_insert on tenant_secrets for insert to authenticated with check (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'admin'::text) AND (au.tenant_id = tenant_secrets.tenant_id))));
  create policy tenant_secrets_admin_update on tenant_secrets for update to authenticated using (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'admin'::text) AND (au.tenant_id = tenant_secrets.tenant_id)))) with check (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'admin'::text) AND (au.tenant_id = tenant_secrets.tenant_id))));
  create policy tenant_secrets_superadmin_all on tenant_secrets for all to authenticated using (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'superadmin'::text)))) with check (EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'superadmin'::text))));

  alter table bundles enable row level security;
  create policy bundles_public_read on bundles for select using (is_active = true);
  ${forAll('bundles', 'bundles_admin_all', false)}

  alter table bundle_slots enable row level security;
  create policy bundle_slots_public_read on bundle_slots for select using (true);
  create policy bundle_slots_admin_all on bundle_slots for all using (EXISTS ( SELECT 1 FROM (bundles b JOIN app_users au ON ((au.user_id = auth.uid()))) WHERE ((b.id = bundle_slots.bundle_id) AND ((au.role = 'superadmin'::text) OR ((au.role = 'admin'::text) AND (au.tenant_id = b.tenant_id))))));

  alter table bundle_slot_price_overrides enable row level security;
  create policy bundle_overrides_public_read on bundle_slot_price_overrides for select using (true);
  create policy bundle_overrides_admin_all on bundle_slot_price_overrides for all using (EXISTS ( SELECT 1 FROM ((bundle_slots bs JOIN bundles b ON ((b.id = bs.bundle_id))) JOIN app_users au ON ((au.user_id = auth.uid()))) WHERE ((bs.id = bundle_slot_price_overrides.slot_id) AND ((au.role = 'superadmin'::text) OR ((au.role = 'admin'::text) AND (au.tenant_id = b.tenant_id))))));

  alter table complementary_pairs enable row level security;
  create policy complementary_pairs_public_read on complementary_pairs for select using (is_active = true);
  ${forAll('complementary_pairs', 'complementary_pairs_admin_all', false)}

  alter table pairing_rules enable row level security;
  create policy pairing_rules_public_read on pairing_rules for select using (true);
  ${forAll('pairing_rules', 'pairing_rules_admin_all', false)}

  alter table tag_definitions enable row level security;
  create policy tag_definitions_public_read on tag_definitions for select using (true);
  ${forAll('tag_definitions', 'tag_definitions_admin_all', false)}

  alter table menu_item_tags enable row level security;
  create policy menu_item_tags_public_read on menu_item_tags for select using (true);
  ${forAll('menu_item_tags', 'menu_item_tags_admin_all', false)}

  alter table loyverse_item_map enable row level security;
  ${forAll('loyverse_item_map', 'loyverse_item_map_rw_admin')}

  alter table analytics_events enable row level security;
  create policy analytics_events_select_by_tenant on analytics_events for select using ${member('analytics_events.tenant_id')};
  ${forAll('analytics_events', 'analytics_events_write_admin', false)}

  alter table daily_stats enable row level security;
  create policy daily_stats_select_by_tenant on daily_stats for select using ${member('daily_stats.tenant_id')};
  ${forAll('daily_stats', 'daily_stats_write_admin', false)}

  alter table product_analytics enable row level security;
  create policy product_analytics_select_by_tenant on product_analytics for select using ${member('product_analytics.tenant_id')};
  ${forAll('product_analytics', 'product_analytics_write_admin', false)}

  alter table orders enable row level security;
  alter table facebook_pages enable row level security;
  create policy facebook_pages_all_test on facebook_pages for all using (true) with check (true);

  alter table app_signup_requests enable row level security;
  create policy "anyone can submit signup request" on app_signup_requests for insert to anon, authenticated with check (true);
`

module.exports = { HELPERS, TABLES, PRE_POLICIES }
