-- Store activity — menu, team and settings triggers (the audit GAPS)
--
-- None of these changes were logged anywhere before:
--   menu_items / outlet_menu_items → menu.price_changed / availability_changed / item_added / item_removed
--   app_users                       → staff.added / staff.removed / staff.access_changed
--   tenants (curated whitelist)     → settings.changed (store-wide)
--   outlets (curated whitelist)     → settings.changed (that branch)
--   order_types / payment_methods   → settings.changed
--   vouchers                        → voucher.status_changed
--   loyalty_programs                → loyalty.program_changed
--   sms_campaigns                   → campaign.status_changed
--   assistant_actions (applied)     → assistant.action_confirmed
--
-- Actor = store_activity_actor(): the signed-in store account, else the
-- optional transaction GUC app.actor_user_id a service-role writer may set
-- (manage-staff is the intended first user), else NULL ("System").
-- Each row carries before/after jsonb of ONLY the changed fields and a plain
-- English summary.title. Updates have no natural idempotency key, so their
-- event_key ends in a random uuid (a trigger fires once per row change).

-- ============================================
-- Helpers
-- ============================================

-- The changed subset of p_keys between two row images.
create or replace function public.store_activity_diff(p_old jsonb, p_new jsonb, p_keys text[], out o_before jsonb, out o_after jsonb)
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(jsonb_object_agg(k, coalesce(p_old, '{}'::jsonb) -> k), '{}'::jsonb),
    coalesce(jsonb_object_agg(k, coalesce(p_new, '{}'::jsonb) -> k), '{}'::jsonb)
  from unnest(p_keys) k
  where (coalesce(p_old, '{}'::jsonb) -> k) is distinct from (coalesce(p_new, '{}'::jsonb) -> k)
$$;

