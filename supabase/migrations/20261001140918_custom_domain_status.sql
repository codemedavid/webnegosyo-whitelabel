-- Self-serve custom domains with per-store ownership proof.
--
-- Every storefront is served by ONE Vercel project, so a domain whose DNS
-- points here proves only that its owner chose the platform, not which store.
-- A claim therefore waits in pending_domain — which the middleware's domain
-- directory never reads — until the owner publishes the claim's token as a
-- TXT record at _webnegosyo.<domain> and Vercel has verified the domain.
-- Only then does the app move it into tenants.domain (the routed column).
--
--   pending_domain            the domain being claimed; never routed
--   pending_domain_token      random proof token the owner publishes as TXT
--   pending_domain_claimed_at an unproven claim older than 7 days may be
--                             taken over by another store (app-side, lazily)
--   domain_verified_at        when tenants.domain was last proven (NULL on
--                             legacy rows set by hand before this system)
--
-- Written ONLY by the server (service role) after verifyTenantOwner. All four
-- join the privileged-column guard: an owner calling PostgREST directly could
-- otherwise mint their own token or reset the claim clock.

alter table public.tenants
  add column if not exists pending_domain text,
  add column if not exists pending_domain_token text,
  add column if not exists pending_domain_claimed_at timestamptz,
  add column if not exists domain_verified_at timestamptz;

comment on column public.tenants.pending_domain is
  'Custom domain claimed but not yet proven (TXT _webnegosyo.<domain> + Vercel). Never routed; see tenants.domain.';

-- One claimant per domain, mirroring tenants_domain_lower_key on the routed column.
create unique index if not exists tenants_pending_domain_lower_key
  on public.tenants (lower(pending_domain))
  where pending_domain is not null and pending_domain <> '';

-- Re-declared from the LIVE definition (which already carries
-- beta_designs_enabled, absent from 20260923120000) plus the four columns above.
create or replace function public.guard_tenant_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  privileged constant text[] := array[
    'id', 'created_at', 'domain', 'slug', 'is_active',
    'pending_domain', 'pending_domain_token', 'pending_domain_claimed_at',
    'domain_verified_at',
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
    'supabase_order_schema_version'
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
$$;
