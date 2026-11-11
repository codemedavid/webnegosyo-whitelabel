-- ===========================================================================
-- Staff seat floor reads the tenant's own allowance
-- ===========================================================================
-- `enforce_staff_limit` (20260802120000) still hard-coded 3 seats per pool
-- after 20260808130000 made the allowance a per-tenant column
-- (`tenants.max_staff_per_branch`). The web action and the manage-staff edge
-- function both honour the column, so a store a superadmin raised to 5 seats
-- was offered a 4th account and then refused by this trigger with "at most 3
-- store-wide staff accounts" (2026-10-29).
--
-- Now:
--   * the limit is `tenants.max_staff_per_branch`, resolved exactly like
--     `resolveStaffLimit` (src/lib/billing/subscription-status.ts): a negative
--     or missing value means the platform default of 3; 0 is a real plan
--     (owner-only store);
--   * the check runs only when a row ENTERS a pool (insert, or an update that
--     changes role / is_owner / tenant / branch). Lowering an allowance takes
--     nothing away — the caps bite on create only, as updateTenantLimitsAction
--     promises — so a permission edit on a store above its allowance saves;
--   * SECURITY DEFINER so the count and the allowance are read whole even when
--     the inserting role's RLS would hide rows; a per-tenant transaction lock
--     stops two simultaneous creates from both taking the last seat.
--
-- Regression runner: tests/sql/run-staff-limit-allowance.cjs.
-- ===========================================================================

create or replace function public.enforce_staff_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  default_seats constant integer := 3;
  seat_limit integer;
  peer_count integer;
begin
  if new.role is distinct from 'admin'
     or new.is_owner is distinct from false
     or new.tenant_id is null then
    return new;
  end if;

  -- Same pool as before the update: nothing new is being handed out.
  if tg_op = 'UPDATE'
     and old.role is not distinct from new.role
     and old.is_owner is not distinct from new.is_owner
     and old.tenant_id is not distinct from new.tenant_id
     and old.outlet_id is not distinct from new.outlet_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('enforce_staff_limit:' || new.tenant_id::text, 0));

  select case when t.max_staff_per_branch >= 0 then t.max_staff_per_branch end
    into seat_limit
    from public.tenants t
   where t.id = new.tenant_id;
  seat_limit := coalesce(seat_limit, default_seats);

  select count(*) into peer_count
    from public.app_users
   where tenant_id = new.tenant_id
     and role = 'admin'
     and is_owner = false
     and user_id <> new.user_id
     -- Same pool as the incoming row: its branch, or the store-wide pool.
     and outlet_id is not distinct from new.outlet_id;

  if peer_count >= seat_limit then
    if new.outlet_id is null then
      raise exception 'Staff limit reached: a store may have at most % store-wide staff accounts', seat_limit;
    else
      raise exception 'Staff limit reached: a branch may have at most % staff accounts', seat_limit;
    end if;
  end if;

  return new;
end;
$$;

-- A trigger function is never an API call.
revoke execute on function public.enforce_staff_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rollback (manual): restore the 20260802120000 body (hard-coded 3, invoker)
-- with `set search_path = public, pg_temp` (20260829140000).
-- ---------------------------------------------------------------------------
