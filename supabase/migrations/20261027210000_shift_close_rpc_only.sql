-- ===========================================================================
-- Shifts end only through close_shift / force_close_shift (release review
-- 2026-10-27, decision D2).
--
-- DO NOT APPLY until no store has closed a shift the old way for 7 days
-- (RELEASE.md phase G, probe below). Until then an old build (≤ 1.0.14) ends a
-- shift with a direct UPDATE of staff_shifts: no count, no hand-over, and a
-- closing figure the register chose. On a blind store that is already refused
-- (20261027150000); this refuses it on every store, so a shift's cash always
-- goes through the count and becomes a hand-over.
--
-- What changes: a CLIENT role (anon / authenticated) moving a shift from open
-- to closed without the RPC mark (cash.shift_rpc_mark = 'close') gets 42501
-- "update the app". Service-role writes (imports, support) are untouched, and
-- so is every other update of an open shift.
--
-- The new build (1.0.15) closes through close_shift whenever the database has
-- it, and falls back to the direct close only when it does not (PGRST202),
-- which cannot happen once 20261027150000 is applied.
--
-- Gate probe (read-only; 0 rows over the last 7 days = safe):
--   begin; set local statement_timeout = '5s';
--   select t.slug, count(*) from public.staff_shifts s join public.tenants t on t.id = s.tenant_id
--    where s.status = 'closed' and s.closed_at >= now() - interval '7 days'
--      and s.close_kind = 'counted'
--      and not exists (select 1 from public.shift_counts c where c.shift_id = s.id)
--    group by 1 order by 2 desc limit 50;
--   rollback;
-- Runner: tests/sql/run-shift-close-rpc-only.cjs.
-- ===========================================================================

set lock_timeout = '3s';

create or replace function cash.refuse_direct_shift_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and cash.shift_rpc_mark(old.id) <> 'close' then
    raise exception 'update_required: update the app to end a shift (count the drawer, then hand over).' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function cash.refuse_direct_shift_close() from public, anon;
grant execute on function cash.refuse_direct_shift_close() to authenticated;

drop trigger if exists trg_staff_shift_close_rpc_only on public.staff_shifts;
create trigger trg_staff_shift_close_rpc_only before update of status on public.staff_shifts
  for each row when (old.status = 'open' and new.status = 'closed')
  execute function cash.refuse_direct_shift_close();

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- drop trigger if exists trg_staff_shift_close_rpc_only on public.staff_shifts;
-- drop function if exists cash.refuse_direct_shift_close();