-- Owner-facing words for a setting column.
create or replace function public.store_activity_setting_label(p_key text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_key
    when 'is_active' then 'Store open'
    when 'operating_hours' then 'Opening hours'
    when 'timezone' then 'Time zone'
    when 'enforce_operating_hours' then 'Closing at closing time'
    when 'enable_order_management' then 'Order management'
    when 'is_prelaunch' then 'Pre-launch mode'
    when 'distance_delivery_enabled' then 'Distance-based delivery fee'
    when 'delivery_price_per_km' then 'Delivery fee per km'
    when 'delivery_min_fee' then 'Minimum delivery fee'
    when 'delivery_radius_km' then 'Delivery radius'
    when 'free_delivery_min_order' then 'Free delivery minimum'
    when 'lalamove_enabled' then 'Lalamove delivery'
    when 'inventory_enabled' then 'Inventory tracking'
    when 'low_stock_alerts_enabled' then 'Low-stock alerts'
    when 'auto_86_enabled' then 'Auto sold-out'
    when 'pickup_scan_enabled' then 'Pickup QR scan'
    when 'qr_handoff_enabled' then 'QR order hand-off'
    when 'messenger_redirect_enabled' then 'Messenger redirect'
    when 'outlet_selection_timing' then 'When guests pick a branch'
    when 'loyalty_enabled' then 'Loyalty'
    when 'presell_enabled' then 'Pre-selling'
    when 'checkout_upsell_enabled' then 'Cart last call'
    when 'menu_engineering_enabled' then 'Boost Sales'
    when 'bundles_enabled' then 'Combos'
    when 'supports_pickup' then 'Pickup'
    when 'supports_delivery' then 'Delivery'
    when 'supports_dine_in' then 'Dine-in'
    when 'is_enabled' then 'Order type on'
    when 'minimum_order_amount' then 'Minimum order'
    when 'service_charge_enabled' then 'Service charge'
    when 'service_charge_type' then 'Service charge type'
    when 'service_charge_value' then 'Service charge amount'
    when 'pos_markup_percent' then 'Register markup'
    when 'available_on_web' then 'Online ordering'
    when 'available_on_pos' then 'Register ordering'
    when 'after_billing_payment_enabled' then 'Pay after billing'
    when 'advance_order_enabled' then 'Advance orders'
    when 'name' then 'Name'
    when 'details' then 'Account details'
    when 'qr_code_url' then 'Payment QR code'
    when 'require_payment_proof' then 'Require payment proof'
    when 'skip_payment_details' then 'Skip payment details'
    else initcap(replace(p_key, '_', ' '))
  end
$$;

-- "Opening hours changed", "Delivery turned off", "Opening hours and 2 more changed".
create or replace function public.store_activity_settings_title(p_subject text, p_before jsonb, p_after jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[] := array(select jsonb_object_keys(coalesce(p_after, '{}'::jsonb)) order by 1);
  v_key text;
  v_label text;
  v_prefix text := coalesce(nullif(p_subject, '') || ': ', '');
begin
  if cardinality(v_keys) = 0 then
    return v_prefix || 'Settings changed';
  end if;
  v_key := v_keys[1];
  v_label := public.store_activity_setting_label(v_key);
  if cardinality(v_keys) > 1 then
    return v_prefix || v_label || ' and ' || (cardinality(v_keys) - 1) || ' more changed';
  end if;
  if jsonb_typeof(p_after -> v_key) = 'boolean' then
    return v_prefix || v_label || case when (p_after ->> v_key)::boolean then ' turned on' else ' turned off' end;
  end if;
  if jsonb_typeof(p_after -> v_key) = 'number' and jsonb_typeof(p_before -> v_key) = 'number'
     and v_key in ('delivery_price_per_km', 'delivery_min_fee', 'free_delivery_min_order', 'minimum_order_amount') then
    return v_prefix || v_label || ' ' || public.store_activity_peso((p_before ->> v_key)::numeric)
      || ' → ' || public.store_activity_peso((p_after ->> v_key)::numeric);
  end if;
  return v_prefix || v_label || ' changed';
end;
$$;

-- Records one settings.changed row when anything in p_keys changed.
create or replace function public.store_activity_record_settings(
  p_tenant_id uuid, p_outlet_id uuid, p_old jsonb, p_new jsonb, p_keys text[],
  p_source_table text, p_source_id text, p_subject_ref text, p_subject_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_diff record;
begin
  select * into v_diff from public.store_activity_diff(p_old, p_new, p_keys);
  if v_diff.o_after = '{}'::jsonb and p_old is not null and p_new is not null then
    return;
  end if;
  perform public.store_activity_record(
    p_tenant_id => p_tenant_id, p_kind => 'settings.changed',
    p_event_key => p_source_table || ':' || p_source_id || ':settings:' || gen_random_uuid(),
    p_source_table => p_source_table, p_source_id => p_source_id, p_occurred_at => now(),
    p_outlet_id => p_outlet_id, p_actor_user_id => public.store_activity_actor(),
    p_subject_type => 'setting', p_subject_ref => p_subject_ref,
    p_before => case when p_old is null then null else v_diff.o_before end,
    p_after => case when p_new is null then null else v_diff.o_after end,
    p_summary => jsonb_build_object('title', case
      when p_old is null then coalesce(p_subject_label, 'Setting') || ' added'
      when p_new is null then coalesce(p_subject_label, 'Setting') || ' removed'
      else public.store_activity_settings_title(p_subject_label, v_diff.o_before, v_diff.o_after) end,
      'changedKeys', to_jsonb(array(select jsonb_object_keys(v_diff.o_after) order by 1))));
end;
$$;

-- One dish change (store-wide or one branch): price and/or availability.
create or replace function public.store_activity_record_menu_change(
  p_tenant_id uuid, p_outlet_id uuid, p_item_id uuid, p_item_name text,
  p_old_price numeric, p_new_price numeric, p_old_sale numeric, p_new_sale numeric,
  p_old_available boolean, p_new_available boolean, p_old_listed boolean, p_new_listed boolean,
  p_is_auto boolean, p_source_table text, p_source_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.store_activity_actor();
  v_name text := coalesce(nullif(btrim(p_item_name), ''), 'A dish');
  v_where text := case when p_outlet_id is not null then ' at this branch' else '' end;
begin
  if p_old_price is distinct from p_new_price or p_old_sale is distinct from p_new_sale then
    perform public.store_activity_record(
      p_tenant_id => p_tenant_id, p_kind => 'menu.price_changed',
      p_event_key => p_source_table || ':' || p_source_id || ':price:' || gen_random_uuid(),
      p_source_table => p_source_table, p_source_id => p_source_id, p_occurred_at => now(),
      p_outlet_id => p_outlet_id, p_actor_user_id => v_actor,
      p_amount => case when p_old_price is not null and p_new_price is not null then p_new_price - p_old_price end,
      p_subject_type => 'menu_item', p_subject_ref => p_item_id::text,
      p_before => jsonb_strip_nulls(jsonb_build_object('price', p_old_price, 'salePrice', p_old_sale)),
      p_after => jsonb_strip_nulls(jsonb_build_object('price', p_new_price, 'salePrice', p_new_sale)),
      p_summary => jsonb_build_object('itemName', v_name, 'title', v_name || ' · ' || case
        when p_old_price is distinct from p_new_price then
          case when p_new_price is null then 'branch price removed'
               when p_old_price is null then 'price set to ' || public.store_activity_peso(p_new_price) || v_where
               else 'Price ' || public.store_activity_peso(p_old_price) || ' → ' || public.store_activity_peso(p_new_price) || v_where end
        when p_new_sale is null then 'sale price removed' || v_where
        when p_old_sale is null then 'on sale at ' || public.store_activity_peso(p_new_sale) || v_where
        else 'Sale price ' || public.store_activity_peso(p_old_sale) || ' → ' || public.store_activity_peso(p_new_sale) || v_where end));
  end if;

  if coalesce(p_old_available, true) is distinct from coalesce(p_new_available, true)
     or coalesce(p_old_listed, true) is distinct from coalesce(p_new_listed, true) then
    perform public.store_activity_record(
      p_tenant_id => p_tenant_id, p_kind => 'menu.availability_changed',
      p_event_key => p_source_table || ':' || p_source_id || ':availability:' || gen_random_uuid(),
      p_source_table => p_source_table, p_source_id => p_source_id, p_occurred_at => now(),
      p_outlet_id => p_outlet_id, p_actor_user_id => case when p_is_auto then null else v_actor end,
      p_subject_type => 'menu_item', p_subject_ref => p_item_id::text,
      p_before => jsonb_strip_nulls(jsonb_build_object('available', p_old_available, 'listed', p_old_listed)),
      p_after => jsonb_strip_nulls(jsonb_build_object('available', p_new_available, 'listed', p_new_listed)),
      p_summary => jsonb_strip_nulls(jsonb_build_object('itemName', v_name, 'auto', case when p_is_auto then true end,
        'title', v_name || case
          when coalesce(p_old_listed, true) is distinct from coalesce(p_new_listed, true) then
            case when coalesce(p_new_listed, true) then ' back on the menu' else ' hidden from the menu' end
          when coalesce(p_new_available, true) then ' back in stock'
          else ' marked sold out' end
          || v_where || case when p_is_auto then ' (auto)' else '' end)));
  end if;
end;
$$;

-- ============================================
-- menu_items
-- ============================================
create or replace function public.store_activity_on_menu_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.menu_items := case when tg_op = 'DELETE' then old else new end;
begin
  if tg_op in ('INSERT', 'DELETE') then
    perform public.store_activity_record(
      p_tenant_id => v_row.tenant_id,
      p_kind => case when tg_op = 'INSERT' then 'menu.item_added' else 'menu.item_removed' end,
      p_event_key => 'menu_items:' || v_row.id || ':' || lower(tg_op),
      p_source_table => 'menu_items', p_source_id => v_row.id::text, p_occurred_at => now(),
      p_actor_user_id => public.store_activity_actor(), p_amount => null,
      p_subject_type => 'menu_item', p_subject_ref => v_row.id::text,
      p_after => case when tg_op = 'INSERT' then jsonb_strip_nulls(jsonb_build_object('price', v_row.price, 'available', v_row.is_available)) end,
      p_before => case when tg_op = 'DELETE' then jsonb_strip_nulls(jsonb_build_object('price', v_row.price, 'available', v_row.is_available)) end,
      p_summary => jsonb_build_object('itemName', v_row.name, 'title', case when tg_op = 'INSERT'
        then 'Added ' || coalesce(v_row.name, 'a dish') || ' · ' || coalesce(public.store_activity_peso(v_row.price), 'no price')
        else 'Removed ' || coalesce(v_row.name, 'a dish') || ' from the menu' end));
    return null;
  end if;

  perform public.store_activity_record_menu_change(
    new.tenant_id, null, new.id, new.name,
    old.price, new.price, old.discounted_price, new.discounted_price,
    old.is_available, new.is_available, null, null,
    new.auto_disabled_at is distinct from old.auto_disabled_at and public.store_activity_actor() is null,
    'menu_items', new.id::text);
  return null;
exception when others then
  raise warning 'store_activity_on_menu_items failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_menu_items_change on public.menu_items;
create trigger store_activity_menu_items_change
  after update of price, discounted_price, is_available on public.menu_items
  for each row
  when (old.price is distinct from new.price
     or old.discounted_price is distinct from new.discounted_price
     or old.is_available is distinct from new.is_available)
  execute function public.store_activity_on_menu_items();

drop trigger if exists store_activity_menu_items_add_remove on public.menu_items;
create trigger store_activity_menu_items_add_remove
  after insert or delete on public.menu_items
  for each row execute function public.store_activity_on_menu_items();

-- ============================================
-- outlet_menu_items (per-branch overrides; no row = store-wide values)
-- ============================================
create or replace function public.store_activity_on_outlet_menu_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.outlet_menu_items := case when tg_op = 'DELETE' then old else new end;
  v_name text;
begin
  select m.name into v_name from public.menu_items m where m.id = v_row.menu_item_id;
  perform public.store_activity_record_menu_change(
    v_row.tenant_id, v_row.outlet_id, v_row.menu_item_id, v_name,
    case when tg_op = 'INSERT' then null else old.price end,
    case when tg_op = 'DELETE' then null else new.price end,
    case when tg_op = 'INSERT' then null else old.discounted_price end,
    case when tg_op = 'DELETE' then null else new.discounted_price end,
    case when tg_op = 'INSERT' then true else old.is_available end,
    case when tg_op = 'DELETE' then true else new.is_available end,
    case when tg_op = 'INSERT' then true else old.is_listed end,
    case when tg_op = 'DELETE' then true else new.is_listed end,
    false, 'outlet_menu_items', v_row.id::text);
  return null;
exception when others then
  raise warning 'store_activity_on_outlet_menu_items failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_outlet_menu_items on public.outlet_menu_items;
create trigger store_activity_outlet_menu_items
  after insert or update of price, discounted_price, is_available, is_listed or delete on public.outlet_menu_items
  for each row execute function public.store_activity_on_outlet_menu_items();

-- ============================================
-- app_users (store staff only; superadmins are not store staff)
-- ============================================
create or replace function public.store_activity_on_app_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.app_users := case when tg_op = 'DELETE' then old else new end;
  v_name text := coalesce(nullif(btrim(v_row.display_name), ''), nullif(split_part(coalesce(v_row.email, ''), '@', 1), ''), 'A staff member');
  v_old jsonb;
  v_new jsonb;
  v_kind text;
  v_tenant uuid := v_row.tenant_id;
begin
  if tg_op = 'UPDATE' and old.tenant_id is distinct from new.tenant_id then
    -- Moving an account between stores = removed from one, added to the other.
    v_tenant := coalesce(new.tenant_id, old.tenant_id);
  end if;
  if v_tenant is null or v_row.role is distinct from 'admin' and (tg_op <> 'UPDATE' or old.role is distinct from 'admin') then
    return null;
  end if;

  v_old := case when tg_op = 'INSERT' then null else jsonb_build_object(
    'role', old.role, 'isOwner', coalesce(old.is_owner, false), 'outletId', old.outlet_id,
    'outletName', (select o.name from public.outlets o where o.id = old.outlet_id),
    'permissions', to_jsonb(old.permissions)) end;
  v_new := case when tg_op = 'DELETE' then null else jsonb_build_object(
    'role', new.role, 'isOwner', coalesce(new.is_owner, false), 'outletId', new.outlet_id,
    'outletName', (select o.name from public.outlets o where o.id = new.outlet_id),
    'permissions', to_jsonb(new.permissions)) end;

  v_kind := case
    when tg_op = 'INSERT' then 'staff.added'
    when tg_op = 'DELETE' then 'staff.removed'
    when new.role is distinct from 'admin' or new.tenant_id is null then 'staff.removed'
    else 'staff.access_changed' end;
  if v_kind = 'staff.access_changed' and v_old = v_new then
    return null;
  end if;

  perform public.store_activity_record(
    p_tenant_id => v_tenant, p_kind => v_kind,
    p_event_key => 'app_users:' || v_row.user_id || ':' || v_kind || ':' || gen_random_uuid(),
    p_source_table => 'app_users', p_source_id => v_row.user_id::text, p_occurred_at => now(),
    p_outlet_id => null, p_actor_user_id => public.store_activity_actor(),
    p_subject_type => 'staff', p_subject_ref => v_row.user_id::text,
    p_before => v_old, p_after => v_new,
    p_summary => jsonb_build_object('staffName', v_name, 'title', case v_kind
      when 'staff.added' then 'Added ' || v_name || ' to the team'
      when 'staff.removed' then 'Removed ' || v_name || ' from the team'
      else 'Changed ' || v_name || '''s access' end));
  return null;
exception when others then
  raise warning 'store_activity_on_app_users failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_app_users on public.app_users;
create trigger store_activity_app_users
  after insert or update of permissions, outlet_id, is_owner, role, tenant_id or delete on public.app_users
  for each row execute function public.store_activity_on_app_users();

-- ============================================
-- tenants / outlets / order_types / payment_methods (curated settings)
-- ============================================
create or replace function public.store_activity_on_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_keys text[];
  v_tenant uuid;
  v_outlet uuid;
  v_label text;
begin
  case tg_table_name
    when 'tenants' then
      v_keys := array['is_active', 'operating_hours', 'timezone', 'enforce_operating_hours', 'enable_order_management',
        'is_prelaunch', 'distance_delivery_enabled', 'delivery_price_per_km', 'delivery_min_fee', 'delivery_radius_km',
        'free_delivery_min_order', 'lalamove_enabled', 'inventory_enabled', 'low_stock_alerts_enabled', 'auto_86_enabled',
        'pickup_scan_enabled', 'qr_handoff_enabled', 'messenger_redirect_enabled', 'outlet_selection_timing',
        'loyalty_enabled', 'presell_enabled', 'checkout_upsell_enabled', 'menu_engineering_enabled', 'bundles_enabled'];
      v_tenant := (v_row ->> 'id')::uuid;
      v_label := null;
    when 'outlets' then
      v_keys := array['is_active', 'operating_hours', 'timezone', 'supports_pickup', 'supports_delivery',
        'supports_dine_in', 'delivery_radius_km'];
      v_tenant := (v_row ->> 'tenant_id')::uuid;
      v_outlet := (v_row ->> 'id')::uuid;
      v_label := 'Branch ' || coalesce(v_row ->> 'name', '');
    when 'order_types' then
      v_keys := array['is_enabled', 'minimum_order_amount', 'service_charge_enabled', 'service_charge_type',
        'service_charge_value', 'pos_markup_percent', 'available_on_web', 'available_on_pos',
        'after_billing_payment_enabled', 'advance_order_enabled'];
      v_tenant := (v_row ->> 'tenant_id')::uuid;
      v_label := coalesce(nullif(v_row ->> 'name', ''), v_row ->> 'type', 'Order type');
    when 'payment_methods' then
      v_keys := array['name', 'details', 'qr_code_url', 'is_active', 'require_payment_proof', 'skip_payment_details'];
      v_tenant := (v_row ->> 'tenant_id')::uuid;
      v_label := 'Payment method ' || coalesce(v_row ->> 'name', '');
  end case;

  perform public.store_activity_record_settings(
    v_tenant, v_outlet, v_old, v_new, v_keys,
    tg_table_name, v_row ->> 'id', tg_table_name || ':' || (v_row ->> 'id'), v_label);
  return null;
exception when others then
  raise warning 'store_activity_on_settings(%) failed: % (%)', tg_table_name, sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_tenants_settings on public.tenants;
create trigger store_activity_tenants_settings
  after update on public.tenants
  for each row execute function public.store_activity_on_settings();

drop trigger if exists store_activity_outlets_settings on public.outlets;
create trigger store_activity_outlets_settings
  after update on public.outlets
  for each row execute function public.store_activity_on_settings();

-- order_types: no INSERT capture — a new store's defaults are created by trigger.
drop trigger if exists store_activity_order_types_settings on public.order_types;
create trigger store_activity_order_types_settings
  after update or delete on public.order_types
  for each row execute function public.store_activity_on_settings();

drop trigger if exists store_activity_payment_methods_settings on public.payment_methods;
create trigger store_activity_payment_methods_settings
  after insert or update or delete on public.payment_methods
  for each row execute function public.store_activity_on_settings();

-- ============================================
-- vouchers / loyalty_programs / sms_campaigns / assistant_actions
-- ============================================
create or replace function public.store_activity_on_marketing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_kind text;
  v_keys text[];
  v_diff record;
  v_title text;
  v_name text;
  v_subject text;
  v_actor uuid := public.store_activity_actor();
begin
  case tg_table_name
    when 'vouchers' then
      v_kind := 'voucher.status_changed';
      v_subject := 'voucher';
      v_keys := array['is_active', 'discount_type', 'discount_value', 'max_discount_amount', 'starts_at', 'ends_at', 'usage_limit_total'];
      v_name := 'Voucher ' || coalesce(v_row ->> 'code', v_row ->> 'name', '');
    when 'loyalty_programs' then
      v_kind := 'loyalty.program_changed';
      v_subject := 'setting';
      v_keys := array['status', 'name', 'ends_at'];
      v_name := coalesce(nullif(v_row ->> 'name', ''), 'Loyalty program');
    when 'sms_campaigns' then
      v_kind := 'campaign.status_changed';
      v_subject := 'setting';
      v_keys := array['status'];
      v_name := 'Text campaign ' || coalesce(v_row ->> 'name', '');
      -- Drafts (incl. onboarding's launch drafts) text no one; only real moves count.
      if tg_op = 'INSERT' and coalesce(v_row ->> 'status', 'draft') = 'draft' then
        return null;
      end if;
    when 'assistant_actions' then
      if tg_op <> 'UPDATE' or v_row ->> 'status' <> 'applied' or (v_old ->> 'status') = 'applied' then
        return null;
      end if;
      perform public.store_activity_record(
        p_tenant_id => (v_row ->> 'tenant_id')::uuid, p_kind => 'assistant.action_confirmed',
        p_event_key => 'assistant_actions:' || (v_row ->> 'id') || ':applied',
        p_source_table => 'assistant_actions', p_source_id => v_row ->> 'id',
        p_occurred_at => coalesce(nullif(v_row ->> 'decided_at', '')::timestamptz, now()),
        p_actor_user_id => coalesce(nullif(v_row ->> 'decided_by', '')::uuid, v_actor),
        p_subject_type => 'setting', p_subject_ref => 'assistant_actions:' || (v_row ->> 'id'),
        p_summary => jsonb_strip_nulls(jsonb_build_object(
          'title', 'Owl assistant change applied' || coalesce(': ' || left(nullif(btrim(v_row ->> 'summary'), ''), 140), ''),
          'actionKind', v_row ->> 'kind')));
      return null;
  end case;

  select * into v_diff from public.store_activity_diff(v_old, v_new, v_keys);
  if tg_op = 'UPDATE' and v_diff.o_after = '{}'::jsonb then
    return null;
  end if;
  v_title := case
    when tg_op = 'INSERT' then v_name || ' created' || coalesce(' (' || (v_row ->> 'status') || ')', '')
    when tg_op = 'DELETE' then v_name || ' deleted'
    when v_diff.o_after ? 'status' then v_name || ' ' || coalesce(v_old ->> 'status', '?') || ' → ' || (v_new ->> 'status')
    when v_diff.o_after ? 'is_active' then v_name || case when (v_new ->> 'is_active')::boolean then ' turned on' else ' turned off' end
    else v_name || ' changed' end;

  perform public.store_activity_record(
    p_tenant_id => (v_row ->> 'tenant_id')::uuid, p_kind => v_kind,
    p_event_key => tg_table_name || ':' || (v_row ->> 'id') || ':' || lower(tg_op) || ':' || gen_random_uuid(),
    p_source_table => tg_table_name, p_source_id => v_row ->> 'id', p_occurred_at => now(),
    p_outlet_id => case when tg_table_name = 'loyalty_programs' then nullif(v_row ->> 'outlet_id', '')::uuid end,
    p_actor_user_id => v_actor,
    p_subject_type => v_subject, p_subject_ref => v_row ->> 'id',
    p_before => case when tg_op = 'UPDATE' then v_diff.o_before end,
    p_after => case when tg_op = 'UPDATE' then v_diff.o_after end,
    p_summary => jsonb_strip_nulls(jsonb_build_object('title', v_title, 'name', v_name,
      'status', coalesce(v_new ->> 'status', case when v_new ? 'is_active' then
        case when (v_new ->> 'is_active')::boolean then 'active' else 'inactive' end end))));
  return null;
exception when others then
  raise warning 'store_activity_on_marketing(%) failed: % (%)', tg_table_name, sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_vouchers on public.vouchers;
create trigger store_activity_vouchers
  after insert or update or delete on public.vouchers
  for each row execute function public.store_activity_on_marketing();

drop trigger if exists store_activity_loyalty_programs on public.loyalty_programs;
create trigger store_activity_loyalty_programs
  after insert or update of status, name, ends_at on public.loyalty_programs
  for each row execute function public.store_activity_on_marketing();

drop trigger if exists store_activity_sms_campaigns on public.sms_campaigns;
create trigger store_activity_sms_campaigns
  after insert or update of status on public.sms_campaigns
  for each row execute function public.store_activity_on_marketing();

drop trigger if exists store_activity_assistant_actions on public.assistant_actions;
create trigger store_activity_assistant_actions
  after update of status on public.assistant_actions
  for each row execute function public.store_activity_on_marketing();

-- ============================================
-- Lock down
-- ============================================
revoke all on function public.store_activity_record_settings(uuid, uuid, jsonb, jsonb, text[], text, text, text, text) from public, anon, authenticated;
revoke all on function public.store_activity_record_menu_change(uuid, uuid, uuid, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean, boolean, text, text) from public, anon, authenticated;
revoke all on function public.store_activity_on_menu_items() from public, anon, authenticated;
revoke all on function public.store_activity_on_outlet_menu_items() from public, anon, authenticated;
revoke all on function public.store_activity_on_app_users() from public, anon, authenticated;
revoke all on function public.store_activity_on_settings() from public, anon, authenticated;
revoke all on function public.store_activity_on_marketing() from public, anon, authenticated;

-- ============================================
-- Rollback
-- ============================================
-- drop trigger if exists store_activity_assistant_actions on public.assistant_actions;
-- drop trigger if exists store_activity_sms_campaigns on public.sms_campaigns;
-- drop trigger if exists store_activity_loyalty_programs on public.loyalty_programs;
-- drop trigger if exists store_activity_vouchers on public.vouchers;
-- drop trigger if exists store_activity_payment_methods_settings on public.payment_methods;
-- drop trigger if exists store_activity_order_types_settings on public.order_types;
-- drop trigger if exists store_activity_outlets_settings on public.outlets;
-- drop trigger if exists store_activity_tenants_settings on public.tenants;
-- drop trigger if exists store_activity_app_users on public.app_users;
-- drop trigger if exists store_activity_outlet_menu_items on public.outlet_menu_items;
-- drop trigger if exists store_activity_menu_items_add_remove on public.menu_items;
-- drop trigger if exists store_activity_menu_items_change on public.menu_items;
-- drop function if exists public.store_activity_on_marketing();
-- drop function if exists public.store_activity_on_settings();
-- drop function if exists public.store_activity_on_app_users();
-- drop function if exists public.store_activity_on_outlet_menu_items();
-- drop function if exists public.store_activity_on_menu_items();
-- drop function if exists public.store_activity_record_menu_change(uuid, uuid, uuid, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean, boolean, text, text);
-- drop function if exists public.store_activity_record_settings(uuid, uuid, jsonb, jsonb, text[], text, text, text, text);
-- drop function if exists public.store_activity_settings_title(text, jsonb, jsonb);
-- drop function if exists public.store_activity_setting_label(text);
-- drop function if exists public.store_activity_diff(jsonb, jsonb, text[]);
