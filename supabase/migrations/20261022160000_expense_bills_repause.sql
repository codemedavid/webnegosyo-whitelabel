-- Bills to pay: re-pausing a bill whose timed pause already ran out starts a
-- NEW pause window (fix to 20261022150000).
--
-- Before: a bill paused "until 25 Oct" keeps status 'paused' after that day
-- (the engine reads it as active again). Pausing it again on 2 Nov kept the
-- old paused_on (1 Oct), so the new window [1 Oct, …) silently forgave the
-- payments owed between 25 Oct and 2 Nov.
-- Now: paused_on is kept only while the old pause is still running
-- (paused_until NULL or after today); otherwise it is stamped today.
--
-- Body copied from 20261022150000; only the paused_on branch changes.
-- No row is updated. Rollback: re-run expense_bills_guard from 20261022150000.
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

  -- The pause window is the database's: stamped when a pause begins, kept
  -- while the SAME pause is still running, re-stamped when a pause that ran
  -- out is set again, cleared otherwise. Whatever a client sends is ignored.
  if new.status = 'paused' then
    if tg_op = 'UPDATE' and old.status = 'paused'
       and (old.paused_until is null or old.paused_until > v_today) then
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

revoke all on function public.expense_bills_guard() from public, anon, authenticated;
