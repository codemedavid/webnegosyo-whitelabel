-- Inventory — Phase 1 of multi-branch: stock gets a location
--
-- Until now `inventory_items.current_qty` was a single scalar per tenant, so a
-- two-branch store shared one bag of flour: a sale at North silently depleted
-- South. Stock now lives one row per (item, branch) in `inventory_stock`.
--
-- `inventory_items.current_qty` is DELIBERATELY KEPT, as the roll-up: the sum
-- of an item's branches. Every reader that exists today — the web admin table,
-- the merchant app, low-stock evaluation, the costing service — keeps working
-- untouched and now shows the owner's store-wide total, which is exactly the
-- consolidated number the branch-owner view wants. Dropping it would have meant
-- editing seventeen files for no behavioural gain.
--
-- `outlet_id IS NULL` means the unbranched store pool. That is the convention
-- `app_users.outlet_id` and `orders.outlet_id` already use, and it is what lets
-- every single-location tenant carry on unchanged: their stock is one NULL row
-- per item, which is what the backfill below creates.
--
-- Additive & reversible: one new table, one new nullable column, one widened
-- CHECK, one rewritten trigger. Rollback block at the end.

-- ============================================
-- 1. inventory_stock — on-hand, per branch
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  -- NULL = the unbranched store pool. A single-location tenant has exactly one
  -- such row per item and no others.
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  -- Running total for THIS branch, maintained by apply_stock_movement(), never
  -- edited directly. Its sum across branches is inventory_items.current_qty.
  current_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  -- Par level is per branch on purpose: a busy shop reorders sooner than a
  -- quiet one, and one shared threshold would nag the quiet one forever.
  reorder_level NUMERIC(16,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE inventory_stock IS 'On-hand quantity per (inventory item, branch). outlet_id NULL = unbranched store pool. Maintained by apply_stock_movement(); inventory_items.current_qty is the roll-up.';

-- One row per item per branch. Two partial indexes rather than a plain UNIQUE
-- because Postgres treats NULLs as distinct, so UNIQUE(item, outlet) would
-- happily admit a second store-pool row and silently split an item's stock.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_stock_item_outlet
  ON inventory_stock(inventory_item_id, outlet_id) WHERE outlet_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_stock_item_store_pool
  ON inventory_stock(inventory_item_id) WHERE outlet_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_stock_tenant ON inventory_stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_outlet ON inventory_stock(outlet_id) WHERE outlet_id IS NOT NULL;

-- ============================================
-- 2. stock_movements gets a branch
-- ============================================
-- Nullable, and absent means the store pool — so every movement written before
-- this migration keeps its meaning without a rewrite.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL;
COMMENT ON COLUMN stock_movements.outlet_id IS 'Branch whose stock this movement moved. NULL = the unbranched store pool.';
CREATE INDEX IF NOT EXISTS idx_stock_movements_outlet
  ON stock_movements(outlet_id, created_at DESC) WHERE outlet_id IS NOT NULL;

-- balance_after now means the balance AT THAT BRANCH, not the store total.
-- For a single-location tenant the two are the same number, so nothing changes
-- for them; for a branched one, a branch's history that reported the chain's
-- total would be unreadable.
COMMENT ON COLUMN stock_movements.balance_after IS 'Running total for this movement''s branch after it was applied.';

-- Transfers are two movements, never a swap: stock leaving North is
-- transfer_out there, arriving at South is transfer_in. Keeping both in the
-- ledger is what makes stock in transit visible and lets a shortfall on arrival
-- be blamed on the leg it happened on.
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_ck;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_ck
  CHECK (reason IN ('receive','stocktake','waste','sale','void','transfer_out','transfer_in'));

-- ============================================
-- 3. Backfill — every existing item gets its store-pool row
-- ============================================
-- Carries the current running total and par level across, so the roll-up
-- invariant (sum of branches = inventory_items.current_qty) holds from the
-- first moment this migration finishes.
INSERT INTO inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty, reorder_level)
SELECT ii.tenant_id, ii.id, NULL, ii.current_qty, ii.reorder_level
  FROM inventory_items ii
 WHERE NOT EXISTS (
   SELECT 1 FROM inventory_stock s
    WHERE s.inventory_item_id = ii.id AND s.outlet_id IS NULL
 );

-- ============================================
-- 4. The trigger, rewritten to move a branch AND the roll-up
-- ============================================
-- Both updates happen inside the insert, so concurrent movements serialize on
-- the rows they touch rather than racing through a read-modify-write in
-- application code — the property the original trigger existed for, preserved.
CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS TRIGGER AS $$
DECLARE
  branch_qty NUMERIC(16,4);
  rollup_qty NUMERIC(16,4);
