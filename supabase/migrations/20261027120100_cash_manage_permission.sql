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
--   * cash_manage is NOT opt-in: `permissions IS NULL` (legacy full access)
--     holds it, exactly as it held cash management before. It is NOT implied
--     by store_setup (IMPLIED_BY), so the two can be separated later.
--   * One-time backfill: every scoped account holding `store_setup` today
--     gets `cash_manage` too, so nobody loses access on apply.
--   * app_user_manages_cash() becomes app_user_has_permission(t, 'cash_manage').
--     Every existing cash policy (cash_drawers insert/update, staff_shifts_close,
--     shift_cash_movements_insert) keeps calling it, unchanged.
--     Side effect, intended: a superadmin (NULL tenant) now passes it (07 §1.5-3);
--     those policies still require app_user_may_reach_branch, which a
--     superadmin does not pass, so no table access widens today.
--   * app_user_has_permission has no key list in SQL (any key the account
--     holds by name counts; NULL permissions hold every key outside the
--     opt-in array). Its live body (2026-10-27, 20261022130200) is therefore
--     left untouched.
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
  'Holder of cash_manage for this tenant (owner, superadmin, NULL permissions, or the key by name): may set up drawers, collect cash from any drawer, close a cashier''s shift, receive remittances, close the business day. 20261027120100.';

-- ===========================================================================
-- Rollback (manual). The backfill is not undone: an extra key name is inert
-- once the function below is restored.
-- ===========================================================================
-- create or replace function public.app_user_manages_cash(target_tenant_id uuid) returns boolean
-- language sql stable set search_path = public, pg_temp as $$
--   select exists (select 1 from app_users au
--     where au.user_id = auth.uid() and au.tenant_id = target_tenant_id
--       and au.role = any (array['admin','superadmin'])
--       and (coalesce(au.is_owner, false) or au.permissions is null or 'store_setup' = any (au.permissions)));
-- $$;
