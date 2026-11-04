-- `expenses` is opt-in (owner's call, 2026-10-22).
--
-- A legacy full-access account (`app_users.permissions IS NULL`) held every
-- key except activity_view / approve_requests, so 45 such staff accounts
-- would wake up with the whole expense book (salaries, rent, owner draws)
-- and Profit. Now the owner ticks Expenses per person, like the two existing
-- opt-in keys. Owners and superadmins are unchanged.
--
-- Mirrors OPT_IN_PERMISSION_KEYS in src/lib/staff-permissions.ts and its three
-- copies (staff-permissions-parity.test.ts; permission-keys-migration.test.ts
-- pins this body). Body copied from the live definition (2026-10-22), only the
-- opt-in array changes. Rollback: the same body with
-- array['activity_view', 'approve_requests'].
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
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses']))
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
