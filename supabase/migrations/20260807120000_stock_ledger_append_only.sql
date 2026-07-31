-- The stock ledger becomes append-only.
--
-- `20260726120000` created both `stock_movements` policies `FOR ALL`, which
-- includes DELETE and UPDATE. A probe against this database (in a transaction
-- that was rolled back) confirmed a tenant admin could do both:
--   rows_deleted=1, rows_updated=1
--
-- Why that matters more than it looks: `apply_stock_movement()` is a BEFORE
-- INSERT trigger. It moves `inventory_items.current_qty` when a movement is
-- written and has no counterpart on the way out. So deleting a movement leaves
-- the shelf figure exactly where that movement put it while erasing the row
-- that explains it. The daily report then reconciles the day to a different
-- answer than it did yesterday — opening + received - sold - waste no longer
-- reaches the same closing — and the verdict banner grades that answer with
-- full confidence. Silent, retroactive, and unnoticeable.
--
-- An UPDATE is the same wound with better aim: the delta can be edited to any
-- value while `current_qty` keeps the original.
--
-- Inert on apply. Nothing in the codebase has ever issued either verb against
-- this table — every call site is `.insert()` or `.select()` (src/lib/inventory/
-- stock-service.ts, order-stock-service.ts, activity-feed-read.ts,
-- last-purchase.ts, daily-report-read.ts, and the app's daily-report-service).
-- Order depletion writes through the service-role client, which bypasses RLS
-- entirely and is untouched by this.
--
-- ONLY the verbs change here. The predicate deciding WHO may act is carried
-- over unaltered from `20260726120000`, so no account gains or loses reach.
-- A correction is still possible the way an accounting ledger does it: write a
-- compensating movement, which leaves both the mistake and the fix on the
-- record.

DROP POLICY IF EXISTS "Admins manage own-tenant rows" ON public.stock_movements;
DROP POLICY IF EXISTS "Superadmins manage all rows" ON public.stock_movements;

-- Reading the ledger: the daily report, the activity feed, and the
-- last-purchase lookup.
CREATE POLICY stock_movements_select_admin ON public.stock_movements
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT au.tenant_id FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role = ANY (ARRAY['admin', 'superadmin'])
    )
    OR EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
    )
  );

-- Writing the ledger: receiving stock, stocktakes, and waste.
CREATE POLICY stock_movements_insert_admin ON public.stock_movements
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT au.tenant_id FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role = ANY (ARRAY['admin', 'superadmin'])
    )
    OR EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
    )
  );

COMMENT ON TABLE public.stock_movements IS
  'Append-only stock ledger. No policy grants UPDATE or DELETE: current_qty is '
  'moved by a BEFORE INSERT trigger with no reverse, so removing or editing a '
  'row desynchronises the shelf from its own history and silently falsifies '
  'every past daily report. Correct a mistake with a compensating movement.';

-- Rollback: drop the two policies above and restore the pair from
-- `20260726120000`, both FOR ALL. That re-opens DELETE and UPDATE.
