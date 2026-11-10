-- ===========================================================================
-- Inventory follow-ups to the 2026-11-03 consolidation (all already applied):
--   1. tracking starts at the first delivery, not at minus the untracked sales
--   2. the definer helpers stop answering for other stores
--   3. a stocktake joins only an OPEN count of ITS branch
--   4. the five new policies read auth.uid() once per statement
-- Idempotent. Runner: tests/sql/run-inventory-followups.cjs.
-- Notes: docs/testing/lolys-inventory-consolidation.tdd.md ("20261105120000").
-- ===========================================================================

set lock_timeout = '3s';

-- A schema PostgREST does not expose (like `reporting` and `cash`): functions
-- here are reachable from triggers and policies, never over /rest/v1/rpc.
create schema if not exists inventory_private;
revoke all on schema inventory_private from public, anon;
grant usage on schema inventory_private to authenticated, service_role;

-- ===========================================================================
-- 1. Tracking starts at the first delivery.
--
-- A never-counted shelf (counted_at NULL, 20261103120000) has no stock limit,
-- but it still runs below zero sale after sale (Loly's Cold cup at -65). Until
-- now the first delivery ADDED to that phantom balance: receive 5 -> -60, and
-- because the shelf was now counted, every dish using it read "sold out".
--
-- Now the first receive / transfer arrival on a shelf that is uncounted AND
-- below zero first writes a correcting stocktake that brings the shelf to 0
-- (same actor, 1 ms earlier, note "Tracking started: ...", opens_tracking =
-- true), then the delivery lands on 0. The ledger stays append-only and
-- sum(quantity_delta) = current_qty. A counted shelf, a shelf at >= 0 and a
-- shelf with no row are unchanged (plain add).
--
-- The correction is NOT a cost event: the untracked sales already booked
-- their cost when they happened, so the correction carries unit_cost NULL
-- (never a frozen cost — a +65 "found" line would otherwise cancel those
-- costs as a negative count loss in the profit report). It is a stocktake
-- with inventory_count_id NULL, so Store Activity shows "<item> set to 0
-- (+65 pcs)" with the note. Reports may skip opens_tracking rows outright.
-- ===========================================================================

alter table public.stock_movements
  add column if not exists opens_tracking boolean not null default false;

comment on column public.stock_movements.opens_tracking is
  'Database-written correction: the stocktake that brought a never-counted, below-zero shelf to 0 right before its first delivery or transfer arrival. Uncosted; not a count variance. Clients cannot set it.';

-- The correction itself. Definer: it writes the ledger as the database (the
-- client guard, RLS and actor stamping are for client writes; the caller has
-- already passed them for the delivery that triggered it). Only callable from
-- inside a trigger.
create or replace function inventory_private.open_shelf_tracking(
  p_tenant_id uuid,
  p_item_id uuid,
  p_outlet_id uuid,
  p_actor uuid,
  p_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty numeric;
  v_counted_at timestamptz;
begin
  if pg_trigger_depth() < 1 then
    raise exception 'open_shelf_tracking is only called by the stock ledger' using errcode = '42501';
  end if;

  -- Same lock order as apply_stock_movement (ingredient, then shelf), so two
  -- first deliveries queue here and the second one sees counted_at set.
  perform 1
    from public.inventory_items i
   where i.id = p_item_id and i.tenant_id = p_tenant_id
     for update;
  if not found then
    return false;  -- apply_stock_movement refuses the delivery itself
  end if;

  select s.current_qty, s.counted_at
    into v_qty, v_counted_at
    from public.inventory_stock s
   where s.tenant_id = p_tenant_id
     and s.inventory_item_id = p_item_id
     and s.outlet_id is not distinct from p_outlet_id
     for update;

  if not found or v_counted_at is not null or v_qty >= 0 then
    return false;
  end if;

  insert into public.stock_movements
    (tenant_id, inventory_item_id, outlet_id, reason, quantity_delta, target_qty,
     note, created_by, created_at, opens_tracking)
  values
    (p_tenant_id, p_item_id, p_outlet_id, 'stocktake', -v_qty, 0,
     'Tracking started: earlier untracked sales cleared', p_actor,
     p_at - interval '1 millisecond', true);
  return true;
end;
$$;

revoke all on function inventory_private.open_shelf_tracking(uuid, uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function inventory_private.open_shelf_tracking(uuid, uuid, uuid, uuid, timestamptz) to authenticated, service_role;

-- BEFORE INSERT, after the client guard (00) and before stock_movements_apply.
-- Invoker, so it can tell a client write (actor = auth.uid(), time = now(),
-- exactly what stamp_client_actor will stamp on the delivery) from a server
-- write (actor/time as the server sent them).
create or replace function public.stock_movements_open_tracking()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_client boolean := current_user in ('anon', 'authenticated');
begin
  -- Only the database's own correction (a nested insert) may carry the flag.
  if pg_trigger_depth() <= 1 then
    new.opens_tracking := false;
  end if;

  if new.opens_tracking
     or new.reason not in ('receive', 'transfer_in')
     or coalesce(new.quantity_delta, 0) <= 0 then
    return new;
  end if;

  perform inventory_private.open_shelf_tracking(
    new.tenant_id,
    new.inventory_item_id,
    new.outlet_id,
    case when v_is_client then auth.uid() else new.created_by end,
    case when v_is_client then now() else coalesce(new.created_at, now()) end
  );
  return new;
end;
$$;

revoke all on function public.stock_movements_open_tracking() from public, anon, authenticated;

drop trigger if exists stock_movements_05_open_tracking on public.stock_movements;
create trigger stock_movements_05_open_tracking
  before insert on public.stock_movements
  for each row execute function public.stock_movements_open_tracking();

-- Runs right after stock_movements_apply (which freezes every non-receive
-- cost): the correction stays uncosted.
create or replace function public.stock_movements_opening_uncosted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.unit_cost := null;
  return new;
end;
$$;

revoke all on function public.stock_movements_opening_uncosted() from public, anon, authenticated;

drop trigger if exists stock_movements_apply_opening_uncosted on public.stock_movements;
create trigger stock_movements_apply_opening_uncosted
  before insert on public.stock_movements
  for each row
  when (new.opens_tracking)
  execute function public.stock_movements_opening_uncosted();

-- ===========================================================================
-- 2. Guard helpers answer only inside the caller's own store.
--
-- The five definer helpers of 20261103130000/130100/130300 were in `public`
-- and EXECUTE for authenticated, so any signed-in account could ask "does
-- store X's transfer have ledger rows / is that unit in use / is that branch
-- theirs" over the API. They are needed only by the (invoker) guards and the
-- audit-log policy, which run as the caller, so EXECUTE cannot simply be
-- revoked. Now: they live in inventory_private (not exposed), AND a caller
-- outside the store (not a member, superadmin or platform staff) gets the
-- REFUSING constant — the answer that blocks the guarded write — which says
-- nothing about the store. The guards are repointed (live bodies, only the
-- schema of the helper changed) and the public copies dropped.
-- ===========================================================================

create or replace function inventory_private.caller_in_store(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users au
     where au.user_id = auth.uid()
       and (au.tenant_id = p_tenant_id or au.role in ('superadmin', 'platform_staff'))
  );
$$;

revoke all on function inventory_private.caller_in_store(uuid) from public, anon, authenticated;

create or replace function inventory_private.inventory_item_has_stock_on_any_shelf(p_tenant_id uuid, p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not inventory_private.caller_in_store(p_tenant_id)
      or exists (
        select 1 from public.inventory_stock s
         where s.tenant_id = p_tenant_id
           and s.inventory_item_id = p_item_id
           and s.current_qty <> 0
      );
$$;

create or replace function inventory_private.inventory_units_in_use(p_tenant_id uuid, p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not inventory_private.caller_in_store(p_tenant_id)
      or exists (select 1 from public.inventory_items i where i.tenant_id = p_tenant_id and i.stock_unit_id = p_unit_id)
      or exists (select 1 from public.recipe_components c where c.tenant_id = p_tenant_id and c.unit_id = p_unit_id)
      or exists (select 1 from public.recipes r where r.tenant_id = p_tenant_id and r.yield_unit_id = p_unit_id);
$$;

create or replace function inventory_private.stock_transfer_has_movements(p_transfer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
           select 1 from public.stock_transfers t
            where t.id = p_transfer_id and inventory_private.caller_in_store(t.tenant_id)
         )
      or exists (select 1 from public.stock_movements m where m.stock_transfer_id = p_transfer_id);
$$;

create or replace function inventory_private.inventory_count_has_movements(p_count_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
           select 1 from public.inventory_counts c
            where c.id = p_count_id and inventory_private.caller_in_store(c.tenant_id)
         )
      or exists (select 1 from public.stock_movements m where m.inventory_count_id = p_count_id);
$$;

create or replace function inventory_private.inventory_outlet_in_tenant(p_tenant_id uuid, p_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select inventory_private.caller_in_store(p_tenant_id)
     and (p_outlet_id is null
          or exists (select 1 from public.outlets o where o.id = p_outlet_id and o.tenant_id = p_tenant_id));
$$;

revoke all on function inventory_private.inventory_item_has_stock_on_any_shelf(uuid, uuid) from public, anon;
revoke all on function inventory_private.inventory_units_in_use(uuid, uuid) from public, anon;
revoke all on function inventory_private.stock_transfer_has_movements(uuid) from public, anon;
revoke all on function inventory_private.inventory_count_has_movements(uuid) from public, anon;
revoke all on function inventory_private.inventory_outlet_in_tenant(uuid, uuid) from public, anon;
grant execute on function inventory_private.inventory_item_has_stock_on_any_shelf(uuid, uuid) to authenticated, service_role;
grant execute on function inventory_private.inventory_units_in_use(uuid, uuid) to authenticated, service_role;
grant execute on function inventory_private.stock_transfer_has_movements(uuid) to authenticated, service_role;
grant execute on function inventory_private.inventory_count_has_movements(uuid) to authenticated, service_role;
grant execute on function inventory_private.inventory_outlet_in_tenant(uuid, uuid) to authenticated, service_role;

-- Live bodies (pg_get_functiondef, 2026-11-05); only the helper's schema changed.
CREATE OR REPLACE FUNCTION public.stock_transfers_lifecycle_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception 'A transfer starts as a draft.' using errcode = '42501';
    end if;
    if not public.inventory_may_act_for_branch(new.tenant_id, new.from_outlet_id) then
      raise exception 'Only the sending branch can draft a transfer.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' or inventory_private.stock_transfer_has_movements(old.id) then
      raise exception 'A transfer that moved stock cannot be deleted. Cancel a draft instead.'
        using errcode = '42501';
    end if;
    if not public.inventory_may_act_for_branch(old.tenant_id, old.from_outlet_id) then
      raise exception 'Only the sending branch can delete a draft transfer.' using errcode = '42501';
    end if;
    return old;
  end if;

  if (new.tenant_id, new.from_outlet_id, new.to_outlet_id)
     is distinct from (old.tenant_id, old.from_outlet_id, old.to_outlet_id) then
    if old.status <> 'draft' then
      raise exception 'A transfer''s branches cannot change once it is sent.' using errcode = '42501';
    end if;
    if not public.inventory_may_act_for_branch(new.tenant_id, new.from_outlet_id) then
      raise exception 'Only the sending branch can draft a transfer.' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status in ('sent', 'cancelled') then
      if not public.inventory_may_act_for_branch(old.tenant_id, old.from_outlet_id) then
        raise exception 'Only the sending branch can send or cancel a transfer.' using errcode = '42501';
      end if;
    elsif old.status = 'sent' and new.status = 'received' then
      if not public.inventory_may_act_for_branch(old.tenant_id, old.to_outlet_id) then
        raise exception 'Only the receiving branch can count a transfer in.' using errcode = '42501';
      end if;
    else
      raise exception 'A % transfer cannot be marked %.', old.status, new.status using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_counts_lifecycle_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if inventory_private.inventory_count_has_movements(old.id) then
      raise exception 'A count with recorded stocktakes cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status = 'closed' and new.status is distinct from 'closed' then
    raise exception 'A closed count stays closed. Start a new count instead.' using errcode = '42501';
  end if;

  if (new.tenant_id, new.outlet_id) is distinct from (old.tenant_id, old.outlet_id)
     and inventory_private.inventory_count_has_movements(old.id) then
    raise exception 'A count with recorded stocktakes cannot move to another branch.' using errcode = '42501';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_items_stock_unit_shelf_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.stock_unit_id is distinct from old.stock_unit_id
     and inventory_private.inventory_item_has_stock_on_any_shelf(old.tenant_id, old.id) then
    raise exception 'Change the stock unit only while every branch holds zero of this ingredient. Count it to zero first.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_units_meaning_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return new;
  end if;
  if (new.to_base_factor, new.dimension) is distinct from (old.to_base_factor, old.dimension)
     and inventory_private.inventory_units_in_use(old.tenant_id, old.id) then
    raise exception 'This unit is in use by an ingredient or recipe, so its size cannot change. Add a new unit instead.'
      using errcode = '42501';
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'A unit cannot move to another store' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- ===========================================================================
-- 4. Policies: auth.uid() once per statement (advisor auth_rls_initplan), and
--    one SELECT policy per table where two said "member" and "superadmin"
--    (advisor multiple_permissive_policies). Same rows visible as before.
--    The audit-log policy also moves to the private helper (item 2).
-- ===========================================================================

drop policy if exists stock_alerts_select_branch on public.stock_alerts;
drop policy if exists stock_alerts_select_superadmin on public.stock_alerts;
drop policy if exists stock_alerts_select_member on public.stock_alerts;
create policy stock_alerts_select_member on public.stock_alerts
  for select to authenticated
  using (
    exists (
      select 1 from public.app_users au
       where au.user_id = (select auth.uid()) and au.role = 'superadmin'
    )
    or (
      exists (
        select 1 from public.app_users au
         where au.user_id = (select auth.uid())
           and au.tenant_id = stock_alerts.tenant_id
           and au.role = any (array['admin', 'superadmin'])
      )
      and (outlet_id is null or public.app_user_may_reach_branch(tenant_id, outlet_id))
    )
  );

drop policy if exists presell_stock_select_superadmin on public.presell_stock;
drop policy if exists presell_stock_select_member on public.presell_stock;
create policy presell_stock_select_member on public.presell_stock
  for select to authenticated
  using (
    exists (
      select 1 from public.app_users au
       where au.user_id = (select auth.uid()) and au.role = 'superadmin'
    )
    or tenant_id in (
      select au.tenant_id from public.app_users au
       where au.user_id = (select auth.uid()) and au.role = any (array['admin', 'superadmin'])
    )
  );

drop policy if exists inventory_audit_log_insert_branch on public.inventory_audit_log;
create policy inventory_audit_log_insert_branch on public.inventory_audit_log
  for insert to authenticated
  with check (
    public.app_user_may_reach_branch(tenant_id, outlet_id)
    and public.app_user_has_permission(tenant_id, 'inventory')
    and actor_user_id = (select auth.uid())
    and event = 'manual_movement'
    and outcome = 'applied'
    and order_id is null
    and inventory_private.inventory_outlet_in_tenant(tenant_id, outlet_id)
    and (not is_suspected_duplicate or public.inventory_recent_own_movements(tenant_id) >= 2)
  );

-- Nothing points at the public copies any more (guards repointed above, the
-- policy recreated; no app code calls them).
drop function if exists public.inventory_item_has_stock_on_any_shelf(uuid, uuid);
drop function if exists public.inventory_units_in_use(uuid, uuid);
drop function if exists public.stock_transfer_has_movements(uuid);
drop function if exists public.inventory_count_has_movements(uuid);
drop function if exists public.inventory_outlet_in_tenant(uuid, uuid);

-- ===========================================================================
-- 3. A stocktake joins only an OPEN count of its OWN branch.
--
-- The live check only asked "same store". A stocktake could be filed under a
-- closed count (rewriting what that finished count covered) or under another
-- branch's count. Both web and app close a count by flipping its status AFTER
-- every stocktake of the session has been written (count-session-service.ts),
-- and pick the open count of the movement's own shelf, so neither flow trips
-- this. Checked on INSERT and when inventory_count_id changes; for every role.
-- Live body (2026-11-05) plus the two checks.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.stock_movement_count_session_is_valid()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
  v_outlet uuid;
BEGIN
  IF NEW.inventory_count_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reason <> 'stocktake' THEN
    RAISE EXCEPTION 'Only a stocktake may belong to a count session (got %)', NEW.reason;
  END IF;

  SELECT c.status, c.outlet_id INTO v_status, v_outlet
    FROM inventory_counts c
   WHERE c.id = NEW.inventory_count_id AND c.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Count session belongs to a different store';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.inventory_count_id IS NOT DISTINCT FROM OLD.inventory_count_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'This stock count is already closed. Save the count on its own, or start a new count.'
      USING ERRCODE = '23514';
  END IF;
  IF v_outlet IS DISTINCT FROM NEW.outlet_id THEN
    RAISE EXCEPTION 'This stock count is for another branch.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
