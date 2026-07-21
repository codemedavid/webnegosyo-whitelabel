-- Reusable add-on library
-- Lets a tenant define add-ons once and attach snapshots of them to many menu
-- items, instead of re-typing name/price per item. A library entry can be a
-- manual entry (source_menu_item_id NULL) or sourced from an existing menu item
-- (source_menu_item_id set, name/price prefilled at creation time).
-- Attaching copies a {id, name, price} snapshot into menu_items.addons, so the
-- customer/cart/order runtime is unchanged (snapshot-on-attach model).

-- ============================================
-- 1. addon_library table
-- ============================================

CREATE TABLE IF NOT EXISTS addon_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- When set, this entry was prefilled from a menu item. FK is SET NULL so the
  -- library entry survives (as a manual entry) if the source item is deleted.
  source_menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE addon_library IS
  'Reusable per-tenant add-on definitions. Attaching copies a snapshot into menu_items.addons; edits here do not retroactively change items already using an add-on.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_addon_library_tenant_id ON addon_library(tenant_id);
CREATE INDEX IF NOT EXISTS idx_addon_library_tenant_order ON addon_library(tenant_id, display_order);

-- ============================================
-- 2. RLS policies (mirror upsell_pairs)
-- ============================================

ALTER TABLE addon_library ENABLE ROW LEVEL SECURITY;

-- Public read (active entries only, for admin authoring surfaces that use the anon client)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'addon_library' AND policyname = 'Public can view active addon library entries') THEN
    CREATE POLICY "Public can view active addon library entries" ON addon_library
      FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- Admin INSERT
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'addon_library' AND policyname = 'Admins can insert addon library entries for their tenant') THEN
    CREATE POLICY "Admins can insert addon library entries for their tenant" ON addon_library
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'addon_library' AND policyname = 'Admins can update addon library entries for their tenant') THEN
    CREATE POLICY "Admins can update addon library entries for their tenant" ON addon_library
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'addon_library' AND policyname = 'Admins can delete addon library entries for their tenant') THEN
    CREATE POLICY "Admins can delete addon library entries for their tenant" ON addon_library
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'addon_library' AND policyname = 'Superadmins can manage all addon library entries') THEN
    CREATE POLICY "Superadmins can manage all addon library entries" ON addon_library
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM app_users au
          WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
        )
      );
  END IF;
END $$;
