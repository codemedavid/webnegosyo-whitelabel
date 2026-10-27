-- Bills to pay — review fixes (docs/plans/expenses/bills-contract.md §2).
-- 20261022140000_expense_bills.sql is APPLIED live and is never edited; this
-- migration fixes forward.
--
-- What:
--   * expense_bills.paused_on (M/H2) — the day a pause began. With paused_until
--     it is the window whose due dates are never owed, so a timed pause that
--     ran out does not bring its months back as late. Stamped by the bills
--     guard (Manila today) when a bill goes from not-paused to paused, kept
--     while it stays paused (a new end date is the same pause), cleared
--     otherwise. Existing rows stay NULL (no backfill; the engine reads NULL as
--     "everything before paused_until").
--   * expense_bills_guard (L7) — a client may not pause until a day already
--     here (22023 pause_until_past). Body copied from 20261022140000; only the
--     paused_on / pause_until_past lines are new.
--   * expense_bill_marks UPDATE (L3) — "Remind me tomorrow" again is ONE upsert
--     (on conflict (bill_id, due_on)), so a failed write never loses the old
--     mark. UPDATE grant + policy (same rule as insert); the marks guard now
--     also runs on UPDATE and keeps id / tenant / bill / due date fixed.
--   * expenses_bill_reach (M1) — a NEW SECURITY INVOKER trigger
--     (expenses_35_bill_reach, after expenses_30_integrity so a cross-store bill
--     still reads "Bill belongs to a different store"). For client roles:
--       - a drawer row INSERTed by a client never names a bill (v1 bills are
--         never paid from the drawer): bill_id / bill_due_on are dropped;
--       - linking (INSERT with a bill, or UPDATE of bill_id / bill_due_on)
--         needs the bill to be visible under the CALLER's RLS (expenses key +
--         branch reach), else 42501 "That bill isn't one you can see";
--       - a branch's bill is paid only from that branch (expense outlet =
--         bill outlet; a store-wide bill may be paid from anywhere);
--       - unlinking / moving a payment needs the OLD bill visible too.
--     A replacement (replace_expense; expenses_guard only lets that function
--     set replaces_expense_id) carries its original's link and is not
--     re-checked. The service role is never checked.
--
-- Why: review of the Bills to pay build (2026-10-22): a branch-locked
-- `expenses` holder could settle the owner's store-wide rent or another
-- branch's bill; a timed pause brought its months back as late; re-snoozing
-- was delete-then-insert.
--
-- No existing row is updated. New column is nullable with no default.
--
-- Rollback (manual, in this order):
--   drop trigger if exists expenses_35_bill_reach on public.expenses;
--   drop function if exists public.expenses_bill_reach();
--   drop policy if exists expense_bill_marks_update on public.expense_bill_marks;
--   revoke update on public.expense_bill_marks from authenticated;
--   re-run expense_bills_guard + expense_bill_marks_guard (+ its insert-only
--     trigger) from 20261022140000;
--   alter table public.expense_bills drop constraint if exists expense_bills_paused_on_ck,
--     drop constraint if exists expense_bills_paused_window_ck, drop column if exists paused_on;

set lock_timeout = '3s';

-- ============================================
-- 1. expense_bills.paused_on
-- ============================================
alter table public.expense_bills add column if not exists paused_on date;

comment on column public.expense_bills.paused_on is
  'The Manila day the current pause began (only while paused; stamped by expense_bills_guard). Due dates in [paused_on, paused_until) are never owed. NULL on pauses saved before 2026-10-22.';

alter table public.expense_bills drop constraint if exists expense_bills_paused_on_ck;
alter table public.expense_bills add constraint expense_bills_paused_on_ck
  check (paused_on is null or status = 'paused');

alter table public.expense_bills drop constraint if exists expense_bills_paused_window_ck;
alter table public.expense_bills add constraint expense_bills_paused_window_ck
  check (paused_on is null or paused_until is null or paused_on <= paused_until);

