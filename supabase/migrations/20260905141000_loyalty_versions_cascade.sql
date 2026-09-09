-- supabase/migrations/20260905141000_loyalty_versions_cascade.sql
--
-- The immutability trigger on loyalty_program_versions (20260905140000) fired
-- on EVERY delete, including the cascade from a deleted program or tenant —
-- so deleting a tenant with a loyalty program would have failed outright.
--
-- Versions stay immutable to every direct writer: UPDATE is always refused,
-- and DELETE is refused while the owning program still exists. Only the
-- cascade, which runs after its parent row is gone, is let through.

create or replace function public.loyalty_program_versions_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.loyalty_programs where id = old.program_id
  ) then
    return old;
  end if;
  raise exception 'loyalty_program_versions is immutable: write a new version instead'
    using errcode = 'integrity_constraint_violation';
end;
$$;

revoke all on function public.loyalty_program_versions_immutable() from public, anon, authenticated;
