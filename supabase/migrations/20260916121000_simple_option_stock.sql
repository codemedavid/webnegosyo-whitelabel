-- Simple option counts live in menu_items.modifier_groups. This separate ledger
-- records their changes without pretending they are ingredient stock. Counts
-- are store-wide; outlet_id is an audit location, not a separate option balance.
create table if not exists public.simple_option_stock_applications (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id text not null,
  action text not null check (action in ('sale', 'void', 'cancel')),
  revision integer not null check (revision >= 0),
  created_at timestamptz not null default now(),
  primary key (tenant_id, order_id, action, revision)
);
create table if not exists public.simple_option_stock_movements (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id text not null,
  menu_item_id uuid not null,
  option_id text not null,
  outlet_id uuid,
  action text not null check (action in ('sale', 'void', 'cancel')),
  revision integer not null,
  quantity_delta bigint not null check (quantity_delta <> 0),
  created_at timestamptz not null default now()
);
create index if not exists simple_option_stock_order_idx on public.simple_option_stock_movements(tenant_id, order_id);
alter table public.simple_option_stock_applications enable row level security;
alter table public.simple_option_stock_movements enable row level security;
revoke all on public.simple_option_stock_applications, public.simple_option_stock_movements from anon, authenticated;
grant all on public.simple_option_stock_applications, public.simple_option_stock_movements to service_role;
grant usage, select on sequence public.simple_option_stock_movements_id_seq to service_role;

