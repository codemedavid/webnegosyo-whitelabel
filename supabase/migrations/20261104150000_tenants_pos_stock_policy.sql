-- ===========================================================================
-- tenants.pos_stock_policy: what the register does when a sale asks for more
-- than the shelf holds (plan section 6, owner decision 2026-11-04).
--
--   'warn'  (default) the cashier is told ("Only 5 left — you're adding 7")
--           and may sell anyway. Today's behaviour.
--   'block' selling past the stock needs a manager PIN.
--
-- The web checkout is unaffected: it always refuses an order the shelf cannot
-- cover (checkout-stock-guard.ts).
--
-- Readable by everyone who can read the tenants row (the register session,
-- GET /api/inventory/ceilings `stockPolicy`). WRITABLE by the store OWNER
-- (store-wide, not branch-locked) or a superadmin as a client, and by the
-- service role. It is the rule that polices cashiers, so a staff account with
-- `settings` must not be able to switch its own PIN requirement off; that is
-- why it does not simply ride tenants_update_staff. Unlike the platform flags
-- in guard_tenant_privileged_columns the owner keeps it, so it gets its own
-- small guard instead of joining that list.
--
-- Idempotent. Runner: tests/sql/run-pos-stock-policy.cjs.
-- Rollback:
--   drop trigger if exists tenants_guard_pos_stock_policy on public.tenants;
--   drop function if exists public.guard_tenant_pos_stock_policy();
--   alter table public.tenants drop column if exists pos_stock_policy;
-- ===========================================================================

set lock_timeout = '3s';

alter table public.tenants
  add column if not exists pos_stock_policy text not null default 'warn';

alter table public.tenants drop constraint if exists tenants_pos_stock_policy_check;
alter table public.tenants
  add constraint tenants_pos_stock_policy_check check (pos_stock_policy in ('warn', 'block'));

comment on column public.tenants.pos_stock_policy is
  'Register rule when stock runs short: warn (cashier may sell anyway, default) or block (needs a manager PIN). Owner-only.';

-- SECURITY INVOKER on purpose (as guard_tenant_privileged_columns): current_user
-- must be the caller's role. app_users_select_self lets the caller read their
-- own row, which is all the owner / superadmin check needs.
create or replace function public.guard_tenant_pos_stock_policy()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  -- Settings forms re-send unchanged values: only a CHANGE is guarded.
  if new.pos_stock_policy is not distinct from old.pos_stock_policy then
    return new;
  end if;
  if exists (
    select 1 from public.app_users au
     where au.user_id = auth.uid()
       and (
         au.role = 'superadmin'
         or (au.role = 'admin' and au.tenant_id = new.id and au.is_owner is true and au.outlet_id is null)
       )
  ) then
    return new;
  end if;
  raise exception 'Only the store owner can change tenants.pos_stock_policy'
    using errcode = '42501';
end;
$$;

drop trigger if exists tenants_guard_pos_stock_policy on public.tenants;
create trigger tenants_guard_pos_stock_policy
  before update on public.tenants
  for each row execute function public.guard_tenant_pos_stock_policy();
