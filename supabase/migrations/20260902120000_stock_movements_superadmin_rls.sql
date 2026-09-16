-- A platform superadmin could not move stock in a merchant's shop.
--
-- `20260809120000_inventory_branch_rls.sql` replaced the ledger's policies with
-- `app_user_may_reach_branch`, whose predicate requires an `app_users` row OF
-- THE TARGET TENANT. A superadmin's row has `tenant_id IS NULL`, so both the
-- SELECT and the INSERT policy refuse them: "Failed to record stock movement",
-- on-hand pinned at zero, and an activity feed that reads as empty because the
-- SELECT is refused too. Every sibling table in that series —
-- `inventory_stock`, `inventory_counts`, `stock_transfers` — was given its own
-- `*_manage_superadmin` policy for exactly this reason; `stock_movements` was
-- the one left out. Reproduced on SeaCook (QA, 2026-09-02): a superadmin
-- session sees zero ledger rows platform-wide while the service role sees many.
--
-- Verbs are deliberately SELECT and INSERT only. The ledger is append-only
-- (`20260807120000`), and a superadmin is not exempt from that.
--
-- Reversible: policies only. Rollback block at the end.

DROP POLICY IF EXISTS stock_movements_select_superadmin ON stock_movements;
CREATE POLICY stock_movements_select_superadmin ON stock_movements FOR SELECT
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

DROP POLICY IF EXISTS stock_movements_insert_superadmin ON stock_movements;
CREATE POLICY stock_movements_insert_superadmin ON stock_movements FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

-- ============================================
-- Rollback (manual):
--   DROP POLICY IF EXISTS stock_movements_insert_superadmin ON stock_movements;
--   DROP POLICY IF EXISTS stock_movements_select_superadmin ON stock_movements;
-- ============================================
