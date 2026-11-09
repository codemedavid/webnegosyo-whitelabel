-- Interim limits on anonymous order lines (2026-11-07).
--
-- order_accepts_anon_items (SECURITY DEFINER) lets the anon role add lines to
-- ANY pending order of ANY store created in the last 15 minutes. Until direct
-- anon order inserts are dropped (20261107120200), refuse the abusable shapes:
--   * quantity outside 1..99 (the storefront cart caps at 99)
--   * more than 100 lines on one order (the Messenger cart caps at 100)
--   * a dish that is not on the same store as the order. order_items has no
--     tenant_id, so the order row is read through a definer helper (anon cannot
--     select orders).
-- Applies to current_user = 'anon' only; staff, the service role and triggers
-- running as other roles are untouched. The trigger function runs as invoker,
-- so anon needs EXECUTE on the helper (trigger functions need no grant: Postgres
-- checks EXECUTE when the trigger is created).

create or replace function public.order_items_anon_line_ok(p_order_id uuid, p_menu_item_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select
    (select count(*) from public.order_items oi where oi.order_id = p_order_id) < 100
    and (
      p_menu_item_id is null
      or exists (
        select 1
          from public.orders o
          join public.menu_items m on m.tenant_id = o.tenant_id
         where o.id = p_order_id and m.id = p_menu_item_id
      )
    );
$function$;

revoke execute on function public.order_items_anon_line_ok(uuid, uuid) from public, authenticated;
grant execute on function public.order_items_anon_line_ok(uuid, uuid) to anon;

create or replace function public.order_items_anon_limits()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user <> 'anon' then
    return new;
  end if;
  if new.quantity is null or new.quantity < 1 or new.quantity > 99 then
    raise exception 'An order line must have a quantity from 1 to 99' using errcode = '23514';
  end if;
  if not public.order_items_anon_line_ok(new.order_id, new.menu_item_id) then
    raise exception 'This order cannot take that line' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke execute on function public.order_items_anon_limits() from public, anon, authenticated;

drop trigger if exists order_items_00_anon_limits on public.order_items;
create trigger order_items_00_anon_limits
  before insert on public.order_items
  for each row execute function public.order_items_anon_limits();