create or replace function public.apply_simple_option_order_stock(
  p_tenant_id uuid,
  p_order_id text,
  p_action text,
  p_revision integer default 0,
  p_items jsonb default '[]'::jsonb,
  p_outlet_id uuid default null
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_revision integer := p_revision;
  v_demands jsonb;
  v_line jsonb;
  v_portion jsonb;
  v_demand record;
  v_groups jsonb;
  v_option jsonb;
  v_group_index integer;
  v_option_index integer;
  v_available numeric;
  v_delta bigint;
  v_count integer := 0;
begin
  if p_tenant_id is null or p_order_id is null or p_order_id = '' or
     p_action not in ('sale', 'void', 'cancel') or p_revision < 0 or p_revision is null then
    raise exception 'Invalid simple option stock request';
  end if;
  -- Serialize sale, edit and cancellation of this order; unique applications
  -- alone cannot stop a cancellation racing the initial sale.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_order_id, 0));
  if p_action = 'cancel' then
    select coalesce(max(revision), 0) into v_revision from public.simple_option_stock_applications
      where tenant_id = p_tenant_id and order_id = p_order_id;
  elsif p_action = 'sale' and (
    exists(select 1 from public.simple_option_stock_applications where tenant_id = p_tenant_id and order_id = p_order_id and action = 'cancel' and revision >= p_revision)
  ) then
    return 0;
  end if;
  insert into public.simple_option_stock_applications(tenant_id, order_id, action, revision)
    values (p_tenant_id, p_order_id, p_action, v_revision) on conflict do nothing;
  if not found then return 0; end if;

  if p_action = 'cancel' then
    -- Return the net actually spent, including edits and earlier cancellations.
    select coalesce(jsonb_agg(jsonb_build_object('menuItemId', menu_item_id, 'optionId', option_id, 'delta', -net, 'outletId', outlet_id)), '[]'::jsonb)
      into v_demands from (
        select menu_item_id, option_id, outlet_id, sum(quantity_delta) as net
        from public.simple_option_stock_movements where tenant_id = p_tenant_id and order_id = p_order_id
        group by menu_item_id, option_id, outlet_id having sum(quantity_delta) <> 0
      ) netted;
  else
    if jsonb_typeof(p_items) <> 'array' then raise exception 'Invalid stock items'; end if;
    for v_line in select value from jsonb_array_elements(p_items) loop
      if jsonb_typeof(v_line->'quantity') is distinct from 'number' or (v_line->>'quantity')::numeric <= 0 or
         (v_line->>'quantity')::numeric > 9999 or trunc((v_line->>'quantity')::numeric) <> (v_line->>'quantity')::numeric then
        raise exception 'Invalid parent quantity';
      end if;
      if v_line ? 'addonQuantities' then
        if jsonb_typeof(v_line->'addonQuantities') <> 'object' then raise exception 'Invalid add-on quantities'; end if;
        for v_portion in select value from jsonb_each(v_line->'addonQuantities') loop
          if jsonb_typeof(v_portion) <> 'number' or v_portion::numeric < 1 or v_portion::numeric > 99 or trunc(v_portion::numeric) <> v_portion::numeric then
            raise exception 'Invalid add-on quantity';
          end if;
        end loop;
      end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('menuItemId', menu_id, 'optionId', option_id, 'delta', portions * case when p_action = 'sale' then -1 else 1 end, 'outletId', p_outlet_id)), '[]'::jsonb)
      into v_demands from (
        select (line->>'menuItemId')::uuid as menu_id, selected.option_id,
          sum((line->>'quantity')::bigint * coalesce((line->'addonQuantities'->>selected.option_id)::bigint, 1)) as portions
        from jsonb_array_elements(p_items) line
        cross join lateral (
          select distinct value as option_id from jsonb_array_elements_text(
            coalesce(line->'optionIds', '[]'::jsonb) || coalesce(line->'addonIds', '[]'::jsonb) || coalesce(line->'modifierOptionIds', '[]'::jsonb)
          )
        ) selected
        group by (line->>'menuItemId')::uuid, selected.option_id
      ) demand;
  end if;

  -- Stable lock ordering prevents cross-order deadlocks; all counters in an
  -- order update in this transaction or none do, including the claim above.
  perform 1 from public.menu_items where tenant_id = p_tenant_id and id in (
    select (value->>'menuItemId')::uuid from jsonb_array_elements(v_demands)
  ) order by id for update;

  for v_demand in select * from jsonb_to_recordset(v_demands)
    as d("menuItemId" uuid, "optionId" text, delta bigint, "outletId" uuid) loop
    select modifier_groups into v_groups from public.menu_items
      where id = v_demand."menuItemId" and tenant_id = p_tenant_id;
    if not found then continue; end if;
    select opt.value, (grp.ordinality - 1)::integer, (opt.ordinality - 1)::integer
      into v_option, v_group_index, v_option_index
      from jsonb_array_elements(coalesce(v_groups, '[]'::jsonb)) with ordinality grp
      cross join lateral jsonb_array_elements(grp.value->'options') with ordinality opt
      where opt.value->>'id' = v_demand."optionId" limit 1;
    if not found then continue; end if;
    -- Cancellation restores recorded movements even if the merchant switched
    -- tracking modes in the meantime. New sales respect the current mode.
    if p_action <> 'cancel' and v_option->>'stock_mode' is distinct from 'simple' then continue; end if;
    v_delta := v_demand.delta;
    if v_delta = 0 then continue; end if;
    v_available := coalesce((v_option->>'stock_qty')::numeric, 0);
    if v_delta < 0 and (v_available + v_delta < 0 or v_option->>'is_available' = 'false') then
      raise exception 'Insufficient stock for %', coalesce(v_option->>'name', v_demand."optionId");
    end if;
    v_groups := jsonb_set(v_groups, array[v_group_index::text, 'options', v_option_index::text, 'stock_qty'], to_jsonb(v_available + v_delta));
    update public.menu_items set modifier_groups = v_groups where id = v_demand."menuItemId" and tenant_id = p_tenant_id;
    insert into public.simple_option_stock_movements(tenant_id, order_id, menu_item_id, option_id, outlet_id, action, revision, quantity_delta)
      values (p_tenant_id, p_order_id, v_demand."menuItemId", v_demand."optionId", v_demand."outletId", p_action, v_revision, v_delta);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.apply_simple_option_order_stock(uuid,text,text,integer,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.apply_simple_option_order_stock(uuid,text,text,integer,jsonb,uuid) to service_role;

-- Editor saves omit counters the merchant did not change. Merge from OLD while
-- the UPDATE owns the row lock, so sales committed since the editor opened are
-- retained. Present counters remain explicit adjustments (including RPC writes).
create or replace function public.preserve_omitted_option_stock()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_group record;
  v_option record;
  v_previous jsonb;
begin
  for v_group in select value, ordinality from jsonb_array_elements(coalesce(new.modifier_groups, '[]'::jsonb)) with ordinality loop
    for v_option in select value, ordinality from jsonb_array_elements(coalesce(v_group.value->'options', '[]'::jsonb)) with ordinality loop
      if v_option.value ? 'stock_qty' then continue; end if;
      select opt.value->'stock_qty' into v_previous
        from jsonb_array_elements(coalesce(old.modifier_groups, '[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(grp->'options') opt
        where opt.value->>'id' = v_option.value->>'id' and opt.value ? 'stock_qty' limit 1;
      if found then
        new.modifier_groups := jsonb_set(new.modifier_groups,
          array[(v_group.ordinality - 1)::text, 'options', (v_option.ordinality - 1)::text, 'stock_qty'], v_previous);
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
drop trigger if exists preserve_omitted_option_stock on public.menu_items;
create trigger preserve_omitted_option_stock before update of modifier_groups on public.menu_items
  for each row execute function public.preserve_omitted_option_stock();
