-- Every store gets exactly one owner.
--
-- 20260710120000 introduced is_owner and backfilled the earliest admin of each
-- tenant that existed at the time. Tenants created through the superadmin panel
-- afterwards were left with none, because that path never set the flag — 13 of
-- them as of 2026-08-02, all created between 2026-07-24 and 2026-08-01. An
-- ownerless store cannot add staff at all: canManageStaff() requires is_owner.
--
-- The superadmin panel now names an owner explicitly. This closes the gap for
-- the stores already left behind, and adds the index that stops a second owner
-- appearing during a transfer.

-- Same heuristic as the original backfill: the earliest admin runs the store.
-- Scoped to tenants with no owner at all, so it can never displace one.
--
-- outlet_id is cleared in the SAME statement, not a follow-up: an owner is
-- never confined to a branch, and app_users_outlet_scope_ck is checked per
-- row, so promoting a branch admin and tidying afterwards would abort here.
update public.app_users au
set is_owner = true,
    outlet_id = null
where au.role = 'admin'
  and au.tenant_id is not null
  and au.is_owner = false
  and not exists (
    select 1
    from public.app_users existing
    where existing.tenant_id = au.tenant_id
      and existing.is_owner
  )
  and au.created_at = (
    select min(x.created_at)
    from public.app_users x
    where x.tenant_id = au.tenant_id
      and x.role = 'admin'
  );

-- Keep the denormalized login email current for the rows just promoted, so
-- staff lists render without reading auth.users.
update public.app_users au
set email = u.email
from auth.users u
where u.id = au.user_id
  and au.email is null;

-- The invariant, enforced. Zero tenants had two owners when this was written,
-- so this cannot fail on existing data; from here it is what makes the
-- demote-then-promote ordering in tenant-ownership-service.ts load-bearing.
create unique index if not exists app_users_one_owner_per_tenant
  on public.app_users (tenant_id)
  where is_owner and tenant_id is not null;
