-- Presell (per-date) stock
--
-- A merchant flips presell on for a dish and allocates how many can be made on
-- each calendar date ("20 bilao on Dec 24"). Customers must pick one of those
-- dates when adding the dish, and an order consumes that date's allocation.
--
-- This is deliberately NOT part of the ingredient inventory system. Ingredient
-- stock is a single running scalar per (item, branch); presell is a promise
-- about a future date, made per menu item, and works whether or not the tenant
-- uses recipes at all. `presell_date` is a plain DATE in the store's business
-- day sense (Asia/Manila) — no instant, no timezone drift.
--
-- Both flags default FALSE. Presell forces a date choice on the customer; a
-- merchant has to ask for that.
--
-- Additive & reversible: two columns, two tables, one function. Rollback below.

-- ============================================
-- 1. Per-tenant and per-item switches
-- ============================================
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS presell_enabled BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN tenants.presell_enabled IS 'Platform flag: allow this tenant to sell per-date presell allocations.';

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS presell_enabled BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN menu_items.presell_enabled IS 'Customers must pick a presell date with remaining allocation to order this item.';

-- ============================================
-- 2. presell_stock — one allocation per (item, date)
-- ============================================
-- `sold_qty` is a counter, not a ledger: presell needs "how many are left on
-- Saturday", never "who moved what when" — the orders themselves are the audit
-- trail. Remaining = stock_qty - sold_qty, and only apply_presell_order()
-- may move sold_qty, under a row lock, so overselling is impossible.
--
-- No CHECK (sold_qty <= stock_qty): a merchant may lower an allocation below
-- what has already sold (stop selling more without voiding anything). Existing
-- sales stand; remaining simply clamps to zero.
CREATE TABLE IF NOT EXISTS presell_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  presell_date DATE NOT NULL,
  stock_qty INTEGER NOT NULL CHECK (stock_qty >= 0),
  sold_qty INTEGER NOT NULL DEFAULT 0 CHECK (sold_qty >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT presell_stock_item_date_uq UNIQUE (tenant_id, menu_item_id, presell_date)
);
COMMENT ON TABLE presell_stock IS 'Per-date presell allocations. Remaining = stock_qty - sold_qty; sold_qty moves only through apply_presell_order().';

CREATE INDEX IF NOT EXISTS idx_presell_stock_tenant_item
  ON presell_stock(tenant_id, menu_item_id, presell_date);

-- ============================================
-- 3. presell_stock_applications — idempotency per order
-- ============================================
-- Same shape and reasoning as order_stock_applications (20260805120000): under
-- concurrency only the database can say "this order already consumed its
-- presell", via a unique index. order_id is TEXT because orders may live in a
-- tenant's own Convex or Supabase deployment.
CREATE TABLE IF NOT EXISTS presell_stock_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('sale','void')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT presell_stock_applications_uq UNIQUE (tenant_id, order_id, reason)
);
COMMENT ON TABLE presell_stock_applications IS 'One row per order per direction; the unique index makes presell consumption idempotent.';

-- ============================================
-- 4. apply_presell_order — the only writer of sold_qty
-- ============================================
-- One transaction: take the idempotency claim, then move every line's counter
-- under FOR UPDATE. A sale line that cannot fit raises PRESELL_SHORTFALL and
-- rolls the whole order back (claim included), so a refused order is cleanly
-- retryable. A repeated call returns 'already_applied' and moves nothing.
--
-- p_lines: [{"menu_item_id": uuid, "presell_date": "YYYY-MM-DD", "quantity": n}]
CREATE OR REPLACE FUNCTION apply_presell_order(
  p_tenant_id UUID,
  p_order_id TEXT,
  p_direction TEXT,
  p_lines JSONB
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_line JSONB;
  v_menu_item_id UUID;
  v_date DATE;
  v_quantity INTEGER;
  v_updated INTEGER;
BEGIN
  IF p_direction NOT IN ('sale','void') THEN
    RAISE EXCEPTION 'invalid direction %', p_direction;
  END IF;

  BEGIN
    INSERT INTO presell_stock_applications (tenant_id, order_id, reason)
    VALUES (p_tenant_id, p_order_id, p_direction);
  EXCEPTION WHEN unique_violation THEN
    RETURN 'already_applied';
  END;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_menu_item_id := (v_line->>'menu_item_id')::UUID;
    v_date := (v_line->>'presell_date')::DATE;
    v_quantity := (v_line->>'quantity')::INTEGER;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'invalid presell quantity for %', v_menu_item_id;
    END IF;

    IF p_direction = 'sale' THEN
      UPDATE presell_stock
         SET sold_qty = sold_qty + v_quantity,
             updated_at = now()
       WHERE tenant_id = p_tenant_id
         AND menu_item_id = v_menu_item_id
         AND presell_date = v_date
         AND sold_qty + v_quantity <= stock_qty;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      -- Zero rows means either no allocation exists for that date or the
      -- remainder is too small. Both refuse the same way: the exception text
      -- is machine-readable so the caller can name the dish to the customer.
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'PRESELL_SHORTFALL:%:%', v_menu_item_id, v_date;
      END IF;
    ELSE
      UPDATE presell_stock
         SET sold_qty = GREATEST(sold_qty - v_quantity, 0),
             updated_at = now()
       WHERE tenant_id = p_tenant_id
         AND menu_item_id = v_menu_item_id
         AND presell_date = v_date;
    END IF;
  END LOOP;

  RETURN 'applied';
END;
$$;

-- Server-only. The storefront reads availability through a service-role API
-- route and orders consume through the service-role server action; no browser
-- session ever calls this.
REVOKE EXECUTE ON FUNCTION apply_presell_order(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_presell_order(UUID, TEXT, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION apply_presell_order(UUID, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION apply_presell_order(UUID, TEXT, TEXT, JSONB) TO service_role;

-- ============================================
-- 5. RLS — admin-write, mirrors stock_alerts
-- ============================================
ALTER TABLE presell_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE presell_stock_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'presell_stock' AND policyname = 'Admins manage own-tenant rows'
  ) THEN
    CREATE POLICY "Admins manage own-tenant rows" ON presell_stock FOR ALL
      USING (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])))
      WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'presell_stock' AND policyname = 'Superadmins manage all rows'
  ) THEN
    CREATE POLICY "Superadmins manage all rows" ON presell_stock FOR ALL
      USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'presell_stock_applications' AND policyname = 'Admins read own-tenant rows'
  ) THEN
    CREATE POLICY "Admins read own-tenant rows" ON presell_stock_applications FOR SELECT
      USING (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
  END IF;
END $$;

-- ============================================
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS apply_presell_order(UUID, TEXT, TEXT, JSONB);
--   DROP TABLE IF EXISTS presell_stock_applications;
--   DROP TABLE IF EXISTS presell_stock;
--   ALTER TABLE menu_items DROP COLUMN IF EXISTS presell_enabled;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS presell_enabled;
-- ============================================
