-- Multi-branch: WHEN the customer is asked which branch.
--
-- Purely additive. One defaulted column, no renames, no drops, no backfill.
-- Every existing tenant row keeps its exact current behaviour: the default is
-- 'before', which is the splash chooser that already ships.
--
--   before — the branch chooser covers the menu (mode tiles, then branches),
--            so the whole visit is scoped to one branch.
--   after  — the menu opens immediately; the branch is chosen at checkout
--            beside the order type. For merchants whose menu is identical at
--            every branch and who want nothing between the customer and the
--            food.
--
-- Only meaningful when multi_branch_enabled is true and two or more branches
-- are active; below that the storefront behaves as a single-location tenant
-- under either value.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS outlet_selection_timing TEXT NOT NULL DEFAULT 'before';

COMMENT ON COLUMN tenants.outlet_selection_timing IS
  'When the customer picks a branch: before the menu (splash chooser) or after (at checkout). Default before = the shipped behaviour.';

-- Constrained rather than free text so a typo cannot silently land a tenant in
-- neither flow — which would mean no gate AND no checkout picker, and a
-- multi-branch order placed against no branch at all. The application layer
-- (src/lib/outlets/selection-timing.ts) additionally reads anything unexpected
-- as 'before'; this is the second line of that same defence.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_outlet_selection_timing_ck;
ALTER TABLE tenants ADD CONSTRAINT tenants_outlet_selection_timing_ck
  CHECK (outlet_selection_timing IN ('before', 'after'));

-- ============================================
-- Rollback (manual)
-- ============================================
-- ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_outlet_selection_timing_ck;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS outlet_selection_timing;
