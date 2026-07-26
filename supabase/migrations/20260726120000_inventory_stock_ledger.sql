-- Inventory system — Phase B: the stock movement ledger
--
-- `inventory_items.current_qty` has existed since the Phase A migration and has
-- never been written by anything ("created now, unused until then"). This adds
-- the ledger that finally moves it: every change to stock is an append-only row
-- stating how much, in which direction, and why.
--
-- current_qty is a running total maintained by a trigger, never edited directly.
-- That keeps it consistent no matter which writer moves stock — the web admin
-- today, order depletion (Phase 4B/4C) next — and makes "why is this number
-- wrong?" answerable by reading the ledger.
--
-- Additive & reversible: one new table, one trigger. Rollback block at the end.

-- ============================================
-- 1. stock_movements — append-only ledger
-- ============================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  -- Why stock moved. 'sale'/'void' are written by order depletion; the rest are
  -- merchant actions.
  reason TEXT NOT NULL,
  -- Signed change in the item's stock unit. Negative consumes, positive adds.
  -- Pre-converted by the application (see src/lib/inventory/stock-ledger.ts) so
  -- the running total never has to know about unit conversion.
  quantity_delta NUMERIC(16,4) NOT NULL,
  -- What the merchant actually typed, kept for the audit trail: a stocktake
  -- records the count they reported, not just the discrepancy it produced.
  entered_quantity NUMERIC(16,4),
  entered_unit_id UUID REFERENCES inventory_units(id) ON DELETE SET NULL,
  -- Running total after this movement, so history reads correctly even after
  -- later movements land.
  balance_after NUMERIC(16,4) NOT NULL DEFAULT 0,
  -- Unit cost of a delivery, when the merchant supplied one.
  unit_cost NUMERIC(12,4),
  note TEXT,
  -- Set for 'sale'/'void' movements so an order's effect can be traced/reversed.
  order_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_movements_reason_ck
    CHECK (reason IN ('receive','stocktake','waste','sale','void'))
);
COMMENT ON TABLE stock_movements IS 'Append-only stock ledger. quantity_delta is signed and already expressed in the item stock unit.';
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_id ON stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id) WHERE order_id IS NOT NULL;

-- ============================================
-- 2. Running total trigger
-- ============================================
-- Applied inside the insert so concurrent movements serialize on the item row
-- rather than racing through a read-modify-write in application code.
CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS TRIGGER AS $$
DECLARE new_qty NUMERIC(16,4);
BEGIN
  UPDATE inventory_items
     SET current_qty = current_qty + NEW.quantity_delta
   WHERE id = NEW.inventory_item_id
     AND tenant_id = NEW.tenant_id
  RETURNING current_qty INTO new_qty;

  IF new_qty IS NULL THEN
    RAISE EXCEPTION 'Stock movement references an inventory item outside its tenant';
  END IF;

  NEW.balance_after := new_qty;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_movements_apply ON stock_movements;
CREATE TRIGGER stock_movements_apply BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- ============================================
-- 3. RLS — admin (own tenant) + superadmin (all)
-- ============================================
-- Mirrors the Phase A inventory policies. Not customer-facing: no public SELECT.
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'stock_movements' AND policyname = 'Admins manage own-tenant rows'
  ) THEN
    CREATE POLICY "Admins manage own-tenant rows" ON stock_movements FOR ALL
      USING (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])))
      WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'stock_movements' AND policyname = 'Superadmins manage all rows'
  ) THEN
    CREATE POLICY "Superadmins manage all rows" ON stock_movements FOR ALL
      USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));
  END IF;
END $$;

-- ============================================
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS stock_movements_apply ON stock_movements;
--   DROP FUNCTION IF EXISTS apply_stock_movement();
--   DROP TABLE IF EXISTS stock_movements CASCADE;
--   -- current_qty keeps its last value; reset with: UPDATE inventory_items SET current_qty = 0;
-- ============================================
