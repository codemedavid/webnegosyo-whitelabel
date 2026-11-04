-- ===========================================================================
-- Inventory permission hardening, part 2: transfer and count lifecycles.
-- (inventory DB security audit 2026-11-03, findings M3 and L1)
--
-- M3 stock_transfers / stock_transfer_lines / inventory_counts are FOR ALL for
--    any account that reaches either branch, and the client guard only ran on
--    UPDATE without looking at status. So the RECEIVING branch could DELETE a
--    sent transfer (lines cascade away, stock_movements.stock_transfer_id goes
--    NULL: the ledger is rewritten) or flip a draft to `sent`; a count with
--    stocktakes could be deleted. The database now holds the lifecycle the
--    code already follows (src/lib/inventory/stock-transfer.ts
--    ALLOWED_TRANSITIONS, written by stock-transfers-service.ts — the merchant
--    app goes through the same web route):
--      insert           as `draft`, by an account that reaches the SENDING branch
--      draft -> sent    sending branch (legs written first, then the status)
--      draft -> cancelled  sending branch
--      sent -> received receiving branch (lines' received_quantity first)
--      anything else    refused; routing changes only while draft
--      delete           only a draft with no ledger rows, by the sending branch
--    Lines: added, removed or re-quantified only while the transfer is a draft;
--    received_quantity only while it is sent.
--    Counts: never reopened; deleted or moved to another branch only while no
--    stocktake belongs to them.
--    "Reaches" = app_user_may_reach_branch, or superadmin, or platform staff
--    with stores.edit (as inventory_write_needs_grant).
-- L1 "each leg once" was a plain EXISTS in stock_movements_client_guard, so
--    two racing sends could both pass. A partial unique index makes it hold.
--    Created only when live has no duplicate legs (checked 2026-11-03: 0
--    transfer movements); otherwise it is skipped with a NOTICE and no data
--    is changed.
--
-- Client roles only (anon/authenticated): service-role writers and FK cascades
-- (run as the table owner) are untouched.
-- Runner: tests/sql/run-inventory-permission-hardening.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Shared helpers.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_may_act_for_branch(p_tenant_id uuid, p_outlet_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.app_user_may_reach_branch(p_tenant_id, p_outlet_id)
      or exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin')
      or public.app_user_platform_can(array['stores.edit']);
$$;

revoke all on function public.inventory_may_act_for_branch(uuid, uuid) from public, anon;
grant execute on function public.inventory_may_act_for_branch(uuid, uuid) to authenticated, service_role;

-- Whether any ledger row points at this transfer / count. Definer: a
-- branch-locked caller cannot see the other branch's legs, and the answer must
-- not depend on that.
create or replace function public.stock_transfer_has_movements(p_transfer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.stock_movements m where m.stock_transfer_id = p_transfer_id);
$$;

create or replace function public.inventory_count_has_movements(p_count_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.stock_movements m where m.inventory_count_id = p_count_id);
$$;

revoke all on function public.stock_transfer_has_movements(uuid) from public, anon;
revoke all on function public.inventory_count_has_movements(uuid) from public, anon;
grant execute on function public.stock_transfer_has_movements(uuid) to authenticated, service_role;
grant execute on function public.inventory_count_has_movements(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- stock_transfers lifecycle.
-- ---------------------------------------------------------------------------
create or replace function public.stock_transfers_lifecycle_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
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
    if old.status <> 'draft' or public.stock_transfer_has_movements(old.id) then
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
$$;

revoke all on function public.stock_transfers_lifecycle_guard() from public, anon, authenticated;

drop trigger if exists stock_transfers_10_lifecycle on public.stock_transfers;
create trigger stock_transfers_10_lifecycle
  before insert or update or delete on public.stock_transfers
  for each row execute function public.stock_transfers_lifecycle_guard();

-- ---------------------------------------------------------------------------
-- stock_transfer_lines lifecycle.
-- ---------------------------------------------------------------------------
create or replace function public.stock_transfer_lines_lifecycle_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_status text;
  v_new_status text;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;

  if tg_op <> 'INSERT' then
    select t.status into v_old_status from public.stock_transfers t where t.id = old.transfer_id;
  end if;
  if tg_op <> 'DELETE' then
    select t.status into v_new_status from public.stock_transfers t where t.id = new.transfer_id;
  end if;

  if tg_op = 'INSERT' then
    if v_new_status is distinct from 'draft' then
      raise exception 'Lines can be added only while the transfer is a draft.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_old_status is distinct from 'draft' then
      raise exception 'Lines can be removed only while the transfer is a draft.' using errcode = '42501';
    end if;
    return old;
  end if;

  if (new.tenant_id, new.transfer_id, new.inventory_item_id, new.sent_quantity, new.unit_cost)
     is distinct from (old.tenant_id, old.transfer_id, old.inventory_item_id, old.sent_quantity, old.unit_cost)
     and (v_old_status is distinct from 'draft' or v_new_status is distinct from 'draft') then
    raise exception 'What was sent cannot change once the transfer is sent.' using errcode = '42501';
  end if;

  if new.received_quantity is distinct from old.received_quantity
     and v_new_status is distinct from 'sent' then
    raise exception 'What arrived is recorded only while the transfer is on its way.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.stock_transfer_lines_lifecycle_guard() from public, anon, authenticated;

drop trigger if exists stock_transfer_lines_10_lifecycle on public.stock_transfer_lines;
create trigger stock_transfer_lines_10_lifecycle
  before insert or update or delete on public.stock_transfer_lines
  for each row execute function public.stock_transfer_lines_lifecycle_guard();

-- ---------------------------------------------------------------------------
-- inventory_counts lifecycle.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_counts_lifecycle_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if public.inventory_count_has_movements(old.id) then
      raise exception 'A count with recorded stocktakes cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status = 'closed' and new.status is distinct from 'closed' then
    raise exception 'A closed count stays closed. Start a new count instead.' using errcode = '42501';
  end if;

  if (new.tenant_id, new.outlet_id) is distinct from (old.tenant_id, old.outlet_id)
     and public.inventory_count_has_movements(old.id) then
    raise exception 'A count with recorded stocktakes cannot move to another branch.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.inventory_counts_lifecycle_guard() from public, anon, authenticated;

drop trigger if exists inventory_counts_05_lifecycle on public.inventory_counts;
create trigger inventory_counts_05_lifecycle
  before update or delete on public.inventory_counts
  for each row execute function public.inventory_counts_lifecycle_guard();

-- ---------------------------------------------------------------------------
-- L1 each transfer leg once, enforced by an index (skipped if live already
-- holds duplicates — never rewrite them here).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from public.stock_movements
     where stock_transfer_id is not null
     group by stock_transfer_id, inventory_item_id, reason,
              coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid)
    having count(*) > 1
  ) then
    raise notice 'idx_stock_movements_transfer_leg_once skipped: duplicate transfer legs exist';
  else
    create unique index if not exists idx_stock_movements_transfer_leg_once
      on public.stock_movements (
        stock_transfer_id, inventory_item_id, reason,
        coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
      where stock_transfer_id is not null;
  end if;
end $$;
