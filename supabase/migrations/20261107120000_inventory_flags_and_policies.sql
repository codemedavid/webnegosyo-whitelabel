-- Inventory sweep, database half (2026-11-07). Policies, grants, triggers and
-- functions only: no existing row changes. Function bodies are the LIVE ones
-- (pg_get_functiondef, read 2026-11-07), changed only where a comment says so.
--
--   a. auto_86_enabled / low_stock_alerts_enabled join the privileged tenant
--      columns (a staff account with store_setup / settings / analytics could
--      flip them). Their only writer is the superadmin form, which saves with
--      the service role (current_user = service_role passes the guard); no
--      merchant path in src/ or webnegosyo-app/ writes them.
--   b. inventory_counts / stock_transfers / stock_transfer_lines /
--      inventory_stock had ONE "FOR ALL" branch policy with no permission key
--      (the write triggers added 2026-11-03 already ask for `inventory`, this
--      puts the same key in the policy). Reads keep the old branch rule; writes
--      need branch reach AND `inventory`. Nothing that works today changes:
--      stock_movements already needs `inventory`, so apply_stock_movement's
--      invoker-side inventory_stock write (one trigger level down) is always
--      done by a caller who holds it.
--   c. anon loses INSERT / UPDATE / DELETE on the inventory tables. Order
--      depletion uses the service role; the storefront only reads.
--   d. menu_items: an `analytics`-only account may change only what Boost /
--      menu engineering writes (bcg_classification, badge_text, is_featured,
--      show_in_checkout_upsell). Insert and delete drop `analytics` too:
--      nothing in the product creates or deletes dishes under that key.
--   e. NOT NEEDED: apply_stock_movement (BEFORE INSERT, every role) already
--      raises when inventory_item_id is not in new.tenant_id, and no client
--      role has an UPDATE policy on stock_movements.

-- a ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_tenant_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  privileged constant text[] := array[
    'id', 'created_at', 'domain', 'slug', 'is_active', 'is_prelaunch',
    'pending_domain', 'pending_domain_token', 'pending_domain_claimed_at',
    'domain_verified_at', 'domain_vercel_names',
    'mapbox_enabled', 'enable_order_management', 'lalamove_enabled',
    'menu_engineering_enabled', 'bundles_enabled', 'pairing_rules_enabled',
    'app_enabled', 'inventory_enabled', 'modifier_groups_enabled',
    'multi_branch_enabled', 'max_outlets', 'max_staff_per_branch',
    'loyverse_enabled', 'mcp_enabled', 'presell_enabled',
    'customer_hub_enabled', 'loyalty_enabled', 'loyalty_shadow',
    'qr_handoff_enabled', 'ios_app_store_id', 'android_package_name',
    'messenger_page_id', 'storefront_pack', 'beta_designs_enabled',
    'convex_deployment_url', 'convex_schema_version',
    'convex_auth_enforced', 'convex_public_reads',
    'order_backend', 'supabase_order_url', 'supabase_order_anon_key',
    'supabase_order_service_key', 'supabase_order_db_url',
    'supabase_order_schema_version',
    'assistant_enabled',
    'auto_86_enabled', 'low_stock_alerts_enabled'
  ];
  old_row jsonb;
  new_row jsonb;
  col text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid() and au.role = 'superadmin'
  ) then
    return new;
  end if;

  old_row := to_jsonb(old);
  new_row := to_jsonb(new);

  foreach col in array privileged loop
    if (new_row -> col) is distinct from (old_row -> col) then
      raise exception 'Only a platform administrator can change tenants.%', col
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$function$;

-- b ---------------------------------------------------------------------------
do $$
declare
  spec record;
  v_cmd text;
