-- ============================================
-- Unified Modifier Groups
-- ============================================
-- Collapses the two parallel systems (grouped `variation_types` and flat
-- `addons`) into a single `modifier_groups` model on menu_items. Each group has
-- selection rules (min/max); each option carries a price modifier plus optional
-- per-option manual cost and simple stock count. Recipe-derived cost/stock is
-- keyed by the option's stable JSON id via recipes.modifier_option_id.
--
-- This migration is purely additive. The legacy `variations`, `variation_types`
-- and `addons` columns are left intact; application code normalizes them into
-- modifier groups on read, so existing menu items keep working untouched.

-- 1. Per-tenant feature flag (kept independent of inventory_enabled so the
--    unified editor can roll out without turning on ingredient inventory).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS modifier_groups_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. The unified groups payload. Shape (see src/types/database.ts ModifierGroup):
--    [{ id, name, display_order, min_select, max_select|null,
--       options: [{ id, name, price_modifier, image_url?, is_default?,
--                   display_order, manual_cost?, stock_mode?, stock_qty?,
--                   is_available? }] }]
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifier_groups JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN menu_items.modifier_groups IS
  'Unified modifier groups (supersedes variation_types + addons). Empty array → derive from legacy columns.';

-- 3. Extend recipes to cost a unified modifier option by its stable JSON id.
--    Existing variation_option / addon rows remain valid.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS modifier_option_id TEXT;

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_target_type_ck;
ALTER TABLE recipes ADD CONSTRAINT recipes_target_type_ck
  CHECK (target_type IN ('menu_item','variation_option','addon','modifier_option','prep_item'));

-- One recipe per modifier option (within its item).
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_modifier_option_uq
  ON recipes(tenant_id, menu_item_id, modifier_option_id)
  WHERE target_type = 'modifier_option';

-- ============================================
-- Rollback (manual)
-- ============================================
--   DROP INDEX IF EXISTS idx_recipes_modifier_option_uq;
--   ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_target_type_ck;
--   ALTER TABLE recipes ADD CONSTRAINT recipes_target_type_ck
--     CHECK (target_type IN ('menu_item','variation_option','addon','prep_item'));
--   ALTER TABLE recipes DROP COLUMN IF EXISTS modifier_option_id;
--   ALTER TABLE menu_items DROP COLUMN IF EXISTS modifier_groups;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS modifier_groups_enabled;
