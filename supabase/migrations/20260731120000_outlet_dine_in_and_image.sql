-- Multi-branch: dine-in as a third fulfillment mode, and a photo per branch.
--
-- Purely additive. Two nullable/defaulted columns and one widened CHECK. No
-- renames, no drops, no backfill — every existing outlet row keeps its exact
-- current meaning, and a tenant with `multi_branch_enabled` false still reads
-- none of this.

-- ============================================
-- 1. supports_dine_in
-- ============================================
-- Defaults to FALSE, not TRUE. Every outlet that exists today was created by a
-- merchant who was never shown a dine-in choice, so defaulting it on would put
-- a "Dine In" tile on storefronts whose merchants never asked for one and may
-- have no seating at all. Opt-in is the honest default; the admin form makes it
-- one checkbox away.
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS supports_dine_in BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN outlets.supports_dine_in IS
  'Branch seats customers. Independent of pickup/delivery: a table-service branch may support neither.';

-- ============================================
-- 2. image_url
-- ============================================
-- Storefront photo shown on the branch chooser card. Nullable: the card falls
-- back to a placeholder rather than refusing to render, so no merchant is
-- blocked from adding a branch by not having a photo to hand.
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS image_url TEXT;
COMMENT ON COLUMN outlets.image_url IS
  'Optional storefront photo for the branch chooser card. NULL renders a placeholder.';

-- ============================================
-- 3. Widen the fulfillment constraint
-- ============================================
-- The original constraint said a branch must do pickup or delivery, written
-- when those were the only two ways to receive an order. A dine-in-only branch
-- (table service, no takeaway counter) is a real shape and the old constraint
-- rejects it. The constraint's intent is unchanged: a branch must be reachable
-- by at least ONE mode, or it can never be chosen for anything.
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_fulfillment_ck;
ALTER TABLE outlets ADD CONSTRAINT outlets_fulfillment_ck
  CHECK (supports_pickup OR supports_delivery OR supports_dine_in);

-- ============================================
-- Rollback (manual)
-- ============================================
-- ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_fulfillment_ck;
-- ALTER TABLE outlets ADD CONSTRAINT outlets_fulfillment_ck
--   CHECK (supports_pickup OR supports_delivery);
-- ALTER TABLE outlets DROP COLUMN IF EXISTS image_url;
-- ALTER TABLE outlets DROP COLUMN IF EXISTS supports_dine_in;
