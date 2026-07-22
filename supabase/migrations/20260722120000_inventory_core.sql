-- Inventory system — Phase A core (costing foundation)
-- Adds units of measure, ingredients (raw + composite/prep), and recipes (BOM)
-- so every costable entity — a menu item, a specific variation option, and an
-- addon — can carry a real ingredient-derived cost. Stock quantities and
-- movement ledger arrive in Phase B; the `current_qty` / `reorder_level`
-- columns are created now (unused) to avoid a later table rewrite.
--
-- Additive & reversible: new tables + one nullable tenants flag. Rollback block
-- at the end documents manual reversal.

-- ============================================
-- 0. Feature flag
-- ============================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS inventory_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- 1. inventory_units — units of measure + conversion
-- ============================================
-- Each unit belongs to one dimension and stores how many canonical base units
-- (gram / millilitre / piece) it holds. Same-dimension conversion is a ratio of
-- factors; cross-dimension conversion is intentionally unsupported.
CREATE TABLE IF NOT EXISTS inventory_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  dimension TEXT NOT NULL,
  to_base_factor NUMERIC(16,6) NOT NULL DEFAULT 1,
  is_base BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT inventory_units_dimension_ck CHECK (dimension IN ('weight','volume','count')),
  CONSTRAINT inventory_units_factor_ck CHECK (to_base_factor > 0)
);
COMMENT ON TABLE inventory_units IS 'Per-tenant units of measure. to_base_factor = base units per one of this unit (base unit = 1).';
CREATE INDEX IF NOT EXISTS idx_inventory_units_tenant_id ON inventory_units(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_units_tenant_abbrev_uq ON inventory_units(tenant_id, lower(abbreviation));

-- ============================================
-- 2. inventory_items — ingredients (raw materials & composite/prep)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  -- Unit the ingredient is stocked and priced in.
  stock_unit_id UUID NOT NULL REFERENCES inventory_units(id) ON DELETE RESTRICT,
  -- Cost per stock unit. Manual in Phase A; weighted moving average in Phase B.
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  -- Composite/prep flag: cost is derived from this item's prep recipe instead
  -- of unit_cost. The recipe (target_type='prep_item') carries the yield.
  is_prep BOOLEAN NOT NULL DEFAULT false,
  image_url TEXT,
  -- Phase B (created now, unused until then).
  current_qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(16,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT inventory_items_unit_cost_ck CHECK (unit_cost >= 0)
);
COMMENT ON TABLE inventory_items IS 'Per-tenant ingredients. Raw materials carry unit_cost; prep items (is_prep) derive cost from a prep recipe.';
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_id ON inventory_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_active ON inventory_items(tenant_id, is_active);

-- ============================================
-- 3. recipes — bill of materials per costable target
-- ============================================
-- target_type + the matching id column identify what this recipe costs:
--   menu_item       → menu_item_id (base configuration of an item)
--   variation_option→ menu_item_id + variation_option_id (incremental delta)
--   addon           → menu_item_id + addon_id
--   prep_item       → prep_item_id (a composite ingredient), with yield_*
-- variation_option_id / addon_id are the stable string ids inside menu_items JSON.
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  variation_option_id TEXT,
  addon_id TEXT,
  prep_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  -- Prep yield (only for target_type='prep_item').
  yield_quantity NUMERIC(16,4),
  yield_unit_id UUID REFERENCES inventory_units(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT recipes_target_type_ck CHECK (target_type IN ('menu_item','variation_option','addon','prep_item'))
);
COMMENT ON TABLE recipes IS 'Bill of materials per costable target (menu item base, variation option delta, addon, or prep item).';
CREATE INDEX IF NOT EXISTS idx_recipes_tenant_id ON recipes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item ON recipes(tenant_id, menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipes_prep_item ON recipes(prep_item_id);
-- One base recipe per menu item.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_menu_item_base_uq
  ON recipes(tenant_id, menu_item_id)
  WHERE target_type = 'menu_item';
-- One recipe per variation option.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_option_uq
  ON recipes(tenant_id, menu_item_id, variation_option_id)
  WHERE target_type = 'variation_option';
-- One recipe per addon (within its item).
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_addon_uq
  ON recipes(tenant_id, menu_item_id, addon_id)
  WHERE target_type = 'addon';
-- One prep recipe per prep item.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_prep_uq
  ON recipes(prep_item_id)
  WHERE target_type = 'prep_item';

-- ============================================
-- 4. recipe_components — ingredient lines of a recipe
-- ============================================
CREATE TABLE IF NOT EXISTS recipe_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(16,4) NOT NULL DEFAULT 0,
  unit_id UUID NOT NULL REFERENCES inventory_units(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT recipe_components_quantity_ck CHECK (quantity >= 0)
);
COMMENT ON TABLE recipe_components IS 'Ingredient lines of a recipe: quantity of an inventory item in a chosen unit.';
CREATE INDEX IF NOT EXISTS idx_recipe_components_recipe ON recipe_components(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_recipe_components_item ON recipe_components(inventory_item_id);

-- ============================================
-- 5. updated_at triggers (reuse shared set_updated_at)
-- ============================================
DROP TRIGGER IF EXISTS inventory_units_set_updated_at ON inventory_units;
CREATE TRIGGER inventory_units_set_updated_at BEFORE UPDATE ON inventory_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS inventory_items_set_updated_at ON inventory_items;
CREATE TRIGGER inventory_items_set_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS recipes_set_updated_at ON recipes;
CREATE TRIGGER recipes_set_updated_at BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS recipe_components_set_updated_at ON recipe_components;
CREATE TRIGGER recipe_components_set_updated_at BEFORE UPDATE ON recipe_components
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- 6. RLS — admin (own tenant) + superadmin (all), via a temp helper
-- ============================================
-- Inventory is not customer-facing, so there is no public SELECT policy.
CREATE OR REPLACE FUNCTION _inv_apply_tenant_rls(tbl regclass) RETURNS void AS $fn$
DECLARE t text := tbl::text;
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format($p$
    DO $inner$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = 'Admins manage own-tenant rows') THEN
        CREATE POLICY "Admins manage own-tenant rows" ON %s FOR ALL
          USING (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])))
          WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM app_users au WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = 'Superadmins manage all rows') THEN
        CREATE POLICY "Superadmins manage all rows" ON %s FOR ALL
          USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));
      END IF;
    END $inner$;
  $p$, t, t, t, t);
END;
$fn$ LANGUAGE plpgsql;

SELECT _inv_apply_tenant_rls('inventory_units');
SELECT _inv_apply_tenant_rls('inventory_items');
SELECT _inv_apply_tenant_rls('recipes');
SELECT _inv_apply_tenant_rls('recipe_components');

DROP FUNCTION _inv_apply_tenant_rls(regclass);

-- ============================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS recipe_components, recipes, inventory_items, inventory_units CASCADE;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS inventory_enabled;
-- ============================================
