-- product_costs.cost_price is a dish's cost of making: it belongs to the `costs`
-- staff permission. The SELECT policy only asked "is this an admin of the
-- store", so any staff account (a cashier with just `pos`) could read every
-- dish cost straight off the table. The write policies already need `costs`;
-- reading now does too.
--
-- Readers (all session clients; none needs the other columns without the key):
--   * merchant app Products list (`productCosts:getAllCosts`) and product editor
--     (`productCosts:getCost`) -- an account without `costs` now gets no rows
--     (RLS answers empty, not an error), so margins and the cost box stay hidden.
--   * merchant app product analytics (`fetchCosts`) -- costs come back empty and
--     margins are not shown, which is the point.
--   * server definers (`order_items_cost_snapshot`, profit facts) run as the
--     function owner and are unaffected.
-- Nothing throws on an installed build, so this can be applied at any time.
--
-- Kept as they are: the superadmin (app_user_has_permission is true for them)
-- and the platform_staff_* policies. Rollback: recreate the old policy,
--   create policy product_costs_select_by_tenant on public.product_costs
--     for select using (exists (select 1 from public.app_users au
--       where au.user_id = auth.uid() and (au.role = 'superadmin'
--         or (au.role = 'admin' and au.tenant_id = product_costs.tenant_id))));

set lock_timeout = '3s';

drop policy if exists product_costs_select_by_tenant on public.product_costs;
create policy product_costs_select_by_tenant on public.product_costs
  for select
  using (public.app_user_has_permission(tenant_id, 'costs'));
