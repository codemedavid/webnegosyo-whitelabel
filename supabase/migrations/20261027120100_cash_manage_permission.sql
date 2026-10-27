-- ===========================================================================
-- New staff permission key `cash_manage` ("Cash & day close"), carved out of
-- `store_setup` (docs/plans/cashier-remittance/CONTRACTS.md §1.3, 07 §5.4).
--
-- Until now "who may manage the store's cash" (set up drawers, pick up cash
-- from any drawer, close a cashier's shift, and from the next waves receive
-- remittances and close the business day) was hard-wired to `store_setup`
-- inside app_user_manages_cash(). An owner could not hand someone branding
-- without the cash, or the cash without branding.
--
--   * cash_manage is OPT-IN (owner's call, 2026-10-27, release review D1):
--     `permissions IS NULL` (legacy full access) does NOT hold it, like
--     expenses. Live 2026-10-27: 45 such staff in 37 stores, 1 ran a shift in
--     30 days, 0 ever picked up from someone else's drawer. They keep their own
--     drawer (holder rules don't need the key); the owner ticks "Cash & day
--     close" for anyone who receives cash. NOT implied by store_setup.
--   * One-time backfill: every scoped account holding `store_setup` today
--     gets `cash_manage` too, so nobody loses access on apply.
--   * app_user_manages_cash() becomes app_user_has_permission(t, 'cash_manage').
--     Every existing cash policy (cash_drawers insert/update, staff_shifts_close,
--     shift_cash_movements_insert) keeps calling it, unchanged.
--     Side effect, intended: a superadmin (NULL tenant) now passes it (07 §1.5-3);
--     those policies still require app_user_may_reach_branch, which a
--     superadmin does not pass, so no table access widens today.
--   * app_user_has_permission: the live body (20261022130200) with
--     'cash_manage' added to the opt-in array, nothing else. Its `_of` twin
--     (20261027160000) carries the same array (permission-of-parity.test.ts).
--
-- APPLY WITH THE DEPLOY, NOT BEFORE: production web and the manage-staff edge
-- function validate permission lists against their own registry and refuse
-- an unknown key, so backfilled accounts could not be edited by their owner
-- until the four registries that know `cash_manage` ship.
-- Runner: tests/sql/run-cash-manage-permission.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- One-time backfill. Replica mode skips app_users' row triggers for this
-- statement only (as 20261013120100 does): enforce_staff_limit could refuse
-- a store already over its seat allowance, store_activity_on_app_users would
-- file an unattributed "Changed X's access" per account, set_updated_at would
-- make every touched account look freshly edited.
-- ---------------------------------------------------------------------------
set session_replication_role = replica;

update public.app_users au
   set permissions = au.permissions || array['cash_manage']
 where au.role = 'admin'
   and au.is_owner is not true
   and au.permissions is not null
   and 'store_setup' = any (au.permissions)
   and not ('cash_manage' = any (au.permissions));

set session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- cash_manage joins the opt-in keys (rollback: the 20261022130200 body).
-- ---------------------------------------------------------------------------
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
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses', 'cash_manage']))
             or p_permission = any (au.permissions)
             -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
             or (p_permission = 'reports' and 'analytics' = any (au.permissions))
           )
         )
       )
  );
$$;

revoke all on function public.app_user_has_permission(uuid, text) from public, anon;
grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Who may manage the store's cash. SECURITY INVOKER (adds no power of its
-- own); app_user_has_permission is the definer twin of hasPermission().
-- Mirrors canManageCash (webnegosyo-app/lib/cash-drawers.ts) →
-- hasPermission(user, 'cash_manage').
-- ---------------------------------------------------------------------------
create or replace function public.app_user_manages_cash(target_tenant_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.app_user_has_permission(target_tenant_id, 'cash_manage');
$$;

comment on function public.app_user_manages_cash(uuid) is
  'Holder of cash_manage for this tenant (owner, superadmin, or the key by name; opt-in, NULL permissions do not hold it): may set up drawers, collect cash from any drawer, close a cashier''s shift, receive remittances, close the business day. 20261027120100.';

-- ===========================================================================
-- Rollback (manual). The backfill is not undone: an extra key name is inert
-- once the function below is restored.
-- ===========================================================================
-- Re-create app_user_has_permission from 20261022130200 (opt-in array without 'cash_manage'), then:
-- create or replace function public.app_user_manages_cash(target_tenant_id uuid) returns boolean
-- language sql stable set search_path = public, pg_temp as $$
--   select exists (select 1 from app_users au
--     where au.user_id = auth.uid() and au.tenant_id = target_tenant_id
--       and au.role = any (array['admin','superadmin'])
--       and (coalesce(au.is_owner, false) or au.permissions is null or 'store_setup' = any (au.permissions)));
-- $$;
