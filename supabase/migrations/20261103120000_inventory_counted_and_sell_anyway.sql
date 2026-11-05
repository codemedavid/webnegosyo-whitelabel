-- ===========================================================================
-- Stock tracking starts at the first count, and "sell anyway until end of day".
-- (docs/plans/2026-11-03-out-of-stock-sweep.md)
--
-- Industry rule (Toast, Square, Shopify): an item nobody ever counted has no
-- limit; tracking starts once a quantity is recorded. Until now an ingredient
-- that was never received sat at 0 (then below zero, sale after sale) and was
-- read as "sold out" by the checkout guard, but never as a crossing by
-- auto-86 — two opinions about one shelf.
--
--   inventory_items.counted_at   first delivery / count / transfer arrival of
--   inventory_stock.counted_at   this ingredient (store-wide) / at this shelf.
--                                NULL = never counted = no stock limit.
--                                DB-maintained: clients can't set or clear it.
--   menu_items.auto_86_snoozed_until
--                                the owner said "sell anyway" while the dish's
--                                ingredients read empty; until then auto-86
--                                leaves it on sale and stock checks don't
--                                limit it. Owner/menu writable.
--
-- Backfill (owner-approved 2026-11-03): an ingredient/shelf counts as counted
-- from its first receive/stocktake/transfer_in, or from creation when it holds
-- stock with no such movement (pre-ledger opening stock). Never-received
-- ingredients (only sales) stay NULL.
-- Runner: tests/sql/run-inventory-counted.cjs.
-- ===========================================================================

set lock_timeout = '3s';

alter table public.inventory_items add column if not exists counted_at timestamptz;
alter table public.inventory_stock add column if not exists counted_at timestamptz;
alter table public.menu_items add column if not exists auto_86_snoozed_until timestamptz;

comment on column public.inventory_items.counted_at is
  'First delivery, count or transfer arrival of this ingredient. NULL = never counted: no stock limit (checkout, ceilings, auto-86). DB-maintained.';
comment on column public.inventory_stock.counted_at is
  'First delivery, count or transfer arrival at this shelf. NULL = never counted here: no stock limit at this branch. DB-maintained.';
comment on column public.menu_items.auto_86_snoozed_until is
  'Owner chose "sell anyway" while the dish read as out of stock. Until this instant auto-86 leaves it on sale and stock checks do not limit it.';

-- ---------------------------------------------------------------------------
-- 1. The ledger marks a shelf counted. AFTER INSERT, so apply_stock_movement
--    (BEFORE INSERT) has already created the shelf row. DEFINER because the
--    writer may hold `inventory` without `menu` (ingredient UPDATE needs menu);
--    it writes one column of the movement's own tenant, nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.stock_movements_mark_counted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_items
     set counted_at = new.created_at
   where id = new.inventory_item_id
     and tenant_id = new.tenant_id
     and counted_at is null;

  update public.inventory_stock
     set counted_at = new.created_at
   where tenant_id = new.tenant_id
     and inventory_item_id = new.inventory_item_id
     and outlet_id is not distinct from new.outlet_id
     and counted_at is null;

  return null;
end;
$$;

revoke all on function public.stock_movements_mark_counted() from public, anon, authenticated;

drop trigger if exists stock_movements_mark_counted on public.stock_movements;
create trigger stock_movements_mark_counted
  after insert on public.stock_movements
  for each row
  when (new.reason in ('receive', 'stocktake', 'transfer_in'))
  execute function public.stock_movements_mark_counted();

-- ---------------------------------------------------------------------------
-- 2. Clients can't set or clear counted_at: clearing it would lift every stock
--    limit on an ingredient, setting it would 86 dishes over a shelf nobody
--    counted. Silently kept (not refused) so an ordinary ingredient edit that
--    round-trips the row never fails over it.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_counted_at_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.counted_at := null;
  else
    new.counted_at := old.counted_at;
  end if;
  return new;
end;
$$;

revoke all on function public.inventory_counted_at_guard() from public, anon, authenticated;

drop trigger if exists inventory_items_counted_at_guard on public.inventory_items;
create trigger inventory_items_counted_at_guard
  before insert or update on public.inventory_items
  for each row execute function public.inventory_counted_at_guard();

drop trigger if exists inventory_stock_counted_at_guard on public.inventory_stock;
create trigger inventory_stock_counted_at_guard
  before insert or update on public.inventory_stock
  for each row execute function public.inventory_counted_at_guard();

-- ---------------------------------------------------------------------------
-- 3. Backfill (one time; ~1.3k ingredients, ~0.7k shelves, ~18k movements).
-- ---------------------------------------------------------------------------
update public.inventory_items i
   set counted_at = coalesce(
         (select min(m.created_at)
            from public.stock_movements m
           where m.tenant_id = i.tenant_id
             and m.inventory_item_id = i.id
             and m.reason in ('receive', 'stocktake', 'transfer_in')),
         case when i.current_qty > 0 then i.created_at end)
 where i.counted_at is null;

update public.inventory_stock s
   set counted_at = coalesce(
         (select min(m.created_at)
            from public.stock_movements m
           where m.tenant_id = s.tenant_id
             and m.inventory_item_id = s.inventory_item_id
             and m.outlet_id is not distinct from s.outlet_id
             and m.reason in ('receive', 'stocktake', 'transfer_in')),
         case when s.current_qty > 0 then s.created_at end)
 where s.counted_at is null;
