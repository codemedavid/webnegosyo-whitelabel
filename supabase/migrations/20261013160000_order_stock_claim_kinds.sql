-- Order stock claims: tell an order EDIT apart from the order's own life
-- (sale / cancel / un-cancel), and remember what a cancellation put back.
--
-- Before this, every claim lived in one (reason, revision) namespace:
--   * an edit's restore (`void` at revision r) read as a CANCELLATION, so a
--     late original sale stood down (stock went UP) and an un-cancel believed
--     the sale had been put back (stock deducted TWICE);
--   * an un-cancel minted `sale` at max(revision)+1 while the register numbers
--     edits orders.revision_number+1 — the next edit collided with it and its
--     added lines never deducted;
--   * an un-cancel recomputed its deduction from order_items, which carry no
--     option/add-on ids, so option and add-on recipes were never re-spent.
--
-- `kind` splits the namespace: 'order' = the original sale, cancellations and
-- un-cancels; 'edit' = a saved order edit's difference. The default keeps every
-- writer that predates this column working unchanged.
--
-- `restored` is the exact ledger rows a cancellation wrote back, so an
-- un-cancel re-spends precisely that instead of recomputing.

alter table public.order_stock_applications
  add column if not exists kind text not null default 'order',
  add column if not exists restored jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_stock_applications'::regclass
      and conname = 'order_stock_applications_kind_ck'
  ) then
    alter table public.order_stock_applications
      add constraint order_stock_applications_kind_ck check (kind in ('order', 'edit'));
  end if;
end $$;

-- Backfill: a claim belongs to an edit when the audit log says so, or when it
-- is a sale above revision 0 that no un-cancel wrote (no `order_redeplete`
-- audit row and no earlier cancellation). Applied live 2026-10-14: 9 edit
-- sales + 1 edit void reclassified; no un-cancel was misfiled. Claims written
-- by the previously deployed code after this ran default to 'order' — re-run
-- this UPDATE once after the new code is live to file those edits.
update public.order_stock_applications c
set kind = 'edit'
where c.revision > 0
  and c.kind = 'order'
  and (
    exists (
      select 1 from public.inventory_audit_log l
      where l.tenant_id = c.tenant_id
        and l.order_id = c.order_id
        and l.revision = c.revision
        and l.event = 'order_edit'
    )
    or (
      c.reason = 'sale'
      and not exists (
        select 1 from public.inventory_audit_log l
        where l.tenant_id = c.tenant_id
          and l.order_id = c.order_id
          and l.revision = c.revision
          and l.event = 'order_redeplete'
      )
      -- A sale above an earlier cancellation is an un-cancel (the order's own
      -- life), not an edit — misfiling it would read the live order as
      -- cancelled and refuse its later edits.
      and not exists (
        select 1 from public.order_stock_applications v
        where v.tenant_id = c.tenant_id
          and v.order_id = c.order_id
          and v.reason = 'void'
          and v.revision < c.revision
          and not exists (
            select 1 from public.inventory_audit_log l
            where l.tenant_id = v.tenant_id and l.order_id = v.order_id
              and l.revision = v.revision and l.event = 'order_edit'
          )
      )
    )
  );

create unique index if not exists order_stock_applications_unique_kind
  on public.order_stock_applications (tenant_id, order_id, reason, kind, revision);

drop index if exists public.order_stock_applications_unique;

-- An ingredient's ledger is its history. ON DELETE CASCADE let a plain DELETE
-- of an ingredient erase every sale/receive it ever had (baristro-brew lost 42
-- orders' rows this way), after which a cancel could restore nothing.
-- `delete_inventory_item` already archives anything with history and only
-- hard-deletes untouched items, so it is unaffected. NO ACTION (not RESTRICT)
-- so a tenant deletion, which cascades to both tables in one statement, still
-- works.
alter table public.stock_movements
  drop constraint if exists stock_movements_inventory_item_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_inventory_item_id_fkey
  foreign key (inventory_item_id) references public.inventory_items(id) on delete no action;

-- A recipe line of zero deducts nothing and costs nothing while looking set
-- up (puesto's "0 ml" line silently skipped 180 orders). NOT VALID: existing
-- zero lines stay readable; every new or edited line must be positive.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.recipe_components'::regclass
      and conname = 'recipe_components_quantity_positive_ck'
  ) then
    alter table public.recipe_components
      add constraint recipe_components_quantity_positive_ck check (quantity > 0) not valid;
  end if;
end $$;

-- A recipe line whose unit can never convert to the ingredient's stock unit
-- (50 g of eggs stocked by the piece) is skipped by every sale. Refuse it at
-- save. Weight and volume convert through the 1 g = 1 ml bridge
-- (unit-conversion.ts GRAMS_PER_MILLILITRE); counts never convert.
-- SECURITY DEFINER: the writer may be a staff role whose RLS cannot read the
-- ingredient or its unit; as INVOKER the lookups would come back empty and the
-- guard would silently pass. It only reads two rows by id.
create or replace function public.recipe_components_unit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line_dimension text;
  v_stock_dimension text;
  v_item_name text;
begin
  if tg_op = 'UPDATE'
     and new.unit_id is not distinct from old.unit_id
     and new.inventory_item_id is not distinct from old.inventory_item_id then
    return new;
  end if;

  select u.dimension into v_line_dimension
  from public.inventory_units u where u.id = new.unit_id;

  select su.dimension, i.name into v_stock_dimension, v_item_name
  from public.inventory_items i
  join public.inventory_units su on su.id = i.stock_unit_id
  where i.id = new.inventory_item_id;

  if v_line_dimension is null or v_stock_dimension is null then
    return new;
  end if;

  if v_line_dimension = v_stock_dimension
     or (v_line_dimension in ('weight', 'volume') and v_stock_dimension in ('weight', 'volume')) then
    return new;
  end if;

  raise exception 'Recipe line for % uses a % unit, but it is stocked by %; pick a unit that converts',
    coalesce(v_item_name, 'this ingredient'), v_line_dimension, v_stock_dimension
    using errcode = '23514';
end;
$$;

drop trigger if exists recipe_components_unit_guard on public.recipe_components;
create trigger recipe_components_unit_guard
  before insert or update on public.recipe_components
  for each row execute function public.recipe_components_unit_guard();
