-- Per-store order activity for the superadmin "Store activity" and
-- subscriptions screens.
--
-- One aggregate per call instead of paginating every order row into Node:
-- PostgREST has no GROUP BY, and a 90-day window already spans tens of
-- thousands of rows. Read-only, and callable by the service role only — the
-- superadmin pages read it through the admin client after the layout has
-- checked the role.
--
-- `orders` / `revenue` exclude cancelled orders, matching the Convex
-- `summarizeOrderStats` the other half of the platform reports, so the two
-- backends can be added together. `last_order_at` is all-time and counts any
-- order, cancelled included: it answers "is this store alive", not "did it
-- earn".

create or replace function public.platform_tenant_order_activity(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  tenant_id uuid,
  orders bigint,
  cancelled bigint,
  revenue numeric,
  last_order_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with window_orders as (
    select
      o.tenant_id,
      count(*) filter (where o.status is distinct from 'cancelled') as orders,
      count(*) filter (where o.status = 'cancelled') as cancelled,
      coalesce(sum(o.total) filter (where o.status is distinct from 'cancelled'), 0) as revenue
    from public.orders o
    where o.created_at >= p_start
      and o.created_at < p_end
    group by o.tenant_id
  ),
  latest as (
    select o.tenant_id, max(o.created_at) as last_order_at
    from public.orders o
    group by o.tenant_id
  )
  select
    l.tenant_id,
    coalesce(w.orders, 0),
    coalesce(w.cancelled, 0),
    coalesce(w.revenue, 0),
    l.last_order_at
  from latest l
  left join window_orders w on w.tenant_id = l.tenant_id;
$$;

revoke all on function public.platform_tenant_order_activity(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.platform_tenant_order_activity(timestamptz, timestamptz)
  to service_role;
