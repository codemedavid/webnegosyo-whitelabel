-- Lock platform-controlled tenant columns against tenant-admin writes.
--
-- `tenants_write_admin` lets any app_users row with role='admin' for a tenant
-- UPDATE every column of its own tenants row, and staff accounts are stored as
-- role='admin' too. `authenticated` holds table-level UPDATE, so a merchant (or
-- any of their staff) could PATCH /rest/v1/tenants directly and:
--   * copy another merchant's custom domain onto their own row (domain had no
--     unique constraint; the resolver's last-row-wins Map made it a hijack),
--   * re-activate a store the platform switched off,
--   * turn on paid / superadmin-only features, or
--   * repoint convex_deployment_url at a server they control.
--
-- The fix keeps RLS as-is (tenant admins still write branding, footer, hours,
-- delivery settings, ...) and adds a BEFORE UPDATE guard that refuses a CHANGE
-- to any column below unless the caller is a superadmin. Service role, postgres
-- and SECURITY DEFINER functions are never the `authenticated`/`anon` role, so
-- server-side writers pass untouched.
--
-- Compared with IS DISTINCT FROM, not `BEFORE UPDATE OF col`: Branding Studio
-- and the superadmin forms re-send unchanged flag values on every save, and a
-- column-list trigger fires on mere presence in the SET list.
--
-- Deliberately NOT locked (tenant admins write them as `authenticated` today):
-- flash_screen_feature_enabled (Branding Studio), checkout_upsell_enabled
-- (menu-engineering settings), facebook_page_id (Facebook page connect).

-- 1. One tenant per custom domain. Verified no duplicates exist (2026-09-23).
create unique index if not exists tenants_domain_lower_key
  on public.tenants (lower(domain))
  where domain is not null and domain <> '';

-- 2. The guard. SECURITY INVOKER on purpose: current_user must be the caller's
-- role (a definer function would always see its owner). app_users_select_self
-- lets a user read their own row, which is all the superadmin check needs.
create or replace function public.guard_tenant_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  privileged constant text[] := array[
    'id', 'created_at', 'domain', 'slug', 'is_active',
    'mapbox_enabled', 'enable_order_management', 'lalamove_enabled',
    'menu_engineering_enabled', 'bundles_enabled', 'pairing_rules_enabled',
    'app_enabled', 'inventory_enabled', 'modifier_groups_enabled',
    'multi_branch_enabled', 'max_outlets', 'max_staff_per_branch',
    'loyverse_enabled', 'mcp_enabled', 'presell_enabled',
    'customer_hub_enabled', 'loyalty_enabled', 'loyalty_shadow',
    'qr_handoff_enabled', 'ios_app_store_id', 'android_package_name',
    'messenger_page_id', 'storefront_pack',
    'convex_deployment_url', 'convex_schema_version',
    'convex_auth_enforced', 'convex_public_reads',
    'order_backend', 'supabase_order_url', 'supabase_order_anon_key',
    'supabase_order_service_key', 'supabase_order_db_url',
    'supabase_order_schema_version'
  ];
  old_row jsonb;
  new_row jsonb;
  col text;
begin
  -- Only the PostgREST API roles are restricted.
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
$$;

drop trigger if exists tenants_guard_privileged_columns on public.tenants;
create trigger tenants_guard_privileged_columns
  before update on public.tenants
  for each row execute function public.guard_tenant_privileged_columns();
