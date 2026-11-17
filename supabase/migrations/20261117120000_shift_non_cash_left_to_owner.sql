-- "I'll leave this to the owner" at End shift was refused (2026-11-17, SofiasKitchen).
--
-- The merchant app sends a GCash/card row the cashier did not check as
-- check = 'unchecked' (webnegosyo-app/components/cash/non-cash.ts), while the
-- database only knew 'skipped' (20261027150000). close_shift answered
-- "The card and e-wallet tallies are not valid." and the cashier could not
-- end the shift at all. No closed shift on platform ever stored 'unchecked'
-- (probed 2026-11-17: 122 matches, 2 different), so every "leave it to the
-- owner" close since the feature shipped was refused.
--
-- Fix, for every installed app build:
--   1. the validator also accepts 'unchecked';
--   2. a BEFORE trigger stores it as the canonical 'skipped', so the day-close
--      checklist (get_day_close_status.nonCashUnchecked, which looks for
--      'skipped') still lists the row for the owner.
-- Newer app builds send 'skipped' directly.

create or replace function cash.non_cash_tallies_valid(p_tallies jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_tallies) = 'array'
     and jsonb_array_length(p_tallies) <= 20
     and not exists (
       select 1 from jsonb_array_elements(p_tallies) t
        where jsonb_typeof(t) <> 'object'
           or exists (select 1 from jsonb_object_keys(t) k
                       -- (the 20261027120300 shape {method, declaredCents, slipCount} is a subset)
                       where k not in ('key', 'method', 'expectedCents', 'slipCount', 'check', 'declaredCents', 'note'))
           or jsonb_typeof(t -> 'method') is distinct from 'string'
           or char_length(btrim(t ->> 'method')) not between 1 and 60
           or (t ? 'key' and (jsonb_typeof(t -> 'key') <> 'string' or char_length(t ->> 'key') > 120))
           -- 'unchecked' = the app's word for 'skipped' (stored as 'skipped', see below)
           or (t ? 'check' and (jsonb_typeof(t -> 'check') <> 'string' or (t ->> 'check') not in ('matches', 'different', 'skipped', 'unchecked')))
           or (t ? 'declaredCents' and jsonb_typeof(t -> 'declaredCents') <> 'null'
               and coalesce(cash.json_whole(t -> 'declaredCents') not between 0 and 10000000000, true))
           or (t ? 'expectedCents' and jsonb_typeof(t -> 'expectedCents') <> 'null'
               and cash.json_whole(t -> 'expectedCents') is null)
           or (t ? 'slipCount' and jsonb_typeof(t -> 'slipCount') <> 'null'
               and coalesce(cash.json_whole(t -> 'slipCount') not between 0 and 100000, true))
           or (t ? 'note' and jsonb_typeof(t -> 'note') <> 'null'
               and (jsonb_typeof(t -> 'note') <> 'string' or char_length(t ->> 'note') > 200))
           or ((t ->> 'check') = 'different' and cash.json_whole(t -> 'declaredCents') is null));
$$;
revoke all on function cash.non_cash_tallies_valid(jsonb) from public, anon;
grant execute on function cash.non_cash_tallies_valid(jsonb) to authenticated, service_role;

-- Store 'unchecked' as 'skipped'. Anything that is not an array of objects is
-- left alone for the validator (trg_staff_shift_zz_business_day) to refuse.
create or replace function cash.normalize_shift_non_cash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.closing_non_cash) = 'array'
     and exists (select 1 from jsonb_array_elements(new.closing_non_cash) t
                  where jsonb_typeof(t) = 'object' and t ->> 'check' = 'unchecked') then
    new.closing_non_cash := (
      select jsonb_agg(case when jsonb_typeof(t) = 'object' and t ->> 'check' = 'unchecked'
                            then t || '{"check": "skipped"}'::jsonb
                            else t end
                       order by ord)
        from jsonb_array_elements(new.closing_non_cash) with ordinality as e(t, ord));
  end if;
  return new;
end;
$$;
revoke all on function cash.normalize_shift_non_cash() from public, anon, authenticated;

drop trigger if exists trg_staff_shift_non_cash_check on public.staff_shifts;
create trigger trg_staff_shift_non_cash_check
  before insert or update of closing_non_cash on public.staff_shifts
  for each row execute function cash.normalize_shift_non_cash();
