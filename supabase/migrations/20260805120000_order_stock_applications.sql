-- Inventory — one order deducts stock exactly once, enforced by the database.
--
-- Both ledger writers (`applyOrderStockMovements`, `reverseOrderStockMovements`)
-- guarded themselves by SELECTing for an existing movement and inserting when
-- there was none. Under concurrency that is not a guard: N parallel calls all
-- read "none" and all insert. The running-total trigger then applies N deltas,
-- `current_qty` has no non-negative CHECK, and auto-86 hides every dish touching
-- those ingredients. Reached through the PUBLIC `customer-order-stock` route,
-- that is an unauthenticated menu takedown.
--
-- The uniqueness deliberately does NOT go on `stock_movements`. One order writes
-- one row per ingredient, all sharing (tenant_id, order_id, reason), and
-- `resolveOrderDepletions` keys its totals on inventory_item_id::unit_id — so
-- even a variant including the ingredient would reject a legitimate order whose
-- base recipe uses grams and whose addon uses kilograms for the same ingredient.
-- Instead one CLAIM row per (tenant, order, direction) carries the constraint and
-- the ledger's shape is left untouched.
--
-- Additive & reversible: one new table. Rollback block at the end.

CREATE TABLE IF NOT EXISTS order_stock_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- TEXT, not UUID, and with no FK: the order it names may live in another
  -- database entirely (a per-tenant Convex or Supabase backend). Same rule as
  -- `stock_movements.order_id`, which was widened for exactly this reason.
  order_id TEXT NOT NULL,
  -- Which direction was applied. An order that was sold and then voided must
  -- stay independently correct in both, so the claim is keyed on direction.
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_stock_applications_reason_ck CHECK (reason IN ('sale', 'void'))
);

COMMENT ON TABLE order_stock_applications IS
  'Idempotency claims for order-driven stock movements. One row per (tenant, order, direction); a 23505 on insert means the depletion already ran.';

-- The whole point of the table. Without this the insert is just another racy write.
CREATE UNIQUE INDEX IF NOT EXISTS order_stock_applications_unique
  ON order_stock_applications (tenant_id, order_id, reason);

-- ============================================
-- RLS — mirrors the stock_movements policies
-- ============================================
-- Not customer-facing: no public SELECT. The writer is the service-role client
-- (a diner has no admin session), which bypasses RLS; these policies exist so
-- an admin can read their own claims and no one can read another tenant's.
ALTER TABLE order_stock_applications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'order_stock_applications'
       AND policyname = 'Admins manage own-tenant rows'
  ) THEN
    CREATE POLICY "Admins manage own-tenant rows" ON order_stock_applications FOR ALL
      USING (tenant_id IN (
        SELECT au.tenant_id FROM app_users au
         WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])))
      WITH CHECK (tenant_id IN (
        SELECT au.tenant_id FROM app_users au
         WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'order_stock_applications'
       AND policyname = 'Superadmins manage all rows'
  ) THEN
    CREATE POLICY "Superadmins manage all rows" ON order_stock_applications FOR ALL
      USING (EXISTS (
        SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));
  END IF;
END $$;

-- ============================================
-- Backfill — claim every order that has already deducted stock.
-- ============================================
-- Without this, an order depleted before this migration has no claim, so a
-- retry or a replayed request would sail past the guard and deduct a second
-- time. Derived from the ledger itself, which is the source of truth.
INSERT INTO order_stock_applications (tenant_id, order_id, reason, created_at)
SELECT tenant_id, order_id, reason, MIN(created_at)
  FROM stock_movements
 WHERE order_id IS NOT NULL
   AND reason IN ('sale', 'void')
 GROUP BY tenant_id, order_id, reason
ON CONFLICT DO NOTHING;

-- ============================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS order_stock_applications CASCADE;
-- ============================================
