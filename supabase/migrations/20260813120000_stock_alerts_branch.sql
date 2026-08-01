-- Low-stock alerts become a branch's alerts.
--
-- `stock_alerts` was tenant-scoped, matching the alert service, which evaluated
-- `inventory_items.current_qty` -- the chain roll-up. A two-shop store holding
-- 700g of flour at North and none at South read as 700g, cleared every
-- threshold, and nobody was told South could not cook. That is the blindness
-- `BranchStockPanel` was built to make visible, still live on the one path that
-- actually interrupts a merchant.
--
-- `outlet_id IS NULL` means the alert is about the store rather than a branch:
-- every row written before this migration, and every row a single-shop tenant
-- will ever write. It is NOT "the store pool" here, which is the one place this
-- column's meaning departs from `inventory_stock.outlet_id` -- see the RLS note.

ALTER TABLE stock_alerts
  ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE;

COMMENT ON COLUMN stock_alerts.outlet_id IS
  'Branch this alert is about. NULL = store-wide (every row predating branch-aware alerting, and every single-shop tenant).';

-- One OPEN alert per ingredient per branch. Without the branch in the key, one
-- shop running out suppresses the alert for every other shop -- the dedup guard
-- would turn into the very blindness this migration removes.
--
-- Two partial indexes rather than one UNIQUE(tenant, item, outlet): Postgres
-- treats NULLs as distinct, so a plain UNIQUE would admit unlimited duplicate
-- store-wide alerts. Same lesson as `inventory_stock`.
--
-- The index they replace, `idx_stock_alerts_one_open_per_item`, keyed on
-- (tenant, item) alone and so made per-branch alerting IMPOSSIBLE at the
-- database level: the second branch's insert violated it. The service swallows
-- its own errors -- it runs behind a paid order and must never fail a sale --
-- so the alerts would simply have stopped appearing, with nothing anywhere
-- saying why. Found by probing the migration rather than by reading it.
DROP INDEX IF EXISTS idx_stock_alerts_one_open_per_item;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_alerts_open_branch
  ON stock_alerts(tenant_id, inventory_item_id, outlet_id)
  WHERE resolved_at IS NULL AND outlet_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_alerts_open_store
  ON stock_alerts(tenant_id, inventory_item_id)
  WHERE resolved_at IS NULL AND outlet_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_alerts_outlet
  ON stock_alerts(outlet_id) WHERE outlet_id IS NOT NULL;

-- Who may see which alert.
--
-- Deliberately `outlet_id IS NULL OR app_user_may_reach_branch(...)`, and not
-- the bare predicate `inventory_stock` uses. There, NULL is the unbranched
-- store pool -- a real shelf a branch manager has no business reading. Here it
-- means "about the store", which includes every alert raised before this
-- migration existed. Hiding those from a branch manager would silently blind
-- the accounts most likely to act on them, on the day the migration ran.
DROP POLICY IF EXISTS "Admins manage own-tenant rows" ON stock_alerts;

CREATE POLICY stock_alerts_manage_branch ON stock_alerts
  FOR ALL
  USING (outlet_id IS NULL OR app_user_may_reach_branch(tenant_id, outlet_id))
  WITH CHECK (outlet_id IS NULL OR app_user_may_reach_branch(tenant_id, outlet_id));

-- Rollback:
--   DROP POLICY IF EXISTS stock_alerts_manage_branch ON stock_alerts;
--   CREATE POLICY "Admins manage own-tenant rows" ON stock_alerts FOR ALL
--     USING (tenant_id IN (SELECT au.tenant_id FROM app_users au
--            WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
--   CREATE UNIQUE INDEX idx_stock_alerts_one_open_per_item
--     ON stock_alerts(tenant_id, inventory_item_id) WHERE resolved_at IS NULL;
--   DROP INDEX IF EXISTS idx_stock_alerts_open_branch;
--   DROP INDEX IF EXISTS idx_stock_alerts_open_store;
--   DROP INDEX IF EXISTS idx_stock_alerts_outlet;
--   ALTER TABLE stock_alerts DROP COLUMN IF EXISTS outlet_id;
