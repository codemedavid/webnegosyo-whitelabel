-- APPLIED to the live project on 2026-08-29 (as `customer_order_tracking_rpc`);
-- this file mirrors it for the repo.
--
-- Anonymous customers need to read the order they just placed (status
-- tracking in the white-labeled app), but anon must stay blind to the
-- orders table: any anon SELECT policy would let the whole table be
-- dumped with an unfiltered select. Instead the order's uuid acts as a
-- capability: whoever holds the exact id may read that one row.
create or replace function public.get_customer_order(p_order_id uuid)
returns setof public.orders
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.orders o where o.id = p_order_id;
$$;

revoke all on function public.get_customer_order(uuid) from public;
grant execute on function public.get_customer_order(uuid) to anon;
