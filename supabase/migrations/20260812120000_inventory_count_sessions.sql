-- Inventory — a stock count becomes one act instead of scattered movements
--
-- The ledger already records every count. What it cannot record is where a
-- count STOPPED, and that gap has a specific cost on the daily report: an
-- ingredient nobody looked at and an ingredient that reconciled perfectly
-- produce the identical row — no discrepancy, no shrinkage, nothing to answer
-- for. A count abandoned at the fourth shelf therefore reads as a spotless
-- store, which is the most flattering thing the report can say and the least
-- earned.
--
-- A session names the denominator. `expected_item_count` is a SNAPSHOT taken
-- when the count opens, deliberately NOT a live count of the shelf: a live
-- denominator rewrites history, quietly demoting last month's finished count to
-- a partial one the moment a new ingredient is added.
--
-- The stock itself still moves ONLY through `stock_movements`. This table
-- records the ACT of counting; the ledger records its effect. That keeps
-- `apply_stock_movement()` the single writer of every on-hand figure.
--
-- Additive: one new table, one nullable column, no existing object altered.
-- Rollback block at end.

-- ============================================
-- 1. inventory_counts — the session
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- NULL = the unbranched store pool, matching inventory_stock, stock_transfers
  -- and app_users.outlet_id. RESTRICT rather than CASCADE: the session is the
  -- evidence for a shelf's shrinkage figures, and deleting it would leave the
  -- stocktake rows unexplained.
  outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,

  -- The Asia/Manila business day the count belongs to, as a DATE rather than a
  -- timestamp. A count that runs from 23:40 to 00:20 is one count of one day's
  -- shelf, and deriving the day from started_at would split it across two.
  business_day DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'open',

  -- How many ingredients were in scope when the count opened. See the header:
  -- a snapshot, never recomputed.
  expected_item_count INTEGER NOT NULL DEFAULT 0,

  note TEXT,

  -- Shrinkage is only actionable against a person and a time.
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT inventory_counts_status_ck
    CHECK (status IN ('open','closed')),

  -- The two facts must agree. A row saying 'closed' with no closed_at reads as
  -- a finished count to the status filter and as a running one to any read that
  -- trusts the timestamp, and the report would then disagree with itself about
  -- whether the shelf was accounted for.
  CONSTRAINT inventory_counts_closed_consistency_ck
    CHECK (
      (status = 'open' AND closed_at IS NULL)
      OR (status = 'closed' AND closed_at IS NOT NULL)
    ),

  -- A negative denominator produces a nonsense coverage figure. The reader
  -- already refuses to divide by it; this stops it being written at all.
  CONSTRAINT inventory_counts_expected_nonneg_ck
    CHECK (expected_item_count >= 0)
);

COMMENT ON TABLE inventory_counts IS 'One stock count, as an act. Groups the stocktake rows in stock_movements so a half-finished count is visible as half-finished. outlet_id NULL = unbranched store pool.';
COMMENT ON COLUMN inventory_counts.expected_item_count IS 'Ingredients in scope WHEN THE COUNT OPENED. A snapshot on purpose: recomputing it later would retroactively demote finished counts as new ingredients are added.';

-- Only ONE count may be open per shelf at a time. Two open sessions mean two
-- people counting the same sack into different documents, and each would then
-- report partial coverage of a shelf that was actually fully counted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_counts_one_open_per_branch
  ON inventory_counts(tenant_id, COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_inventory_counts_tenant_day
  ON inventory_counts(tenant_id, business_day DESC);

-- ============================================
-- 2. Link the ledger back to its session
-- ============================================
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS inventory_count_id UUID REFERENCES inventory_counts(id) ON DELETE SET NULL;
COMMENT ON COLUMN stock_movements.inventory_count_id IS 'The count session this stocktake belonged to, when it belonged to one. NULL for every other reason, and for one-off counts predating sessions.';

-- Partial: the vast majority of ledger rows are sales and will never carry one.
CREATE INDEX IF NOT EXISTS idx_stock_movements_count
  ON stock_movements(inventory_count_id) WHERE inventory_count_id IS NOT NULL;

-- ============================================
-- 3. A session may only ever collect counts
-- ============================================
-- Two rules, both about the coverage figure being honest:
--
-- 1. Only a `stocktake` may name a session. A delivery attached to a count
--    would raise coverage for an ingredient nobody counted — the exact
--    reassurance this whole table exists to withhold.
-- 2. The session must belong to the same tenant as the movement. A foreign key
--    proves the session exists, not that it is this store's.
--
-- A trigger rather than CHECKs because rule 2 reads another table.
CREATE OR REPLACE FUNCTION stock_movement_count_session_is_valid() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.inventory_count_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reason <> 'stocktake' THEN
    RAISE EXCEPTION 'Only a stocktake may belong to a count session (got %)', NEW.reason;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM inventory_counts c
     WHERE c.id = NEW.inventory_count_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Count session belongs to a different store';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_movement_count_session ON stock_movements;
CREATE TRIGGER trg_stock_movement_count_session
  BEFORE INSERT OR UPDATE OF inventory_count_id, reason, tenant_id ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movement_count_session_is_valid();

-- ============================================
-- 4. The branch must belong to this store
-- ============================================
-- Same reasoning as stock_transfers: the FK proves the outlet exists, not whose
-- it is. Without this a count could be opened against a stranger's branch.
CREATE OR REPLACE FUNCTION inventory_count_branch_belongs_to_tenant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Count branch belongs to a different store';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_count_branch ON inventory_counts;
CREATE TRIGGER trg_inventory_count_branch
  BEFORE INSERT OR UPDATE OF tenant_id, outlet_id ON inventory_counts
  FOR EACH ROW EXECUTE FUNCTION inventory_count_branch_belongs_to_tenant();

-- ============================================
-- 5. RLS — whoever may reach the shelf may see its count
-- ============================================
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;

-- Reuses app_user_may_reach_branch() from 20260809120000 so the branch rule has
-- one definition and cannot drift from inventory_stock or stock_transfers.
DROP POLICY IF EXISTS inventory_counts_manage_branch ON inventory_counts;
CREATE POLICY inventory_counts_manage_branch ON inventory_counts FOR ALL
  USING (app_user_may_reach_branch(tenant_id, outlet_id))
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));

DROP POLICY IF EXISTS inventory_counts_manage_superadmin ON inventory_counts;
CREATE POLICY inventory_counts_manage_superadmin ON inventory_counts FOR ALL
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

-- ============================================
-- ROLLBACK
-- ============================================
-- DROP POLICY IF EXISTS inventory_counts_manage_superadmin ON inventory_counts;
-- DROP POLICY IF EXISTS inventory_counts_manage_branch ON inventory_counts;
-- DROP TRIGGER IF EXISTS trg_inventory_count_branch ON inventory_counts;
-- DROP FUNCTION IF EXISTS inventory_count_branch_belongs_to_tenant();
-- DROP TRIGGER IF EXISTS trg_stock_movement_count_session ON stock_movements;
-- DROP FUNCTION IF EXISTS stock_movement_count_session_is_valid();
-- DROP INDEX IF EXISTS idx_stock_movements_count;
-- ALTER TABLE stock_movements DROP COLUMN IF EXISTS inventory_count_id;
-- DROP TABLE IF EXISTS inventory_counts;
