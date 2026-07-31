-- Inventory — Phase 3 of multi-branch: moving stock between shops
--
-- The cross-branch panel can already say "North → South". Nothing performs it,
-- so the only way to correct an imbalance today is to waste stock at one branch
-- and receive it at another — which lies twice in the ledger and destroys the
-- one figure shrinkage reporting depends on.
--
-- A transfer is a DOCUMENT, not a movement. It exists because stock spends real
-- time on a van: it has left the source shelf and has not reached the
-- destination, and pretending that state does not exist is what lets two
-- branches both count the same sack. Hence `sent` as a first-class status, and
-- hence a receive step that records what physically arrived rather than
-- assuming the load was intact.
--
-- The stock itself still moves ONLY through `stock_movements`. These tables
-- record intent and custody; the ledger records effect. That keeps
-- `apply_stock_movement()` the single writer of every on-hand figure, so the
-- roll-up invariant needs no special case for transfers — the two legs net to
-- zero and `inventory_items.current_qty` correctly does not move, because the
-- store still owns the same flour.
--
-- Additive: two new tables, no existing object altered. Rollback block at end.

-- ============================================
-- 1. stock_transfers — the document
-- ============================================
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- NULL = the unbranched store pool, matching inventory_stock and
  -- app_users.outlet_id. A tenant that opened its second branch still has stock
  -- sitting in the pool, and moving it out of there has to be expressible.
  --
  -- RESTRICT, not CASCADE or SET NULL: a transfer is the evidence for two
  -- branches' stock figures. CASCADE would delete that evidence and leave the
  -- ledger rows unexplained; SET NULL would silently rewrite history to say the
  -- stock came from the store pool. Nothing hard-deletes an outlet today —
  -- they are deactivated — so this blocks nothing that exists.
  from_outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,
  to_outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,

  status TEXT NOT NULL DEFAULT 'draft',

  note TEXT,

  -- Who did what, and when. Shrinkage is only actionable against a person and a
  -- time, and a transfer is precisely where stock goes missing between two
  -- people who each believe the other has it.
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT stock_transfers_status_ck
    CHECK (status IN ('draft','sent','received','cancelled')),

  -- Two legs against one shelf net to nothing but leave a document claiming
  -- stock moved. IS DISTINCT FROM, not <>, so pool-to-pool is caught too.
  CONSTRAINT stock_transfers_distinct_branches_ck
    CHECK (from_outlet_id IS DISTINCT FROM to_outlet_id)
);

COMMENT ON TABLE stock_transfers IS 'A branch-to-branch stock movement in progress. Custody and intent only — the quantities move through stock_movements. outlet_id NULL = unbranched store pool.';
COMMENT ON COLUMN stock_transfers.status IS 'draft -> sent -> received, or draft -> cancelled. sent -> cancelled is deliberately impossible: the stock has already left, so a lost load is closed by receiving zero, which posts it as shrinkage against the sender.';

CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant_created
  ON stock_transfers(tenant_id, created_at DESC);
-- A branch's own screen asks "what is coming to me?" and "what have I sent?",
-- which are two different columns, so neither index serves both.
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from
  ON stock_transfers(from_outlet_id, status) WHERE from_outlet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to
  ON stock_transfers(to_outlet_id, status) WHERE to_outlet_id IS NOT NULL;

-- ============================================
-- 2. stock_transfer_lines — what is on the van
-- ============================================
CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised tenant_id so RLS on this table needs no join to its parent.
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,

  -- Both in the item's STOCK unit, like every other quantity the ledger holds.
  -- A transfer is between two shelves of the same store; there is no second
  -- unit for a merchant to enter it in, and admitting one would put a
  -- conversion between two figures that must agree exactly.
  sent_quantity NUMERIC(16,4) NOT NULL,
  -- NULL until the destination counts it. NULL is not zero: "not yet counted"
  -- and "nothing arrived" are different facts, and only one of them is a loss.
  received_quantity NUMERIC(16,4),

  -- The SOURCE branch's cost per stock unit, frozen at send. The receiving
  -- branch did not buy this and has no price of its own; re-deriving it later
  -- would move the chain's stock value on a movement that changed nothing but
  -- location.
  unit_cost NUMERIC(12,4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT stock_transfer_lines_sent_positive_ck CHECK (sent_quantity > 0),
  -- Receiving more than was sent creates stock out of nothing. It is a counting
  -- error at one end or the other, and both ends need to look again.
  CONSTRAINT stock_transfer_lines_received_range_ck
    CHECK (received_quantity IS NULL OR (received_quantity >= 0 AND received_quantity <= sent_quantity))
);

COMMENT ON TABLE stock_transfer_lines IS 'One ingredient on a transfer. Quantities are in the item stock unit. received_quantity NULL = not yet counted, which is not the same fact as zero.';

