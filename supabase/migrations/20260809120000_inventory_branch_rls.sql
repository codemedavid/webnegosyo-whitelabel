-- Inventory — confine a branch account to its own branch's stock
--
-- The Phase 1 policies were role-based only: any `admin` of the tenant could
-- read and write every row of `inventory_stock` and `stock_movements`. Branch
-- managers are `role='admin'` plus an `app_users.outlet_id` — the choice that
-- kept every existing role check working — so the tenant-admin grant reached
-- them too, and a manager of one shop could count, waste, or receive stock in
-- the others.
--
-- The application already refuses this (`resolveMovementBranch`), but that is a
-- server action a caller can skip. This is the half that cannot be skipped.
--
-- The rule, for a row belonging to branch O in tenant T: the caller must be an
-- admin of T who is EITHER store-wide (`outlet_id IS NULL`) or an owner — both
-- see everything — OR locked to O itself.
--
-- A store-pool row (`outlet_id IS NULL`) is therefore visible only to a
-- store-wide account. That is deliberate: unbranched stock is the store's, not
-- any one shop's. `au.outlet_id = NULL` is NULL rather than true, so the
-- predicate already says this without a special case.
--
-- The order pipeline is unaffected: it writes with the service-role client,
-- which bypasses RLS entirely, and enforces its own tenant scoping.
--
-- Reversible: policies only. Rollback block at the end.

-- ============================================
-- 1. A reusable predicate
-- ============================================
-- One definition, so the two tables cannot drift apart. STABLE (not IMMUTABLE):
-- it reads app_users. SECURITY INVOKER, so it can never widen what the caller
-- could otherwise see.
CREATE OR REPLACE FUNCTION app_user_may_reach_branch(
  target_tenant_id UUID,
  target_outlet_id UUID
) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
      FROM app_users au
     WHERE au.user_id = auth.uid()
       AND au.tenant_id = target_tenant_id
       AND au.role = ANY (ARRAY['admin','superadmin'])
       AND (
         au.outlet_id IS NULL             -- store-wide account: every branch
         OR COALESCE(au.is_owner, false)  -- the owner, whatever their branch
         OR au.outlet_id = target_outlet_id
       )
  );
$$ LANGUAGE sql STABLE SECURITY INVOKER;

COMMENT ON FUNCTION app_user_may_reach_branch IS 'True when the current user administers this tenant AND is either store-wide or locked to this very branch. A NULL target_outlet_id (the store pool) is reachable only by a store-wide account.';

-- ============================================
-- 2. inventory_stock
-- ============================================
DROP POLICY IF EXISTS inventory_stock_manage_admin ON inventory_stock;
DROP POLICY IF EXISTS inventory_stock_manage_superadmin ON inventory_stock;

CREATE POLICY inventory_stock_manage_branch ON inventory_stock FOR ALL
  USING (app_user_may_reach_branch(tenant_id, outlet_id))
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));

-- Superadmins are platform staff and are not rows in the tenant's app_users, so
-- they need their own policy rather than an arm of the predicate.
CREATE POLICY inventory_stock_manage_superadmin ON inventory_stock FOR ALL
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

-- ============================================
-- 3. stock_movements
-- ============================================
-- SELECT and INSERT only: the ledger is append-only (migration 20260807120000)
-- and that must not be relaxed here. No UPDATE or DELETE policy is created, so
-- neither is permitted — a corrected count is a new movement, not an edit.
DROP POLICY IF EXISTS stock_movements_select_admin ON stock_movements;
DROP POLICY IF EXISTS stock_movements_insert_admin ON stock_movements;

CREATE POLICY stock_movements_select_branch ON stock_movements FOR SELECT
  USING (app_user_may_reach_branch(tenant_id, outlet_id));

CREATE POLICY stock_movements_insert_branch ON stock_movements FOR INSERT
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));

-- ============================================
-- Rollback (manual):
--   DROP POLICY IF EXISTS inventory_stock_manage_branch ON inventory_stock;
--   CREATE POLICY inventory_stock_manage_admin ON inventory_stock FOR ALL
--     USING (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])))
--     WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
--
--   DROP POLICY IF EXISTS stock_movements_select_branch ON stock_movements;
--   DROP POLICY IF EXISTS stock_movements_insert_branch ON stock_movements;
--   CREATE POLICY stock_movements_select_admin ON stock_movements FOR SELECT
--     USING (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
--   CREATE POLICY stock_movements_insert_admin ON stock_movements FOR INSERT
--     WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
--
--   DROP FUNCTION IF EXISTS app_user_may_reach_branch(UUID, UUID);
-- ============================================
