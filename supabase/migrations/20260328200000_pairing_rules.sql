-- Rule-based pairing system: tags, rules, targets, handpicked items

-- ============================================================
-- 1. Tag Definitions (platform presets + merchant custom tags)
-- ============================================================
CREATE TABLE IF NOT EXISTS tag_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  tag_value TEXT NOT NULL,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_definitions_unique
  ON tag_definitions (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), group_name, tag_value);

CREATE INDEX IF NOT EXISTS idx_tag_definitions_tenant ON tag_definitions(tenant_id);

ALTER TABLE tag_definitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_definitions' AND policyname = 'tag_definitions_select') THEN
    CREATE POLICY "tag_definitions_select" ON tag_definitions FOR SELECT
      USING (tenant_id IS NULL OR tenant_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_definitions' AND policyname = 'tag_definitions_insert') THEN
    CREATE POLICY "tag_definitions_insert" ON tag_definitions FOR INSERT
      WITH CHECK (tenant_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_definitions' AND policyname = 'tag_definitions_delete') THEN
    CREATE POLICY "tag_definitions_delete" ON tag_definitions FOR DELETE
      USING (tenant_id = auth.uid() AND is_preset = false);
  END IF;
END $$;

-- ============================================================
-- 2. Menu Item Tags (junction table)
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_item_tags (
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  tag_definition_id UUID NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (menu_item_id, tag_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_tags_tenant ON menu_item_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_tags_item ON menu_item_tags(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_tags_tag ON menu_item_tags(tag_definition_id);

ALTER TABLE menu_item_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'menu_item_tags' AND policyname = 'menu_item_tags_select') THEN
    CREATE POLICY "menu_item_tags_select" ON menu_item_tags FOR SELECT
      USING (tenant_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'menu_item_tags' AND policyname = 'menu_item_tags_insert') THEN
    CREATE POLICY "menu_item_tags_insert" ON menu_item_tags FOR INSERT
      WITH CHECK (tenant_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'menu_item_tags' AND policyname = 'menu_item_tags_delete') THEN
    CREATE POLICY "menu_item_tags_delete" ON menu_item_tags FOR DELETE
      USING (tenant_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 3. Seed platform preset tags
-- ============================================================
INSERT INTO tag_definitions (tenant_id, group_name, tag_value, is_preset) VALUES
  (NULL, 'Flavor Profile', 'spicy', true),
  (NULL, 'Flavor Profile', 'mild', true),
  (NULL, 'Flavor Profile', 'sweet', true),
  (NULL, 'Flavor Profile', 'savory', true),
  (NULL, 'Flavor Profile', 'sour', true),
  (NULL, 'Flavor Profile', 'umami', true),
  (NULL, 'Temperature', 'hot', true),
  (NULL, 'Temperature', 'cold', true),
  (NULL, 'Temperature', 'frozen', true),
  (NULL, 'Temperature', 'room-temp', true),
  (NULL, 'Diet', 'vegan', true),
  (NULL, 'Diet', 'vegetarian', true),
  (NULL, 'Diet', 'halal', true),
  (NULL, 'Diet', 'keto', true),
  (NULL, 'Diet', 'gluten-free', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. Pairing Rules
-- ============================================================
CREATE TABLE IF NOT EXISTS pairing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('category', 'tag')),
  source_category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  source_tag_id UUID REFERENCES tag_definitions(id) ON DELETE CASCADE,
  max_suggestions INTEGER NOT NULL DEFAULT 4 CHECK (max_suggestions BETWEEN 1 AND 8),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pairing_rules_source_check CHECK (
    (source_type = 'category' AND source_category_id IS NOT NULL AND source_tag_id IS NULL)
    OR (source_type = 'tag' AND source_tag_id IS NOT NULL AND source_category_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pairing_rules_tenant ON pairing_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pairing_rules_source_category ON pairing_rules(source_category_id) WHERE source_type = 'category';
CREATE INDEX IF NOT EXISTS idx_pairing_rules_source_tag ON pairing_rules(source_tag_id) WHERE source_type = 'tag';

ALTER TABLE pairing_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rules' AND policyname = 'pairing_rules_select') THEN
    CREATE POLICY "pairing_rules_select" ON pairing_rules FOR SELECT
      USING (tenant_id IS NULL OR tenant_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rules' AND policyname = 'pairing_rules_insert') THEN
    CREATE POLICY "pairing_rules_insert" ON pairing_rules FOR INSERT
      WITH CHECK (tenant_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rules' AND policyname = 'pairing_rules_update') THEN
    CREATE POLICY "pairing_rules_update" ON pairing_rules FOR UPDATE
      USING (tenant_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rules' AND policyname = 'pairing_rules_delete') THEN
    CREATE POLICY "pairing_rules_delete" ON pairing_rules FOR DELETE
      USING (tenant_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 5. Pairing Rule Targets (1-3 per rule)
-- ============================================================
CREATE TABLE IF NOT EXISTS pairing_rule_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES pairing_rules(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('category', 'tag')),
  target_category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  target_tag_id UUID REFERENCES tag_definitions(id) ON DELETE CASCADE,
  selection_mode TEXT NOT NULL DEFAULT 'handpick' CHECK (selection_mode IN ('handpick', 'any')),
  display_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT pairing_rule_targets_target_check CHECK (
    (target_type = 'category' AND target_category_id IS NOT NULL AND target_tag_id IS NULL)
    OR (target_type = 'tag' AND target_tag_id IS NOT NULL AND target_category_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pairing_rule_targets_rule ON pairing_rule_targets(rule_id);

ALTER TABLE pairing_rule_targets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rule_targets' AND policyname = 'pairing_rule_targets_select') THEN
    CREATE POLICY "pairing_rule_targets_select" ON pairing_rule_targets FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM pairing_rules WHERE pairing_rules.id = pairing_rule_targets.rule_id
          AND (pairing_rules.tenant_id IS NULL OR pairing_rules.tenant_id = auth.uid())
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rule_targets' AND policyname = 'pairing_rule_targets_insert') THEN
    CREATE POLICY "pairing_rule_targets_insert" ON pairing_rule_targets FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM pairing_rules WHERE pairing_rules.id = pairing_rule_targets.rule_id
          AND pairing_rules.tenant_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rule_targets' AND policyname = 'pairing_rule_targets_delete') THEN
    CREATE POLICY "pairing_rule_targets_delete" ON pairing_rule_targets FOR DELETE
      USING (EXISTS (
        SELECT 1 FROM pairing_rules WHERE pairing_rules.id = pairing_rule_targets.rule_id
          AND pairing_rules.tenant_id = auth.uid()
      ));
  END IF;
END $$;

-- ============================================================
-- 6. Pairing Rule Target Items (handpicked)
-- ============================================================
CREATE TABLE IF NOT EXISTS pairing_rule_target_items (
  target_id UUID NOT NULL REFERENCES pairing_rule_targets(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (target_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pairing_rule_target_items_target ON pairing_rule_target_items(target_id);

ALTER TABLE pairing_rule_target_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rule_target_items' AND policyname = 'pairing_rule_target_items_select') THEN
    CREATE POLICY "pairing_rule_target_items_select" ON pairing_rule_target_items FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM pairing_rule_targets
          JOIN pairing_rules ON pairing_rules.id = pairing_rule_targets.rule_id
        WHERE pairing_rule_targets.id = pairing_rule_target_items.target_id
          AND (pairing_rules.tenant_id IS NULL OR pairing_rules.tenant_id = auth.uid())
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rule_target_items' AND policyname = 'pairing_rule_target_items_insert') THEN
    CREATE POLICY "pairing_rule_target_items_insert" ON pairing_rule_target_items FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM pairing_rule_targets
          JOIN pairing_rules ON pairing_rules.id = pairing_rule_targets.rule_id
        WHERE pairing_rule_targets.id = pairing_rule_target_items.target_id
          AND pairing_rules.tenant_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pairing_rule_target_items' AND policyname = 'pairing_rule_target_items_delete') THEN
    CREATE POLICY "pairing_rule_target_items_delete" ON pairing_rule_target_items FOR DELETE
      USING (EXISTS (
        SELECT 1 FROM pairing_rule_targets
          JOIN pairing_rules ON pairing_rules.id = pairing_rule_targets.rule_id
        WHERE pairing_rule_targets.id = pairing_rule_target_items.target_id
          AND pairing_rules.tenant_id = auth.uid()
      ));
  END IF;
END $$;

-- ============================================================
-- 7. Add pairing_rules_enabled to tenants
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'pairing_rules_enabled'
  ) THEN
    ALTER TABLE tenants ADD COLUMN pairing_rules_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;
