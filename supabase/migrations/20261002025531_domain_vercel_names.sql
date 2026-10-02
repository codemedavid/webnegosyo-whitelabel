-- Which names on the shared Vercel project a store's custom-domain flow
-- actually CREATED, so disconnecting (or deleting) a store removes only those.
--
-- Every storefront is served by ONE Vercel project. Connecting a domain that is
-- already on that project (the platform's own www, a leftover, another
-- project use) adopts it instead of failing; disconnecting then removed it
-- outright and took it offline. Removal is now limited to this list:
-- adopted names are never in it, so the worst case is a harmless leftover on
-- the project (nothing routes to a name no store holds).
--
-- Written ONLY by the server (service role); joins the privileged-column
-- guard, or an owner could add someone else's name and then disconnect.
--
-- Backfill: the 11 legacy hand-set domains are all apex domains the platform
-- attached for that store, so they keep the old disconnect behaviour (apex +
-- its www alias). No self-serve claim existed when this was written.

alter table public.tenants
  add column if not exists domain_vercel_names text[] not null default '{}';

comment on column public.tenants.domain_vercel_names is
  'Names this store''s custom-domain flow attached to the shared Vercel project; only these are removed on disconnect/delete.';

update public.tenants
set domain_vercel_names = array[lower(domain), 'www.' || lower(domain)]
where domain is not null and domain <> ''
  and domain_vercel_names = '{}';

-- Re-declared from the LIVE definition (identical to 20261001140918) plus
-- domain_vercel_names.
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