BEGIN
  -- The roll-up first, because it is also the tenant guard: an item belonging
  -- to another tenant matches nothing and returns NULL.
  UPDATE inventory_items
     SET current_qty = current_qty + NEW.quantity_delta
   WHERE id = NEW.inventory_item_id
     AND tenant_id = NEW.tenant_id
  RETURNING current_qty INTO rollup_qty;

  IF rollup_qty IS NULL THEN
    RAISE EXCEPTION 'Stock movement references an inventory item outside its tenant';
  END IF;

  -- A branch must belong to the same tenant, or stock would move into another
  -- store's shop. Checked here rather than by a foreign key because the key can
  -- only point at outlets, not at the tenant pairing.
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Stock movement references a branch outside its tenant';
  END IF;

  -- IS NOT DISTINCT FROM so a NULL branch matches the store pool row rather
  -- than matching nothing, which is what plain `=` would do.
  UPDATE inventory_stock
     SET current_qty = current_qty + NEW.quantity_delta,
         updated_at = now()
   WHERE tenant_id = NEW.tenant_id
     AND inventory_item_id = NEW.inventory_item_id
     AND outlet_id IS NOT DISTINCT FROM NEW.outlet_id
  RETURNING current_qty INTO branch_qty;

  IF branch_qty IS NULL THEN
    -- First movement this branch has ever seen for this ingredient. Two
    -- concurrent first movements would both miss the UPDATE and both insert;
    -- the loser catches the unique violation and re-runs the UPDATE, so a
    -- merchant's first delivery to a new branch never fails on a race.
    BEGIN
      INSERT INTO inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty)
      VALUES (NEW.tenant_id, NEW.inventory_item_id, NEW.outlet_id, NEW.quantity_delta)
      RETURNING current_qty INTO branch_qty;
    EXCEPTION WHEN unique_violation THEN
      UPDATE inventory_stock
         SET current_qty = current_qty + NEW.quantity_delta,
             updated_at = now()
       WHERE tenant_id = NEW.tenant_id
         AND inventory_item_id = NEW.inventory_item_id
         AND outlet_id IS NOT DISTINCT FROM NEW.outlet_id
      RETURNING current_qty INTO branch_qty;
    END;
  END IF;

  NEW.balance_after := branch_qty;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_movements_apply ON stock_movements;
CREATE TRIGGER stock_movements_apply BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- ============================================
-- 5. RLS — mirrors the Phase A inventory policies
-- ============================================
-- Admins manage their own tenant's rows. The trigger runs as the caller, so an
-- INSERT/UPDATE grant is what lets a merchant's movement create its branch row;
-- the same grant is what lets an owner set a per-branch par level.
--
-- Deliberately NOT branch-scoped yet. Inventory RLS is role-based today, which
-- means a branch manager can still read every branch's stock. Narrowing it is
-- Phase 2's job, alongside the reads that would otherwise break.
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'inventory_stock' AND policyname = 'inventory_stock_manage_admin'
  ) THEN
    CREATE POLICY inventory_stock_manage_admin ON inventory_stock FOR ALL
      USING (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])))
      WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'inventory_stock' AND policyname = 'inventory_stock_manage_superadmin'
  ) THEN
    CREATE POLICY inventory_stock_manage_superadmin ON inventory_stock FOR ALL
      USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));
  END IF;
END $$;

-- ============================================
-- Rollback (manual):
--   -- Restore the pre-branch trigger:
--   CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS TRIGGER AS $fn$
--   DECLARE new_qty NUMERIC(16,4);
--   BEGIN
--     UPDATE inventory_items SET current_qty = current_qty + NEW.quantity_delta
--      WHERE id = NEW.inventory_item_id AND tenant_id = NEW.tenant_id
--     RETURNING current_qty INTO new_qty;
--     IF new_qty IS NULL THEN
--       RAISE EXCEPTION 'Stock movement references an inventory item outside its tenant';
--     END IF;
--     NEW.balance_after := new_qty; RETURN NEW;
--   END; $fn$ LANGUAGE plpgsql;
--
--   ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_ck;
--   ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_ck
--     CHECK (reason IN ('receive','stocktake','waste','sale','void'));
--   ALTER TABLE stock_movements DROP COLUMN IF EXISTS outlet_id;
--   DROP TABLE IF EXISTS inventory_stock CASCADE;
--   -- inventory_items.current_qty is untouched by the rollback and stays correct:
--   -- it was maintained as the roll-up throughout.
-- ============================================
