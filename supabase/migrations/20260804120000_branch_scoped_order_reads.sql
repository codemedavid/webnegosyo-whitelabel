-- Branch-scoped order reads.
--
-- `20260802120000` gave an account a branch (`app_users.outlet_id`, NULL = every
-- branch) and the application layer began honouring it. The database did not:
-- `orders_select_by_tenant` grants every row in the tenant, so a branch manager
-- who reached the API with their own token still received every branch's orders,
-- customer names and phone numbers included. This adds the branch predicate.
--
-- Additive by construction. `au.outlet_id IS NULL` means "every branch", which is
-- what all 157 existing accounts are, so every one of them reads exactly what it
-- reads today. Verified inert on apply: 0 accounts are branch-scoped.
--
-- Two things here are easy to get wrong and are called out deliberately:
--
--  1. `orders_write_admin` is FOR ALL, so it ALSO grants SELECT, and permissive
--     policies are OR-ed together. Tightening only the select policy would
--     change nothing at all — the warning left in `20260726140000` about exactly
--     this. Both are rewritten below, and so are both `order_items` policies.
--
--  2. An order with `outlet_id IS NULL` stays owner-only. That matches
--     `isOrderInScope` in the app: an order attributed to no branch was not
--     taken by this one. Client and server agreeing is what keeps a queue count
--     from disagreeing with the queue it counts.
--
-- `orders_insert` / `order_items_insert` are untouched: they are what let the
-- anonymous storefront checkout place an order.

-- 1. Backfill the column from the blob ---------------------------------------
-- The register stamps the branch into `customer_data` — the only carrier Convex
-- and tenant-owned projects have — and only the web checkout also wrote the
-- column. Once reads filter on the column, a counter sale that filled just the
-- blob would vanish from the branch that rang it up. The app now promotes it at
-- write time (`buildCreateOrderRows`); this catches the rows already stored.
--
-- Joined to `outlets` so a blob naming a branch of some OTHER tenant, or a
-- deleted one, is left alone rather than written into a foreign key. The regex
-- guard comes first: `::uuid` on a non-uuid string aborts the whole statement.
UPDATE public.orders o
SET outlet_id = blob.id
FROM (
  SELECT ord.id AS order_id, out.id
  FROM public.orders ord
  JOIN public.outlets out
    ON out.id = (ord.customer_data->>'outlet_id')::uuid
   AND out.tenant_id = ord.tenant_id
  WHERE ord.outlet_id IS NULL
    AND ord.customer_data->>'outlet_id' ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
) AS blob
WHERE o.id = blob.order_id;

-- 2. The predicate, stated once ----------------------------------------------
-- Four policies need it. Inlining it four times is how one copy ends up drifting
-- and quietly granting more than the others.
--
-- STABLE, and not SECURITY DEFINER: the inlined subqueries it replaces read
-- `app_users` as the caller, and this must keep doing exactly that. Making it
-- definer would let it see rows the caller cannot, which is the opposite of the
-- point.
CREATE OR REPLACE FUNCTION public.app_user_may_see_order(
  order_tenant_id UUID,
  order_outlet_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users au
    WHERE au.user_id = auth.uid()
      AND (
        au.role = 'superadmin'
        OR (
          au.role = 'admin'
          AND au.tenant_id = order_tenant_id
          -- NULL = every branch: what every pre-existing account is.
          AND (au.outlet_id IS NULL OR au.outlet_id = order_outlet_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.app_user_may_see_order(UUID, UUID) IS
  'Whether the calling account may see an order in the given tenant and branch. '
  'A NULL app_users.outlet_id means every branch. An order with a NULL outlet_id '
  'is visible only to such an account, matching isOrderInScope in the apps.';

-- 3. orders -------------------------------------------------------------------
DROP POLICY IF EXISTS orders_select_by_tenant ON public.orders;
CREATE POLICY orders_select_by_tenant ON public.orders
  FOR SELECT
  USING (public.app_user_may_see_order(orders.tenant_id, orders.outlet_id));

-- FOR ALL, so this grants SELECT too — see note 1 in the header.
DROP POLICY IF EXISTS orders_write_admin ON public.orders;
CREATE POLICY orders_write_admin ON public.orders
  FOR ALL
  USING (public.app_user_may_see_order(orders.tenant_id, orders.outlet_id))
  WITH CHECK (public.app_user_may_see_order(orders.tenant_id, orders.outlet_id));

-- 4. order_items --------------------------------------------------------------
-- No tenant or branch of its own; both are read off the parent order, the way
-- the tenant already was.
DROP POLICY IF EXISTS order_items_select_by_order ON public.order_items;
CREATE POLICY order_items_select_by_order ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.app_user_may_see_order(o.tenant_id, o.outlet_id)
    )
  );

DROP POLICY IF EXISTS order_items_write_admin ON public.order_items;
CREATE POLICY order_items_write_admin ON public.order_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.app_user_may_see_order(o.tenant_id, o.outlet_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.app_user_may_see_order(o.tenant_id, o.outlet_id)
    )
  );

-- 5. Index for the new predicate ---------------------------------------------
-- `idx_orders_outlet_id` is partial (WHERE outlet_id IS NOT NULL), so a
-- branch-scoped read still had to filter the tenant separately.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_outlet
  ON public.orders(tenant_id, outlet_id);

-- Rollback: restore the tenant-only predicates from `20260726140000` (orders)
-- and `0001_initial.sql` (order_items), then
--   DROP FUNCTION IF EXISTS public.app_user_may_see_order(UUID, UUID);
--   DROP INDEX IF EXISTS idx_orders_tenant_outlet;
-- The backfill is not reversible and should not be: the column and the blob
-- agreeing is correct regardless of who reads them.
