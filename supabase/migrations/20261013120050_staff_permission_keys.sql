-- ===========================================================================
-- Three new staff permission keys: reports, inventory, costs (Phase 0d of
-- docs/plans/2026-10-12-reports-and-inventory-suite.md, §6.1).
--
--   reports   — sales, transactions, payments, end-of-day and their exports.
--               IMPLIED BY analytics: everyone who can see Growth & Analytics
--               today already sees every sales figure, so carving `reports`
--               out of it must not take a screen away from anyone.
--   inventory — stock, deliveries, waste, counts, transfers, par levels,
--               low-stock alerts. Carved out of `menu`, which keeps recipes
--               and the ingredient master.
--   costs     — unit cost, COGS, gross profit, food cost %, editing costs.
--               Also carved out of `menu`.
--
-- `inventory` and `costs` are NOT implied by `menu`: an owner must be able to
-- hand someone the menu without the shelf or the margins. Every scoped
-- account holding `menu` is given both keys ONCE, in 20261013120100, which
-- also moves the database gates. `permissions IS NULL` (legacy full access)
-- grants all three, as it grants every non-opt-in key.
--
-- This file only teaches the database the `reports` containment; nobody holds
-- `reports` by name yet, so applying it changes no one's access today.
--
-- public.app_user_has_permission is the SQL twin of hasPermission() in
-- src/lib/staff-permissions.ts. Live, it was created by the gov-discounts
-- branch (20261012120000) and redefined by the store-activity branch
-- (20261012140000, opt-in keys); neither is on this branch yet, so it is
-- defined here in full. This body is a strict SUPERSET of the live one: the
-- only change is the `reports` <- `analytics` containment. Any later
-- redefinition must keep that line.
-- ===========================================================================

create or replace function public.app_user_has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests']))
             or p_permission = any (au.permissions)
             -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
             or (p_permission = 'reports' and 'analytics' = any (au.permissions))
           )
         )
       )
  );
$$;

comment on function public.app_user_has_permission(uuid, text) is
  'SQL twin of hasPermission() (src/lib/staff-permissions.ts): superadmin/owner always; permissions NULL = all keys except opt-in activity_view/approve_requests; kitchen,tables implied by orders; reports implied by analytics. Caller = auth.uid().';

revoke all on function public.app_user_has_permission(uuid, text) from public, anon;
grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;
