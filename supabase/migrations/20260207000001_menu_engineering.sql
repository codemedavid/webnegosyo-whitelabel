-- Menu Engineering: BCG classification, upsell pairs, badges, checkout interstitial
-- Phase 1 schema migration

-- ============================================
-- 1. Tenant columns for menu engineering feature flags
-- ============================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS menu_engineering_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkout_upsell_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkout_upsell_title TEXT DEFAULT 'Before you go...',
  ADD COLUMN IF NOT EXISTS checkout_upsell_subtitle TEXT DEFAULT 'You might also enjoy these items',
  ADD COLUMN IF NOT EXISTS checkout_upsell_max_items INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS hide_currency_symbol BOOLEAN DEFAULT false;

COMMENT ON COLUMN tenants.menu_engineering_enabled IS
  'Master toggle for all menu engineering features (BCG, upsells, badges, checkout interstitial). Controlled by superadmin.';
COMMENT ON COLUMN tenants.checkout_upsell_enabled IS
  'Enable/disable checkout interstitial upsell modal. Only effective when menu_engineering_enabled is also true.';
COMMENT ON COLUMN tenants.checkout_upsell_title IS
  'Title text for the checkout interstitial modal';
COMMENT ON COLUMN tenants.checkout_upsell_subtitle IS
  'Subtitle text for the checkout interstitial modal';
COMMENT ON COLUMN tenants.checkout_upsell_max_items IS
  'Maximum number of upsell items to show in checkout interstitial (1-8)';
COMMENT ON COLUMN tenants.hide_currency_symbol IS
  'Menu psychology: hide currency symbol on customer-facing menu/product pages. Requires menu_engineering_enabled.';

-- Backfill existing rows
UPDATE tenants SET menu_engineering_enabled = false WHERE menu_engineering_enabled IS NULL;
UPDATE tenants SET checkout_upsell_enabled = false WHERE checkout_upsell_enabled IS NULL;

-- ============================================
-- 2. Menu items columns for BCG + badges
-- ============================================

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS bcg_classification TEXT DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS badge_text TEXT;

-- CHECK constraint (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_bcg_classification_check'
  ) THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_bcg_classification_check
      CHECK (bcg_classification = ANY (ARRAY['star','plowhorse','puzzle','dog','unclassified']));
  END IF;
END $$;

COMMENT ON COLUMN menu_items.bcg_classification IS
  'BCG Matrix classification: star (high profit + high popularity), plowhorse (low profit + high popularity), puzzle (high profit + low popularity), dog (low profit + low popularity), unclassified (not yet classified)';
COMMENT ON COLUMN menu_items.badge_text IS
  'Custom badge text displayed on customer-facing menu cards (e.g. "Best Seller", "New", "Chef Pick")';

-- ============================================
-- 3. Upsell pairs table
-- ============================================

CREATE TABLE IF NOT EXISTS upsell_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  target_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  pair_type TEXT NOT NULL CHECK (pair_type = ANY (ARRAY['complementary','upgrade'])),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE upsell_pairs IS
  'Defines upsell/cross-sell relationships between menu items. complementary = suggest alongside, upgrade = suggest as alternative.';

-- Unique constraint (prevent duplicate pairs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'upsell_pairs_tenant_id_source_item_id_target_item_id_pair_t_key'
  ) THEN
    ALTER TABLE upsell_pairs ADD CONSTRAINT upsell_pairs_tenant_id_source_item_id_target_item_id_pair_t_key
      UNIQUE (tenant_id, source_item_id, target_item_id, pair_type);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_upsell_pairs_tenant_id ON upsell_pairs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_upsell_pairs_source_item_id ON upsell_pairs(source_item_id);

-- ============================================
-- 4. RLS policies for upsell_pairs
-- ============================================

ALTER TABLE upsell_pairs ENABLE ROW LEVEL SECURITY;

-- Public read (active pairs only, for customer-facing pages)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'upsell_pairs' AND policyname = 'Public can view active upsell pairs') THEN
    CREATE POLICY "Public can view active upsell pairs" ON upsell_pairs
      FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- Admin INSERT
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'upsell_pairs' AND policyname = 'Admins can insert upsell pairs for their tenant') THEN
    CREATE POLICY "Admins can insert upsell pairs for their tenant" ON upsell_pairs
      FOR INSERT WITH CHECK (
        tenant_id IN (
          SELECT au.tenant_id FROM app_users au
          WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])
        )
      );
  END IF;
END $$;

-- Admin UPDATE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'upsell_pairs' AND policyname = 'Admins can update upsell pairs for their tenant') THEN
    CREATE POLICY "Admins can update upsell pairs for their tenant" ON upsell_pairs
      FOR UPDATE USING (
        tenant_id IN (
          SELECT au.tenant_id FROM app_users au
          WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])
        )
      );
  END IF;
END $$;

-- Admin DELETE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'upsell_pairs' AND policyname = 'Admins can delete upsell pairs for their tenant') THEN
    CREATE POLICY "Admins can delete upsell pairs for their tenant" ON upsell_pairs
      FOR DELETE USING (
        tenant_id IN (
          SELECT au.tenant_id FROM app_users au
          WHERE au.user_id = auth.uid() AND au.role = ANY (ARRAY['admin','superadmin'])
        )
      );
  END IF;
END $$;

-- Superadmin full access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'upsell_pairs' AND policyname = 'Superadmins can manage all upsell pairs') THEN
    CREATE POLICY "Superadmins can manage all upsell pairs" ON upsell_pairs
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM app_users au
          WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
        )
      );
  END IF;
END $$;
