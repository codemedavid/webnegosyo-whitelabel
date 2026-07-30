-- Inventory — an order edit moves stock exactly once, per revision.
--
-- `order_stock_applications` (migration 20260805120000) keys its claim on
-- (tenant_id, order_id, reason). That is exactly right while an order's stock
-- can move at most twice: sold, and perhaps later voided.
--
-- Order editing breaks the assumption. Every saved revision may spend more
-- ingredients (a `sale`) or return some (a `void`), on an order that already
-- holds both claims. Without a revision in the key the second edit is refused
-- as a duplicate and its stock silently never moves — the failure is invisible
-- until a stocktake, which is the whole class of bug this table exists to stop.
--
-- The revision number is the right key: it is minted by the order's optimistic
-- lock, is monotonic per order, and a client cannot reuse one without its save
-- being refused outright. So a retried save of revision 2 is still a no-op,
-- while revision 3 is free to move stock after revision 2 did.
--
-- Additive & reversible. DEFAULT 0 means every existing claim — including the
-- ones the previous migration backfilled from the ledger — reads as the
-- original sale, so an un-edited order behaves exactly as it did.

ALTER TABLE order_stock_applications
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN order_stock_applications.revision IS
  'Order revision this claim applies to. 0 is the original sale; each saved edit claims its own, so one revision cannot apply twice but the next one still can.';

-- Replace the uniqueness, do not add a second one. Leaving the old index in
-- place would keep refusing the second edit and make this migration a no-op.
DROP INDEX IF EXISTS order_stock_applications_unique;

CREATE UNIQUE INDEX IF NOT EXISTS order_stock_applications_unique
  ON order_stock_applications (tenant_id, order_id, reason, revision);

-- ============================================
-- Rollback (manual):
--   DROP INDEX IF EXISTS order_stock_applications_unique;
--   CREATE UNIQUE INDEX order_stock_applications_unique
--     ON order_stock_applications (tenant_id, order_id, reason);
--   ALTER TABLE order_stock_applications DROP COLUMN IF EXISTS revision;
-- Note: recreating the old index fails if any order has claims at more than one
-- revision. Those rows must be reconciled by hand first.
-- ============================================