-- One line per ingredient per transfer: a duplicate makes the receiving count
-- ambiguous, because the person counting has two rows for one pile of flour.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_lines_unique_item
  ON stock_transfer_lines(transfer_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_transfer
  ON stock_transfer_lines(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_item
  ON stock_transfer_lines(inventory_item_id);

-- ============================================
-- 3. Link the ledger back to its document
-- ============================================
-- Without this, a transfer_out row is a bare deduction: the merchant can see
-- 10kg left North and cannot see where it went or whether it ever landed.
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS stock_transfer_id UUID REFERENCES stock_transfers(id) ON DELETE SET NULL;
COMMENT ON COLUMN stock_movements.stock_transfer_id IS 'The transfer document this leg belongs to, when it is one.';
CREATE INDEX IF NOT EXISTS idx_stock_movements_transfer
  ON stock_movements(stock_transfer_id) WHERE stock_transfer_id IS NOT NULL;

-- ============================================
-- 4. Both ends must belong to this tenant
-- ============================================
-- A foreign key proves the outlet exists, not that it is THIS store's. Without
-- this, a transfer could name another tenant's branch as its destination — the
-- document would be creatable and would carry a stranger's outlet id, and the
-- receiving screen would offer a shop the merchant does not own.
--
-- No stock could actually move (apply_stock_movement() already rejects a
-- cross-tenant branch), which is why this is a paper hole rather than a stock
-- one — but the paper is what a person acts on.
--
-- A trigger rather than a CHECK because the rule reads another table, which a
-- CHECK constraint may not do. Found by probing the applied migration.
CREATE OR REPLACE FUNCTION stock_transfer_branches_belong_to_tenant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.from_outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.from_outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Transfer source branch belongs to a different store';
  END IF;

  IF NEW.to_outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.to_outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Transfer destination branch belongs to a different store';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_transfer_branches ON stock_transfers;
CREATE TRIGGER trg_stock_transfer_branches
  BEFORE INSERT OR UPDATE OF tenant_id, from_outlet_id, to_outlet_id ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION stock_transfer_branches_belong_to_tenant();

-- ============================================
-- 5. RLS — either end of the transfer may see it
-- ============================================
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;

-- Reuses app_user_may_reach_branch() from 20260809120000, so the branch rule
-- has one definition and these tables cannot drift from inventory_stock.
--
-- A transfer names TWO branches and both ends have a legitimate need to see it:
-- the sender is owed an answer about stock that left their shelf, and the
-- receiver cannot count in a delivery they cannot read. A store-wide account
-- reaches both ends and therefore every transfer.
--
-- Which end may SEND and which may RECEIVE is enforced in the service, not
-- here. RLS can say who may touch a row; it cannot express "only the
-- destination may move this from sent to received" without a trigger, and the
-- honest position is that this policy is the tenant-and-branch boundary while
-- the state machine is the workflow.
DROP POLICY IF EXISTS stock_transfers_manage_branch ON stock_transfers;
CREATE POLICY stock_transfers_manage_branch ON stock_transfers FOR ALL
  USING (
    app_user_may_reach_branch(tenant_id, from_outlet_id)
    OR app_user_may_reach_branch(tenant_id, to_outlet_id)
  )
  WITH CHECK (
    app_user_may_reach_branch(tenant_id, from_outlet_id)
    OR app_user_may_reach_branch(tenant_id, to_outlet_id)
  );

DROP POLICY IF EXISTS stock_transfer_lines_manage_branch ON stock_transfer_lines;
CREATE POLICY stock_transfer_lines_manage_branch ON stock_transfer_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM stock_transfers t
       WHERE t.id = stock_transfer_lines.transfer_id
         AND t.tenant_id = stock_transfer_lines.tenant_id
         AND (
           app_user_may_reach_branch(t.tenant_id, t.from_outlet_id)
           OR app_user_may_reach_branch(t.tenant_id, t.to_outlet_id)
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stock_transfers t
       WHERE t.id = stock_transfer_lines.transfer_id
         AND t.tenant_id = stock_transfer_lines.tenant_id
         AND (
           app_user_may_reach_branch(t.tenant_id, t.from_outlet_id)
           OR app_user_may_reach_branch(t.tenant_id, t.to_outlet_id)
         )
    )
  );

-- Superadmin support access, matching every other inventory table.
DROP POLICY IF EXISTS stock_transfers_manage_superadmin ON stock_transfers;
CREATE POLICY stock_transfers_manage_superadmin ON stock_transfers FOR ALL
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

DROP POLICY IF EXISTS stock_transfer_lines_manage_superadmin ON stock_transfer_lines;
CREATE POLICY stock_transfer_lines_manage_superadmin ON stock_transfer_lines FOR ALL
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

-- ============================================
-- ROLLBACK
-- ============================================
-- DROP POLICY IF EXISTS stock_transfer_lines_manage_superadmin ON stock_transfer_lines;
-- DROP POLICY IF EXISTS stock_transfers_manage_superadmin ON stock_transfers;
-- DROP POLICY IF EXISTS stock_transfer_lines_manage_branch ON stock_transfer_lines;
-- DROP POLICY IF EXISTS stock_transfers_manage_branch ON stock_transfers;
-- DROP TRIGGER IF EXISTS trg_stock_transfer_branches ON stock_transfers;
-- DROP FUNCTION IF EXISTS stock_transfer_branches_belong_to_tenant();
-- DROP INDEX IF EXISTS idx_stock_movements_transfer;
-- ALTER TABLE stock_movements DROP COLUMN IF EXISTS stock_transfer_id;
-- DROP TABLE IF EXISTS stock_transfer_lines;
-- DROP TABLE IF EXISTS stock_transfers;
