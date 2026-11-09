-- ===========================================================================
-- Design columns need `store_setup` (owner decision H1, 2026-11-09).
--
-- tenants_update_staff lets a staff account holding ANY of store_setup /
-- settings / analytics UPDATE its own tenants row, so an `analytics`-only or
-- `settings`-only account could PATCH /rest/v1/tenants and publish (or wipe) a
-- Page Designer, Hero Builder or Welcome Builder design, skipping the server
-- actions that check `store_setup`. This guard makes the database refuse a
-- CHANGE to any column below from a client role unless the caller may set up
-- the store:
--
--   * app_user_has_permission(id, 'store_setup'): the owner, a legacy
--     full-access account (`permissions IS NULL`), staff holding the key, or a
--     superadmin (the SQL twin of hasPermission(), which every builder action
--     asks through verifyTenantPermission(tenantId, 'store_setup')).
--   * app_user_platform_can('{stores.edit}'): platform staff. verifyTenantAdmin
--     lets them into a store's admin with stores.edit, hasPermission() treats
--     them as full access, and platform_staff_update is their RLS, so they
--     publish designs through their own session today.
--
-- Columns (every column a builder writes, plus the switches that show them):
--   Page Designer   checkout_design, checkout_design_enabled,
--                   confirmation_design, confirmation_design_enabled,
--                   tracking_design, tracking_design_enabled,
--                   confirmation_redirect, confirmation_redirect_seconds
--   Hero Builder    hero_design, hero_preset ('custom' = the built hero),
--                   hero_section_enabled (false hides it)
--   Welcome Builder welcome_design, welcome_design_enabled
--
-- Their writers, all unchanged by this guard:
--   session + store_setup   actions/page-designer.ts, actions/hero-builder.ts,
--                           actions/welcome-builder.ts, actions/branding.ts
--                           (Branding Studio: hero_preset, hero_section_enabled)
--   service role            onboarding build (design-step.ts applyLaunchHero,
--                           build.ts saveBrandingWithClient(admin)), the MCP
--                           routes (createAdminClient), seed scripts
--   superadmin session      app_user_has_permission answers true
-- The merchant app and the desktop app write none of them.
--
-- Compared with IS DISTINCT FROM (as guard_tenant_privileged_columns): saves
-- that re-send unchanged values must keep working for settings/analytics staff.
-- SECURITY INVOKER on purpose: current_user must be the caller's role. Both
-- helpers are SECURITY DEFINER and executable by `authenticated`; anon is
-- refused before either is called (anon may not execute them, and has no
-- UPDATE policy on tenants anyway).
--
-- Idempotent. Runner: tests/sql/run-design-columns-store-setup.cjs.
-- Rollback:
--   drop trigger if exists tenants_guard_design_columns on public.tenants;
--   drop function if exists public.guard_tenant_design_columns();
-- ===========================================================================

set lock_timeout = '3s';

create or replace function public.guard_tenant_design_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  design_columns constant text[] := array[
    'checkout_design', 'checkout_design_enabled',
    'confirmation_design', 'confirmation_design_enabled',
    'tracking_design', 'tracking_design_enabled',
    'confirmation_redirect', 'confirmation_redirect_seconds',
    'hero_design', 'hero_preset', 'hero_section_enabled',
    'welcome_design', 'welcome_design_enabled'
  ];
  old_row jsonb;
  new_row jsonb;
  col text;
  changed text := null;
begin
  -- Only the PostgREST API roles are restricted.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  old_row := to_jsonb(old);
  new_row := to_jsonb(new);

  foreach col in array design_columns loop
    if (new_row -> col) is distinct from (old_row -> col) then
      changed := col;
      exit;
    end if;
  end loop;

  if changed is null then
    return new;
  end if;

  if current_user = 'authenticated' and (
    public.app_user_has_permission(new.id, 'store_setup')
    or public.app_user_platform_can(array['stores.edit'])
  ) then
    return new;
  end if;

  raise exception 'Store setup access is needed to change tenants.%', changed
    using errcode = '42501';
end;
$$;

-- A trigger function is never called directly; firing it needs no EXECUTE.
revoke all on function public.guard_tenant_design_columns() from public, anon, authenticated;

drop trigger if exists tenants_guard_design_columns on public.tenants;
create trigger tenants_guard_design_columns
  before update on public.tenants
  for each row execute function public.guard_tenant_design_columns();
