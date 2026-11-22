-- Save a dish's whole recipe set in one go: the dish recipe and every choice
-- recipe (sizes, flavours, add-ons). Plan: docs/plans/2026-11-21-dish-recipes-by-size.md §4.5.
--
-- Why: the dish editor's "recipe by size" table writes the shared part to the
-- dish recipe and each size's extra to that size, so one owner edit touches
-- several recipes. Saved one recipe at a time, a failure half-way would leave
-- a Large taking less than the owner typed. Saved here, it is all or nothing.
--
-- Both functions are SECURITY INVOKER: the recipes / recipe_components RLS
-- (menu on a store-wide account, superadmin, platform staff) and their guard
-- triggers (same store, unit converts to the stock unit) apply to the caller
-- exactly as they do for the per-recipe writer. RLS refuses an UPDATE or
-- DELETE silently (zero rows), so every write here asserts its row count and
-- raises 42501 instead, rolling the whole save back.
--
-- dish_recipes_version(tenant, dish) is the compare-and-set token: it changes
-- whenever any recipe of the dish (or any of its lines) is written by any
-- writer, including the older per-recipe route, because that route always
-- touches recipes.updated_at and rewrites the lines.

create or replace function public.dish_recipes_version(p_tenant_id uuid, p_menu_item_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select md5(coalesce(string_agg(
           r.id::text || ':' || r.target_type || ':' || coalesce(r.updated_at::text, '') || ':' || c.n::text || ':' || coalesce(c.latest, ''),
           ',' order by r.id), ''))
    from public.recipes r
    cross join lateral (
      select count(*) as n, max(rc.updated_at)::text as latest
        from public.recipe_components rc
       where rc.recipe_id = r.id
    ) c
   where r.tenant_id = p_tenant_id
     and r.menu_item_id = p_menu_item_id
     and r.target_type <> 'prep_item'
$$;

-- p_targets: [{ "target_type": "menu_item" | "modifier_option" | "variation_option" | "addon",
--               "option_id": null | "<choice id>",
--               "components": [{ "inventory_item_id": uuid, "quantity": > 0, "unit_id": uuid }] }]
-- An empty "components" list removes that target's recipe. Saving a choice also
-- removes its recipes under the OTHER choice kinds (a legacy twin keyed by the
-- same id), so exactly one recipe per choice is left and a removed recipe can
-- never be revived by a twin depletion would fall back to.
-- Returns the new version.
create or replace function public.save_dish_recipes(
  p_tenant_id uuid,
  p_menu_item_id uuid,
  p_expected_version text,
  p_targets jsonb
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_target jsonb;
  v_type text;
  v_option text;
  v_lines jsonb;
  v_recipe_id uuid;
  v_count integer;
  v_line jsonb;
begin
  if p_tenant_id is null or p_menu_item_id is null then
    raise exception 'A store and a dish are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_targets) is distinct from 'array' then
    raise exception 'p_targets must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_targets) > 500 then
    raise exception 'Too many recipes in one save' using errcode = '22023';
  end if;

  -- Two saves of the same dish queue here, so the second sees the first's
  -- version and is refused instead of overwriting it.
  perform pg_advisory_xact_lock(hashtextextended('dish_recipes:' || p_menu_item_id::text, 0));

  if public.dish_recipes_version(p_tenant_id, p_menu_item_id) is distinct from p_expected_version then
    raise exception 'These recipes were changed on another screen. Reload to see the latest, then save again.'
      using errcode = '40001';
  end if;

  for v_target in select value from jsonb_array_elements(p_targets) loop
    v_type := v_target->>'target_type';
    v_option := nullif(btrim(coalesce(v_target->>'option_id', '')), '');
    v_lines := coalesce(v_target->'components', '[]'::jsonb);

    if v_type is null or v_type not in ('menu_item', 'modifier_option', 'variation_option', 'addon') then
      raise exception 'Unknown recipe kind %', coalesce(v_type, '(none)') using errcode = '22023';
    end if;
    if (v_type = 'menu_item') <> (v_option is null) then
      raise exception 'A dish recipe has no choice id; a choice recipe needs one' using errcode = '22023';
    end if;
    if jsonb_typeof(v_lines) is distinct from 'array' then
      raise exception 'components must be a JSON array' using errcode = '22023';
    end if;

    -- Twins: the same choice id under another choice kind.
    if v_option is not null then
      delete from public.recipes r
       where r.tenant_id = p_tenant_id
         and r.menu_item_id = p_menu_item_id
         and r.target_type in ('modifier_option', 'variation_option', 'addon')
         and r.target_type <> v_type
         and coalesce(r.modifier_option_id, r.variation_option_id, r.addon_id) = v_option;
    end if;

    v_recipe_id := null;
    select r.id into v_recipe_id
      from public.recipes r
     where r.tenant_id = p_tenant_id
       and r.menu_item_id = p_menu_item_id
       and r.target_type = v_type
       and (
         (v_type = 'menu_item')
         or (v_type = 'modifier_option' and r.modifier_option_id = v_option)
         or (v_type = 'variation_option' and r.variation_option_id = v_option)
         or (v_type = 'addon' and r.addon_id = v_option)
       )
     limit 1;

    if jsonb_array_length(v_lines) = 0 then
      if v_recipe_id is not null then
        delete from public.recipes where id = v_recipe_id and tenant_id = p_tenant_id;
        get diagnostics v_count = row_count;
        if v_count = 0 then
          raise exception 'Only a store-wide account with Menu access can change this dish''s recipes.' using errcode = '42501';
        end if;
      end if;
      continue;
    end if;

    if v_recipe_id is null then
      -- A refused INSERT raises on its own (RLS WITH CHECK).
      insert into public.recipes (tenant_id, target_type, menu_item_id, modifier_option_id, variation_option_id, addon_id)
      values (
        p_tenant_id, v_type, p_menu_item_id,
        case when v_type = 'modifier_option' then v_option end,
        case when v_type = 'variation_option' then v_option end,
        case when v_type = 'addon' then v_option end
      )
      returning id into v_recipe_id;
    else
      update public.recipes set updated_at = now() where id = v_recipe_id and tenant_id = p_tenant_id;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception 'Only a store-wide account with Menu access can change this dish''s recipes.' using errcode = '42501';
      end if;
      delete from public.recipe_components where recipe_id = v_recipe_id and tenant_id = p_tenant_id;
    end if;

    for v_line in select value from jsonb_array_elements(v_lines) loop
      if coalesce((v_line->>'quantity')::numeric, 0) <= 0 then
        raise exception 'Every recipe line needs an amount above 0' using errcode = '22023';
      end if;
    end loop;

    insert into public.recipe_components (tenant_id, recipe_id, inventory_item_id, quantity, unit_id, sort_order)
    select p_tenant_id, v_recipe_id, (l.value->>'inventory_item_id')::uuid, round((l.value->>'quantity')::numeric, 4),
           (l.value->>'unit_id')::uuid, (l.ordinality - 1)::integer
      from jsonb_array_elements(v_lines) with ordinality as l(value, ordinality);
    get diagnostics v_count = row_count;
    if v_count <> jsonb_array_length(v_lines) then
      raise exception 'Only a store-wide account with Menu access can change this dish''s recipes.' using errcode = '42501';
    end if;
  end loop;

  return public.dish_recipes_version(p_tenant_id, p_menu_item_id);
end;
$$;

revoke all on function public.dish_recipes_version(uuid, uuid) from public, anon;
revoke all on function public.save_dish_recipes(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.dish_recipes_version(uuid, uuid) to authenticated, service_role;
grant execute on function public.save_dish_recipes(uuid, uuid, text, jsonb) to authenticated, service_role;

comment on function public.save_dish_recipes(uuid, uuid, text, jsonb) is
  'All-or-nothing save of a dish''s recipe set (dish + choices), compare-and-set on dish_recipes_version. SECURITY INVOKER: recipes RLS applies. docs/plans/2026-11-21-dish-recipes-by-size.md';
