-- Owner AI assistant ("the Owl"): per-store switch.
--
-- Default FALSE: a superadmin turns the assistant on store by store while it
-- rolls out. It is a privileged column — a store admin must not be able to
-- switch on a paid-for AI feature for themselves — so it joins the list in
-- guard_tenant_privileged_columns(). The list below is the FULL current list
-- (copied from the live function, 2026-10-06) plus `assistant_enabled`:
-- redefining the function with a shorter list would silently unlock columns.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS assistant_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.assistant_enabled IS
  'Owner AI assistant (floating admin chat). Superadmin-controlled; default off.';

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
    'assistant_enabled'
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

-- Rollback:
--   (re-run the previous definition from 20261006120000_store_onboarding.sql)
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS assistant_enabled;
