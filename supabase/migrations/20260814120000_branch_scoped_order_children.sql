-- A branch lock reaches the tables hanging off an order.
--
-- `20260802120000` gave an account a branch (`app_users.outlet_id`, NULL =
-- every branch). `20260804120000` taught the database to honour it on `orders`
-- and `order_items`. It could not reach `order_payments` or `order_revisions`:
-- both were created one day earlier, in `20260803120000`, whose header states
-- the policies were made "deliberately identical in shape to
-- orders_select_by_tenant / orders_write_admin" — the shape `20260804120000`
-- then replaced. The two tables kept the copy.
--
-- The gap is not academic. Both carry their own `outlet_id`, and both hold what
-- the branch split exists to separate: what each order was paid, in what tender,
-- against which reference number, and every edit made to it after the fact. A
-- branch manager reaching the API with their own token reads all of it, for
-- every branch.
--
-- Same predicate, not a fifth copy of it. `app_user_may_see_order` is already
-- the single statement of this rule across four policies; inlining it here is
-- how the fifth copy drifts, which is precisely how these two tables ended up
-- wrong. The parameters are each table's OWN `tenant_id`/`outlet_id` columns,
-- not the parent order's: the row carries them, so no join is needed, and the
-- rule stays readable.
--
-- Additive in practice, as `20260804120000` was: `au.outlet_id IS NULL` means
-- every branch, which is what all but one live account is, so store-wide
-- accounts read exactly what they read today.
--
-- Two things are carried over deliberately from that migration:
--
--  1. `*_write_admin` is FOR ALL, so it ALSO grants SELECT, and permissive
--     policies are OR-ed together. Narrowing only the select policy would
--     change nothing at all. Both are rewritten for both tables.
--
--  2. A row with `outlet_id IS NULL` stays owner-only, matching `isOrderInScope`
--     in the apps and the parent `orders` policy. A payment the branch split
--     predates was not taken by this branch.

-- 1. order_payments -----------------------------------------------------------
DROP POLICY IF EXISTS order_payments_select ON public.order_payments;
CREATE POLICY order_payments_select ON public.order_payments
  FOR SELECT
  USING (public.app_user_may_see_order(order_payments.tenant_id, order_payments.outlet_id));

-- FOR ALL, so this grants SELECT too — see note 1 in the header.
DROP POLICY IF EXISTS order_payments_write_admin ON public.order_payments;
CREATE POLICY order_payments_write_admin ON public.order_payments
  FOR ALL
  USING (public.app_user_may_see_order(order_payments.tenant_id, order_payments.outlet_id))
  WITH CHECK (public.app_user_may_see_order(order_payments.tenant_id, order_payments.outlet_id));

-- 2. order_revisions ----------------------------------------------------------
DROP POLICY IF EXISTS order_revisions_select ON public.order_revisions;
CREATE POLICY order_revisions_select ON public.order_revisions
  FOR SELECT
  USING (public.app_user_may_see_order(order_revisions.tenant_id, order_revisions.outlet_id));

DROP POLICY IF EXISTS order_revisions_write_admin ON public.order_revisions;
CREATE POLICY order_revisions_write_admin ON public.order_revisions
  FOR ALL
  USING (public.app_user_may_see_order(order_revisions.tenant_id, order_revisions.outlet_id))
  WITH CHECK (public.app_user_may_see_order(order_revisions.tenant_id, order_revisions.outlet_id));

-- 3. Backfill the branch from the parent order --------------------------------
-- A row whose `outlet_id` was never stamped becomes owner-only under the new
-- predicate (note 2), which would hide a branch's own takings from it. The
-- parent order is the authority — `20260804120000` already backfilled that
-- column from the blob — so the children inherit from it.
--
-- Written last, so it runs against the schema the policies above expect, and
-- guarded on IS NULL so it touches nothing already stamped.
UPDATE public.order_payments p
SET outlet_id = o.outlet_id
FROM public.orders o
WHERE o.id = p.order_id
  AND p.outlet_id IS NULL
  AND o.outlet_id IS NOT NULL;

UPDATE public.order_revisions r
SET outlet_id = o.outlet_id
FROM public.orders o
WHERE o.id = r.order_id
  AND r.outlet_id IS NULL
  AND o.outlet_id IS NOT NULL;

-- 4. Indexes for the new predicate --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_order_payments_tenant_outlet
  ON public.order_payments(tenant_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_order_revisions_tenant_outlet
  ON public.order_revisions(tenant_id, outlet_id);

-- Rollback: restore the tenant-only predicates from `20260803120000`, then
--   DROP INDEX IF EXISTS idx_order_payments_tenant_outlet;
--   DROP INDEX IF EXISTS idx_order_revisions_tenant_outlet;
-- The backfill is not reversible and should not be: a child row agreeing with
-- the branch on its own parent order is correct regardless of who reads it.
