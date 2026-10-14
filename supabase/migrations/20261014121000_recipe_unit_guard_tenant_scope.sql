-- recipe_components_unit_guard (20261013160000) is SECURITY DEFINER, so its
-- lookups bypass RLS. They matched the ingredient by id alone, and the refusal
-- names the ingredient: a staff member inserting a line straight through
-- PostgREST with ANOTHER store's ingredient id would read that ingredient's
-- name and stock dimension back from the error. Scope both lookups to the
-- row's own tenant; a foreign id then finds nothing and the guard stays out of
-- the way (the recipe screen and service already refuse unknown ingredients).

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
  from public.inventory_units u
  where u.id = new.unit_id and u.tenant_id = new.tenant_id;

  select su.dimension, i.name into v_stock_dimension, v_item_name
  from public.inventory_items i
  join public.inventory_units su on su.id = i.stock_unit_id and su.tenant_id = i.tenant_id
  where i.id = new.inventory_item_id and i.tenant_id = new.tenant_id;

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