begin
  for spec in
    select * from (values
      ('inventory_counts', 'inventory_counts_manage_branch', 'inventory_counts',
       'app_user_may_reach_branch(tenant_id, outlet_id)'),
      ('stock_transfers', 'stock_transfers_manage_branch', 'stock_transfers',
       '(app_user_may_reach_branch(tenant_id, from_outlet_id) OR app_user_may_reach_branch(tenant_id, to_outlet_id))'),
      ('stock_transfer_lines', 'stock_transfer_lines_manage_branch', 'stock_transfer_lines',
       '(EXISTS ( SELECT 1 FROM stock_transfers t WHERE ((t.id = stock_transfer_lines.transfer_id) AND (t.tenant_id = stock_transfer_lines.tenant_id) AND (app_user_may_reach_branch(t.tenant_id, t.from_outlet_id) OR app_user_may_reach_branch(t.tenant_id, t.to_outlet_id)))))'),
      ('inventory_stock', 'inventory_stock_manage_branch', 'inventory_stock',
       'app_user_may_reach_branch(tenant_id, outlet_id)')
    ) as s(tbl, old_policy, prefix, reach)
  loop
    execute format('drop policy if exists %I on public.%I', spec.old_policy, spec.tbl);

    -- re-runnable: clear the replacement names first
    foreach v_cmd in array array['read', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', spec.prefix || '_' || v_cmd || '_branch', spec.tbl);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (%s)',
      spec.prefix || '_read_branch', spec.tbl, spec.reach);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s and app_user_has_permission(tenant_id, ''inventory''))',
      spec.prefix || '_insert_branch', spec.tbl, spec.reach);

    execute format(
      'create policy %I on public.%I for update to authenticated using (%s and app_user_has_permission(tenant_id, ''inventory'')) with check (%s and app_user_has_permission(tenant_id, ''inventory''))',
      spec.prefix || '_update_branch', spec.tbl, spec.reach, spec.reach);

    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s and app_user_has_permission(tenant_id, ''inventory''))',
      spec.prefix || '_delete_branch', spec.tbl, spec.reach);
  end loop;
end $$;

-- c ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'inventory_items', 'inventory_stock', 'inventory_units', 'stock_movements',
    'recipes', 'recipe_components', 'order_stock_applications', 'stock_alerts',
    'stock_transfers', 'stock_transfer_lines', 'inventory_counts',
    'inventory_audit_log'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('revoke insert, update, delete on public.%I from anon', v_table);
    end if;
  end loop;
end $$;

-- d ---------------------------------------------------------------------------
-- Columns an `analytics`-only account may change on a dish (updated_at is
-- stamped by a later trigger). Anyone holding `menu` is unchanged.
create or replace function public.menu_items_analytics_column_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  allowed constant text[] := array[
    'bcg_classification', 'badge_text', 'is_featured', 'show_in_checkout_upsell', 'updated_at'
  ];
  v_old jsonb;
  v_new jsonb;
  v_col text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.app_user_has_permission(new.tenant_id, 'menu')
     or public.app_user_platform_can(array['stores.edit']) then
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  for v_col in select jsonb_object_keys(v_new) loop
    if v_col = any (allowed) then
      continue;
    end if;
    if (v_new -> v_col) is distinct from (v_old -> v_col) then
      raise exception 'Changing a dish''s % needs the Menu permission', v_col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$function$;

revoke execute on function public.menu_items_analytics_column_guard() from public, anon, authenticated;

drop trigger if exists menu_items_00_analytics_column_guard on public.menu_items;
create trigger menu_items_00_analytics_column_guard
  before update on public.menu_items
  for each row execute function public.menu_items_analytics_column_guard();

drop policy if exists menu_items_insert_staff on public.menu_items;
create policy menu_items_insert_staff on public.menu_items for insert to authenticated
  with check (app_user_has_permission(tenant_id, 'menu'::text));

drop policy if exists menu_items_delete_staff on public.menu_items;
create policy menu_items_delete_staff on public.menu_items for delete to authenticated
  using (app_user_has_permission(tenant_id, 'menu'::text));
