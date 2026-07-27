-- Inventory system — Phase 5B: low-stock alerts and auto-86
--
-- `inventory_items.reorder_level` has existed since the Phase A migration and
-- so far only drives a badge in the web admin. This adds the record of an
-- ingredient having actually crossed that line, plus the two per-tenant
-- switches that decide whether anything acts on it.
--
-- Both flags default FALSE deliberately. Auto-86 takes items off a live menu;
-- a merchant has to ask for that. Turning it on for everyone at migration time
-- would hide bestsellers on menus whose recipes were never finished.
--
-- Additive & reversible: two columns, one table. Rollback block at the end.

-- ============================================
-- 1. Per-tenant switches
-- ============================================
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS low_stock_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_86_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.low_stock_alerts_enabled IS 'Raise a stock_alerts row when an ingredient crosses its reorder level.';
COMMENT ON COLUMN tenants.auto_86_enabled IS 'Take menu items off the menu when a base-recipe ingredient runs out. Un-86 stays manual.';

-- ============================================
-- 2. stock_alerts — one open row per ingredient
-- ============================================
-- An alert is raised on the CROSSING, not on the state: being low is a
-- condition that persists across every sale of the afternoon, and a row per
-- sale would bury the one that mattered. It stays open until stock recovers,
-- which is what makes "one open alert per ingredient" the right dedup key.
CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  -- Level crossed INTO. 'ok' is never stored — recovery resolves the row.
  level TEXT NOT NULL,
  -- On-hand quantity, in the item stock unit, at the moment of the crossing.
  quantity NUMERIC(16,4) NOT NULL,
  -- Snapshotted so the alert still reads correctly if the threshold is edited.
  reorder_level NUMERIC(16,4) NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_alerts_level_ck CHECK (level IN ('low','out'))
);
COMMENT ON TABLE stock_alerts IS 'Low-stock crossings. One unresolved row per ingredient; resolved when stock recovers to ok.';

CREATE INDEX IF NOT EXISTS idx_stock_alerts_tenant_id ON stock_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_open
  ON stock_alerts(tenant_id, created_at DESC) WHERE resolved_at IS NULL;

-- The dedup guard in application code checks for an open row before inserting.
-- This enforces the same rule in the database, so two concurrent depletions
-- crossing the same line cannot both win the check and raise a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_alerts_one_open_per_item
  ON stock_alerts(tenant_id, inventory_item_id) WHERE resolved_at IS NULL;

-- ============================================
-- 3. RLS — mirrors stock_movements
-- ============================================
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'stock_alerts' AND policyname = 'Admins manage own-tenant rows'
  ) THEN
    CREATE POLICY "Admins manage own-tenant rows" ON stock_alerts FOR ALL
      USING (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])))
      WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'stock_alerts' AND policyname = 'Superadmins manage all rows'
  ) THEN
    CREATE POLICY "Superadmins manage all rows" ON stock_alerts FOR ALL
      USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));
  END IF;
END $$;

-- ============================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS stock_alerts;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS low_stock_alerts_enabled;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS auto_86_enabled;
-- ============================================
