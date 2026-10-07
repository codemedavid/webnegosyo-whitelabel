-- ============================================
-- Modifier groups on for every store
-- ============================================
-- The unified option editor (multi-pick groups with min/max limits) rolled out
-- to every store on 2026-07-27, but the column kept DEFAULT false. Every store
-- created afterwards (88 by 2026-10-06) landed on the legacy editor, which has
-- no "pick several" and no min/max — owners saw the controls "disappear".
--
-- Turning the flag on is safe for existing menus: an item with no
-- `modifier_groups` payload is normalized from its legacy variations /
-- variation_types / addons on read (normalizeModifierGroups), so the storefront
-- renders the same options until the owner edits the item.

ALTER TABLE tenants ALTER COLUMN modifier_groups_enabled SET DEFAULT true;

UPDATE tenants SET modifier_groups_enabled = true WHERE modifier_groups_enabled = false;

-- Rollback:
--   ALTER TABLE tenants ALTER COLUMN modifier_groups_enabled SET DEFAULT false;
--   (the backfilled ids are not recoverable from this file; keep a list before reverting)
