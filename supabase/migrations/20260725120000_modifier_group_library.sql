-- Reusable modifier-group library
-- Lets a tenant define a whole modifier group once (name + min/max selection
-- rules + option list) and attach fresh-id snapshots of it to many menu items,
-- instead of re-building the same group per item. A library entry can be a
-- manual entry (source_menu_item_id NULL) or sourced from an existing item's
-- group (source_menu_item_id set, prefilled at creation time).
-- Attaching copies a snapshot into menu_items.modifier_groups, so the
-- storefront / cart / order runtime is unchanged (snapshot-on-attach model).

-- ============================================
-- 1. modifier_group_library table
-- ============================================

CREATE TABLE IF NOT EXISTS modifier_group_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  -- NULL → unlimited multi-select; 1 → single-select; N → capped multi-select.
  max_select INTEGER,
  -- Option list. Shape mirrors ModifierOption minus per-item stock fields:
  --   [{ id, name, price_modifier, image_url?, is_default?, display_order, manual_cost? }]
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- When set, this entry was prefilled from a menu item's group. FK is SET NULL
  -- so the library entry survives (as a manual entry) if the source is deleted.
  source_menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT modifier_group_library_max_ge_min_ck
    CHECK (max_select IS NULL OR max_select >= min_select)
);

COMMENT ON TABLE modifier_group_library IS
  'Reusable per-tenant modifier-group definitions. Attaching copies a fresh-id snapshot into menu_items.modifier_groups; edits here do not retroactively change items already using a group.';

CREATE INDEX IF NOT EXISTS idx_modifier_group_library_tenant_id ON modifier_group_library(tenant_id);
CREATE INDEX IF NOT EXISTS idx_modifier_group_library_tenant_order ON modifier_group_library(tenant_id, display_order);

-- ============================================
-- 2. RLS policies (mirror addon_library)
-- ============================================

ALTER TABLE modifier_group_library ENABLE ROW LEVEL SECURITY;

-- Public read (active entries only, for admin authoring surfaces using the anon client)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'modifier_group_library' AND policyname = 'Public can view active modifier group library entries') THEN
    CREATE POLICY "Public can view active modifier group library entries" ON modifier_group_library
      FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- Admin INSERT
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'modifier_group_library' AND policyname = 'Admins can insert modifier group library entries for their tenant') THEN
    CREATE POLICY "Admins can insert modifier group library entries for their tenant" ON modifier_group_library
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'modifier_group_library' AND policyname = 'Admins can update modifier group library entries for their tenant') THEN
    CREATE POLICY "Admins can update modifier group library entries for their tenant" ON modifier_group_library
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'modifier_group_library' AND policyname = 'Admins can delete modifier group library entries for their tenant') THEN
    CREATE POLICY "Admins can delete modifier group library entries for their tenant" ON modifier_group_library
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'modifier_group_library' AND policyname = 'Superadmins can manage all modifier group library entries') THEN
    CREATE POLICY "Superadmins can manage all modifier group library entries" ON modifier_group_library
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM app_users au
          WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
        )
      );
  END IF;
END $$;