-- ============================================
-- 2. expense_bills_guard (from 20261022140000) + paused_on + no pause into the past
-- ============================================
create or replace function public.expense_bills_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client boolean := current_user in ('anon', 'authenticated');
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  new.name := btrim(new.name);
  new.paid_to_name := nullif(btrim(new.paid_to_name), '');

  -- The pause window is the database's: stamped when a bill becomes paused,
  -- kept while it stays paused (a new end date is the same pause), cleared
  -- otherwise. Whatever a client sends for paused_on is ignored.
  if new.status = 'paused' then
    if tg_op = 'UPDATE' and old.status = 'paused' then
      new.paused_on := old.paused_on;
    else
      -- least(): only the service role may pause until a day already gone (repairs).
      new.paused_on := least(v_today, coalesce(new.paused_until, v_today));
    end if;
  else
    new.paused_on := null;
  end if;

  -- A pause ends on a day still ahead (an end date already here pauses nothing).
  if v_client
     and new.status = 'paused'
     and new.paused_until is not null
     and new.paused_until <= v_today
     and (tg_op = 'INSERT' or old.status <> 'paused' or new.paused_until is distinct from old.paused_until) then
    raise exception 'pause_until_past' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if v_client then
      if new.status = 'ended' then
        raise exception 'A bill starts active or paused' using errcode = '42501';
      end if;
      new.created_by := auth.uid();
      new.created_by_name := coalesce(public.expense_actor_name(), 'Staff');
      new.created_at := now();
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'A bill cannot move to another store' using errcode = '42501';
  end if;
  if v_client then
    -- Nobody rewrites who made the bill.
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    -- A stopped bill is history: its past payments stay, it never comes back.
    if old.status = 'ended'
       and (to_jsonb(new) - 'updated_at') <> (to_jsonb(old) - 'updated_at') then
      raise exception 'This bill was stopped and cannot change' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================
-- 3. expense_bill_marks: one UPDATE instead of delete + insert
-- ============================================

-- expense_bill_marks_guard (from 20261022140000) + UPDATE keeps the mark on its
-- bill and due date. Still SECURITY INVOKER: the bill is read under the
-- caller's RLS (a bill it cannot see is one it may not mark).
create or replace function public.expense_bill_marks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.id is distinct from old.id
          or new.tenant_id is distinct from old.tenant_id
          or new.bill_id is distinct from old.bill_id
          or new.due_on is distinct from old.due_on) then
    raise exception 'A mark stays on its bill and due date' using errcode = '42501';
  end if;
  if not exists (select 1 from public.expense_bills b where b.id = new.bill_id and b.tenant_id = new.tenant_id) then
    raise exception 'Bill belongs to a different store' using errcode = '42501';
  end if;
  if current_user in ('anon', 'authenticated') then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists expense_bill_marks_guard on public.expense_bill_marks;
create trigger expense_bill_marks_guard
  before insert or update on public.expense_bill_marks
  for each row execute function public.expense_bill_marks_guard();

revoke all on function public.expense_bills_guard() from public, anon, authenticated;
revoke all on function public.expense_bill_marks_guard() from public, anon, authenticated;

grant update on public.expense_bill_marks to authenticated;

drop policy if exists expense_bill_marks_update on public.expense_bill_marks;
create policy expense_bill_marks_update on public.expense_bill_marks for update to authenticated
  using (
    public.app_user_has_permission(expense_bill_marks.tenant_id, 'expenses')
    and exists (
      select 1 from public.expense_bills b
       where b.id = expense_bill_marks.bill_id and b.tenant_id = expense_bill_marks.tenant_id
    )
  )
  with check (
    public.app_user_has_permission(expense_bill_marks.tenant_id, 'expenses')
    and exists (
      select 1 from public.expense_bills b
       where b.id = expense_bill_marks.bill_id and b.tenant_id = expense_bill_marks.tenant_id
    )
  );

-- ============================================
-- 4. expenses_bill_reach — only a bill you can see, from its own branch
-- ============================================
-- SECURITY INVOKER on purpose: current_user tells a client from the service
-- role, and the bill is read under the CALLER's expense_bills policy, so "not
-- your branch", "not your store" and "no expenses key" are one answer.
create or replace function public.expenses_bill_reach()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_outlet uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A replacement carries its original's link (replace_expense); not re-checked.
    if new.replaces_expense_id is not null then
      return new;
    end if;
    -- v1 bills are never paid from the drawer: a client's drawer row names none.
    if new.paid_from = 'drawer' then
      new.bill_id := null;
      new.bill_due_on := null;
    end if;
    if new.bill_id is null then
      return new;
    end if;
  else
    if new.bill_id is not distinct from old.bill_id and new.bill_due_on is not distinct from old.bill_due_on then
      return new;
    end if;
    -- Taking a payment off a bill (or moving it) needs that bill in reach too.
    if old.bill_id is not null
       and not exists (select 1 from public.expense_bills b where b.id = old.bill_id and b.tenant_id = old.tenant_id) then
      raise exception 'That bill isn''t one you can see' using errcode = '42501';
    end if;
    if new.bill_id is null then
      return new;
    end if;
  end if;

  select b.outlet_id into v_outlet
    from public.expense_bills b
   where b.id = new.bill_id and b.tenant_id = new.tenant_id;
  if not found then
    raise exception 'That bill isn''t one you can see' using errcode = '42501';
  end if;
  if v_outlet is not null and new.outlet_id is distinct from v_outlet then
    raise exception 'A branch bill is paid from its own branch' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_35_bill_reach on public.expenses;
create trigger expenses_35_bill_reach
  before insert or update on public.expenses
  for each row execute function public.expenses_bill_reach();

revoke all on function public.expenses_bill_reach() from public, anon, authenticated;

reset lock_timeout;
