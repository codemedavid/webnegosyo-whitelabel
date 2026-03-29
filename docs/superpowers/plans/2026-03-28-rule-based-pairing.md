# Rule-Based Pairing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable pairing rules (category-based and tag-based) with handpicked item selection, so merchants and superadmins can control which upsell suggestions appear.

**Architecture:** 5 new database tables (tags + rules), a priority cascade resolver that replaces the flat complementary pairs lookup, admin UI as a new tab in the Boost Sales dashboard, and tag management integrated into the menu item form.

**Tech Stack:** Supabase (Postgres + RLS), Next.js 15 App Router, shadcn/ui, Zod, React transitions

**Spec:** `docs/superpowers/specs/2026-03-28-rule-based-pairing-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260328200000_pairing_rules.sql`
- Modify: `src/types/database.ts:94-102` (add feature flag + new types)

- [ ] **Step 1: Create migration file**

```sql
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

-- Unique constraint: one tag value per group per tenant (NULL tenant uses zero UUID sentinel)
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
  -- Flavor Profile
  (NULL, 'Flavor Profile', 'spicy', true),
  (NULL, 'Flavor Profile', 'mild', true),
  (NULL, 'Flavor Profile', 'sweet', true),
  (NULL, 'Flavor Profile', 'savory', true),
  (NULL, 'Flavor Profile', 'sour', true),
  (NULL, 'Flavor Profile', 'umami', true),
  -- Temperature
  (NULL, 'Temperature', 'hot', true),
  (NULL, 'Temperature', 'cold', true),
  (NULL, 'Temperature', 'frozen', true),
  (NULL, 'Temperature', 'room-temp', true),
  -- Diet
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
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` or apply via Supabase dashboard.
Expected: All 5 tables created, 15 preset tags seeded, `pairing_rules_enabled` column added to tenants.

- [ ] **Step 3: Add TypeScript types to `src/types/database.ts`**

Add after line 128 (before the closing `}` of the Tenant interface) — the feature flag:

```typescript
  // Pairing rules
  pairing_rules_enabled?: boolean;
```

Add at the end of the file — the new type interfaces:

```typescript
// ============================================================
// Pairing Rules Types
// ============================================================

export interface TagDefinition {
  id: string;
  tenant_id: string | null;
  group_name: string;
  tag_value: string;
  is_preset: boolean;
  created_at: string;
}

export interface MenuItemTag {
  menu_item_id: string;
  tag_definition_id: string;
  tenant_id: string;
}

export interface PairingRule {
  id: string;
  tenant_id: string | null;
  name: string;
  source_type: 'category' | 'tag';
  source_category_id: string | null;
  source_tag_id: string | null;
  max_suggestions: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PairingRuleTarget {
  id: string;
  rule_id: string;
  target_type: 'category' | 'tag';
  target_category_id: string | null;
  target_tag_id: string | null;
  selection_mode: 'handpick' | 'any';
  display_order: number;
}

export interface PairingRuleTargetItem {
  target_id: string;
  menu_item_id: string;
  display_order: number;
}

export interface PairingRuleWithDetails extends PairingRule {
  source_category?: Category;
  source_tag?: TagDefinition;
  targets: PairingRuleTargetWithDetails[];
}

export interface PairingRuleTargetWithDetails extends PairingRuleTarget {
  target_category?: Category;
  target_tag?: TagDefinition;
  items: MenuItem[];
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328200000_pairing_rules.sql src/types/database.ts
git commit -m "feat: add pairing rules and tagging database schema

5 new tables: tag_definitions, menu_item_tags, pairing_rules,
pairing_rule_targets, pairing_rule_target_items.
Seed 15 platform preset tags. Add pairing_rules_enabled tenant flag."
```

---

### Task 2: Tags Service

**Files:**
- Create: `src/lib/tags-service.ts`

- [ ] **Step 1: Create tags service**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { TagDefinition } from '@/types/database'

/**
 * Get all tag definitions visible to a tenant (their own + platform presets).
 */
export async function getTagDefinitions(
  tenantId: string
): Promise<TagDefinition[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('tag_definitions')
    .select('*')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order('group_name')
    .order('tag_value')

  if (error) {
    console.error('Error fetching tag definitions:', error)
    return []
  }

  return (data || []) as TagDefinition[]
}

/**
 * Get all platform preset tags (superadmin).
 */
export async function getPresetTags(): Promise<TagDefinition[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('tag_definitions')
    .select('*')
    .is('tenant_id', null)
    .order('group_name')
    .order('tag_value')

  if (error) {
    console.error('Error fetching preset tags:', error)
    return []
  }

  return (data || []) as TagDefinition[]
}

/**
 * Create a custom tag definition for a tenant.
 */
export async function createTagDefinition(
  tenantId: string,
  groupName: string,
  tagValue: string
): Promise<TagDefinition> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('tag_definitions')
    .insert({
      tenant_id: tenantId,
      group_name: groupName.trim(),
      tag_value: tagValue.trim().toLowerCase(),
      is_preset: false,
    })
    .select()
    .single()

  if (error) throw error
  return data as TagDefinition
}

/**
 * Create a platform preset tag (superadmin).
 */
export async function createPresetTag(
  groupName: string,
  tagValue: string
): Promise<TagDefinition> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('tag_definitions')
    .insert({
      tenant_id: null,
      group_name: groupName.trim(),
      tag_value: tagValue.trim().toLowerCase(),
      is_preset: true,
    })
    .select()
    .single()

  if (error) throw error
  return data as TagDefinition
}

/**
 * Delete a custom tag definition. Cannot delete presets.
 */
export async function deleteTagDefinition(
  id: string,
  tenantId: string
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('tag_definitions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('is_preset', false)

  if (error) throw error
}

/**
 * Delete a platform preset tag (superadmin).
 */
export async function deletePresetTag(id: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('tag_definitions')
    .delete()
    .eq('id', id)
    .is('tenant_id', null)

  if (error) throw error
}

/**
 * Get tag IDs for a menu item.
 */
export async function getItemTagIds(
  itemId: string,
  tenantId: string
): Promise<string[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('menu_item_tags')
    .select('tag_definition_id')
    .eq('menu_item_id', itemId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Error fetching item tags:', error)
    return []
  }

  return (data || []).map((row: { tag_definition_id: string }) => row.tag_definition_id)
}

/**
 * Get tags with full definitions for a menu item.
 */
export async function getItemTags(
  itemId: string,
  tenantId: string
): Promise<TagDefinition[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('menu_item_tags')
    .select('tag_definition:tag_definitions!tag_definition_id(*)')
    .eq('menu_item_id', itemId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Error fetching item tags:', error)
    return []
  }

  return (data || []).map(
    (row: Record<string, unknown>) => row.tag_definition as TagDefinition
  )
}

/**
 * Set tags for a menu item (replace all).
 */
export async function setItemTags(
  itemId: string,
  tenantId: string,
  tagDefinitionIds: string[]
): Promise<void> {
  const supabase = createAdminClient()

  // Delete existing tags
  const { error: deleteError } = await supabase
    .from('menu_item_tags')
    .delete()
    .eq('menu_item_id', itemId)
    .eq('tenant_id', tenantId)

  if (deleteError) throw deleteError

  // Insert new tags
  if (tagDefinitionIds.length > 0) {
    const rows = tagDefinitionIds.map((tagId) => ({
      menu_item_id: itemId,
      tag_definition_id: tagId,
      tenant_id: tenantId,
    }))

    const { error: insertError } = await supabase
      .from('menu_item_tags')
      .insert(rows)

    if (insertError) throw insertError
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tags-service.ts
git commit -m "feat: add tags service for tag definitions and menu item tagging"
```

---

### Task 3: Tags Server Actions

**Files:**
- Create: `src/app/actions/tags.ts`

- [ ] **Step 1: Create tags server actions**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import {
  createTagDefinition,
  deleteTagDefinition,
  createPresetTag,
  deletePresetTag,
  setItemTags,
  getTagDefinitions,
  getPresetTags,
  getItemTags,
} from '@/lib/tags-service'

export async function getTagDefinitionsAction(tenantId: string) {
  try {
    const data = await getTagDefinitions(tenantId)
    return { success: true as const, data }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to fetch tags' }
  }
}

export async function getPresetTagsAction() {
  try {
    const data = await getPresetTags()
    return { success: true as const, data }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to fetch preset tags' }
  }
}

export async function getItemTagsAction(itemId: string, tenantId: string) {
  try {
    const data = await getItemTags(itemId, tenantId)
    return { success: true as const, data }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to fetch item tags' }
  }
}

export async function createTagDefinitionAction(
  tenantId: string,
  tenantSlug: string,
  groupName: string,
  tagValue: string
) {
  try {
    const data = await createTagDefinition(tenantId, groupName, tagValue)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    return { success: true as const, data }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to create tag' }
  }
}

export async function deleteTagDefinitionAction(
  id: string,
  tenantId: string,
  tenantSlug: string
) {
  try {
    await deleteTagDefinition(id, tenantId)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to delete tag' }
  }
}

export async function createPresetTagAction(groupName: string, tagValue: string) {
  try {
    const data = await createPresetTag(groupName, tagValue)
    revalidatePath('/superadmin/settings')
    return { success: true as const, data }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to create preset tag' }
  }
}

export async function deletePresetTagAction(id: string) {
  try {
    await deletePresetTag(id)
    revalidatePath('/superadmin/settings')
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to delete preset tag' }
  }
}

export async function setItemTagsAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  tagDefinitionIds: string[]
) {
  try {
    await setItemTags(itemId, tenantId, tagDefinitionIds)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to update item tags' }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/actions/tags.ts
git commit -m "feat: add server actions for tag management"
```

---

### Task 4: Pairing Rules Service

**Files:**
- Create: `src/lib/pairing-rules-service.ts`

- [ ] **Step 1: Create pairing rules service**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  MenuItem,
  PairingRule,
  PairingRuleWithDetails,
  PairingRuleTargetWithDetails,
  TagDefinition,
  Category,
} from '@/types/database'

// ============================================================
// Rule CRUD
// ============================================================

interface CreateRuleInput {
  name: string
  sourceType: 'category' | 'tag'
  sourceCategoryId?: string
  sourceTagId?: string
  maxSuggestions: number
  targets: {
    targetType: 'category' | 'tag'
    targetCategoryId?: string
    targetTagId?: string
    selectionMode: 'handpick' | 'any'
    itemIds?: string[] // only for handpick
  }[]
}

/**
 * Get all pairing rules visible to a tenant (their own + platform defaults).
 * Includes full target and item details.
 */
export async function getPairingRules(
  tenantId: string
): Promise<PairingRuleWithDetails[]> {
  const supabase = createAdminClient()

  // Fetch rules (tenant + platform)
  const { data: rules, error: rulesError } = await supabase
    .from('pairing_rules')
    .select(`
      *,
      source_category:categories!source_category_id(id, name),
      source_tag:tag_definitions!source_tag_id(id, group_name, tag_value)
    `)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order('created_at', { ascending: false })

  if (rulesError) {
    console.error('Error fetching pairing rules:', rulesError)
    return []
  }

  if (!rules || rules.length === 0) return []

  const ruleIds = rules.map((r: { id: string }) => r.id)

  // Fetch targets for all rules
  const { data: targets, error: targetsError } = await supabase
    .from('pairing_rule_targets')
    .select(`
      *,
      target_category:categories!target_category_id(id, name),
      target_tag:tag_definitions!target_tag_id(id, group_name, tag_value)
    `)
    .in('rule_id', ruleIds)
    .order('display_order', { ascending: true })

  if (targetsError) {
    console.error('Error fetching rule targets:', targetsError)
    return []
  }

  const targetIds = (targets || [])
    .filter((t: { selection_mode: string }) => t.selection_mode === 'handpick')
    .map((t: { id: string }) => t.id)

  // Fetch handpicked items
  let targetItemsMap: Record<string, MenuItem[]> = {}
  if (targetIds.length > 0) {
    const { data: targetItems, error: itemsError } = await supabase
      .from('pairing_rule_target_items')
      .select(`
        target_id,
        display_order,
        menu_item:menu_items!menu_item_id(id, name, price, discounted_price, image_url, is_available, bcg_classification)
      `)
      .in('target_id', targetIds)
      .order('display_order', { ascending: true })

    if (itemsError) {
      console.error('Error fetching target items:', itemsError)
    }

    for (const ti of targetItems || []) {
      const row = ti as Record<string, unknown>
      const targetId = row.target_id as string
      if (!targetItemsMap[targetId]) targetItemsMap[targetId] = []
      targetItemsMap[targetId].push(row.menu_item as MenuItem)
    }
  }

  // Assemble
  return rules.map((rule: Record<string, unknown>) => {
    const ruleTargets = (targets || [])
      .filter((t: { rule_id: string }) => t.rule_id === (rule as { id: string }).id)
      .map((t: Record<string, unknown>) => ({
        ...t,
        target_category: t.target_category as Category | undefined,
        target_tag: t.target_tag as TagDefinition | undefined,
        items: targetItemsMap[(t as { id: string }).id] || [],
      })) as PairingRuleTargetWithDetails[]

    return {
      ...rule,
      source_category: rule.source_category as Category | undefined,
      source_tag: rule.source_tag as TagDefinition | undefined,
      targets: ruleTargets,
    } as PairingRuleWithDetails
  })
}

/**
 * Create a pairing rule with targets and handpicked items.
 */
export async function createPairingRule(
  tenantId: string | null,
  input: CreateRuleInput
): Promise<PairingRule> {
  const supabase = createAdminClient()

  if (input.targets.length === 0 || input.targets.length > 3) {
    throw new Error('Rules must have 1-3 target categories')
  }

  // Insert rule
  const { data: rule, error: ruleError } = await supabase
    .from('pairing_rules')
    .insert({
      tenant_id: tenantId,
      name: input.name.trim(),
      source_type: input.sourceType,
      source_category_id: input.sourceType === 'category' ? input.sourceCategoryId : null,
      source_tag_id: input.sourceType === 'tag' ? input.sourceTagId : null,
      max_suggestions: input.maxSuggestions,
      is_active: true,
    })
    .select()
    .single()

  if (ruleError) throw ruleError

  // Insert targets
  for (let i = 0; i < input.targets.length; i++) {
    const target = input.targets[i]

    const { data: targetRow, error: targetError } = await supabase
      .from('pairing_rule_targets')
      .insert({
        rule_id: (rule as { id: string }).id,
        target_type: target.targetType,
        target_category_id: target.targetType === 'category' ? target.targetCategoryId : null,
        target_tag_id: target.targetType === 'tag' ? target.targetTagId : null,
        selection_mode: target.selectionMode,
        display_order: i,
      })
      .select()
      .single()

    if (targetError) throw targetError

    // Insert handpicked items
    if (target.selectionMode === 'handpick' && target.itemIds && target.itemIds.length > 0) {
      const itemRows = target.itemIds.map((itemId, idx) => ({
        target_id: (targetRow as { id: string }).id,
        menu_item_id: itemId,
        display_order: idx,
      }))

      const { error: itemsError } = await supabase
        .from('pairing_rule_target_items')
        .insert(itemRows)

      if (itemsError) throw itemsError
    }
  }

  return rule as PairingRule
}

/**
 * Update a pairing rule (delete + recreate targets).
 */
export async function updatePairingRule(
  ruleId: string,
  tenantId: string | null,
  input: CreateRuleInput
): Promise<void> {
  const supabase = createAdminClient()

  if (input.targets.length === 0 || input.targets.length > 3) {
    throw new Error('Rules must have 1-3 target categories')
  }

  // Update rule fields
  const { error: updateError } = await supabase
    .from('pairing_rules')
    .update({
      name: input.name.trim(),
      source_type: input.sourceType,
      source_category_id: input.sourceType === 'category' ? input.sourceCategoryId : null,
      source_tag_id: input.sourceType === 'tag' ? input.sourceTagId : null,
      max_suggestions: input.maxSuggestions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ruleId)

  if (updateError) throw updateError

  // Delete old targets (CASCADE deletes target_items too)
  const { error: deleteError } = await supabase
    .from('pairing_rule_targets')
    .delete()
    .eq('rule_id', ruleId)

  if (deleteError) throw deleteError

  // Re-insert targets + items
  for (let i = 0; i < input.targets.length; i++) {
    const target = input.targets[i]

    const { data: targetRow, error: targetError } = await supabase
      .from('pairing_rule_targets')
      .insert({
        rule_id: ruleId,
        target_type: target.targetType,
        target_category_id: target.targetType === 'category' ? target.targetCategoryId : null,
        target_tag_id: target.targetType === 'tag' ? target.targetTagId : null,
        selection_mode: target.selectionMode,
        display_order: i,
      })
      .select()
      .single()

    if (targetError) throw targetError

    if (target.selectionMode === 'handpick' && target.itemIds && target.itemIds.length > 0) {
      const itemRows = target.itemIds.map((itemId, idx) => ({
        target_id: (targetRow as { id: string }).id,
        menu_item_id: itemId,
        display_order: idx,
      }))

      const { error: itemsError } = await supabase
        .from('pairing_rule_target_items')
        .insert(itemRows)

      if (itemsError) throw itemsError
    }
  }
}

/**
 * Toggle a pairing rule's active state.
 */
export async function togglePairingRule(
  ruleId: string,
  isActive: boolean
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('pairing_rules')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', ruleId)

  if (error) throw error
}

/**
 * Delete a pairing rule (CASCADE deletes targets + items).
 */
export async function deletePairingRule(
  ruleId: string,
  tenantId: string
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('pairing_rules')
    .delete()
    .eq('id', ruleId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

// ============================================================
// Resolution Engine (customer-facing)
// ============================================================

/**
 * Resolve upsell suggestions using the priority cascade:
 * 1. Manual pairs (existing upsell_pairs)
 * 2. Category pairing rules
 * 3. Tag pairing rules
 * 4. BCG auto-generated pairs
 *
 * First tier with results wins. Short-circuit.
 */
export async function resolveRuleBasedSuggestions(
  itemId: string,
  categoryId: string,
  tenantId: string,
  cartItemIds: string[] = []
): Promise<MenuItem[]> {
  const supabase = createAdminClient()

  // Get item's tag IDs
  const { data: tagRows } = await supabase
    .from('menu_item_tags')
    .select('tag_definition_id')
    .eq('menu_item_id', itemId)
    .eq('tenant_id', tenantId)

  const tagIds = (tagRows || []).map((r: { tag_definition_id: string }) => r.tag_definition_id)

  const excludeIds = new Set([itemId, ...cartItemIds])

  // --- Tier 2: Category pairing rules ---
  const categoryItems = await resolveRulesBySource(
    supabase,
    tenantId,
    'category',
    categoryId,
    excludeIds
  )
  if (categoryItems.length > 0) return categoryItems

  // --- Tier 3: Tag pairing rules ---
  if (tagIds.length > 0) {
    const tagItems = await resolveRulesBySourceTags(
      supabase,
      tenantId,
      tagIds,
      excludeIds
    )
    if (tagItems.length > 0) return tagItems
  }

  return []
}

async function resolveRulesBySource(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  sourceType: 'category' | 'tag',
  sourceId: string,
  excludeIds: Set<string>
): Promise<MenuItem[]> {
  const sourceColumn = sourceType === 'category' ? 'source_category_id' : 'source_tag_id'

  // Fetch matching rules — tenant first, then platform defaults
  const { data: rules } = await supabase
    .from('pairing_rules')
    .select('id, tenant_id, max_suggestions')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq('source_type', sourceType)
    .eq(sourceColumn, sourceId)
    .eq('is_active', true)
    .order('tenant_id', { ascending: false, nullsFirst: false }) // tenant rules first

  if (!rules || rules.length === 0) return []

  // Find the best rule: tenant-scoped wins over platform
  const rule = rules[0] as { id: string; tenant_id: string | null; max_suggestions: number }

  return resolveRuleTargets(supabase, rule.id, rule.max_suggestions, excludeIds)
}

async function resolveRulesBySourceTags(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  tagIds: string[],
  excludeIds: Set<string>
): Promise<MenuItem[]> {
  // Fetch matching tag rules
  const { data: rules } = await supabase
    .from('pairing_rules')
    .select('id, tenant_id, max_suggestions, source_tag_id')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq('source_type', 'tag')
    .in('source_tag_id', tagIds)
    .eq('is_active', true)
    .order('tenant_id', { ascending: false, nullsFirst: false })

  if (!rules || rules.length === 0) return []

  // Use first matching rule (tenant-scoped preferred)
  const rule = rules[0] as { id: string; max_suggestions: number }

  return resolveRuleTargets(supabase, rule.id, rule.max_suggestions, excludeIds)
}

async function resolveRuleTargets(
  supabase: ReturnType<typeof createAdminClient>,
  ruleId: string,
  maxSuggestions: number,
  excludeIds: Set<string>
): Promise<MenuItem[]> {
  // Fetch targets
  const { data: targets } = await supabase
    .from('pairing_rule_targets')
    .select('id, target_type, target_category_id, target_tag_id, selection_mode')
    .eq('rule_id', ruleId)
    .order('display_order', { ascending: true })

  if (!targets || targets.length === 0) return []

  const allItems: MenuItem[] = []

  for (const target of targets) {
    const t = target as {
      id: string
      target_type: string
      target_category_id: string | null
      target_tag_id: string | null
      selection_mode: string
    }

    let items: MenuItem[] = []

    if (t.selection_mode === 'handpick') {
      // Fetch handpicked items
      const { data: pickedRows } = await supabase
        .from('pairing_rule_target_items')
        .select('menu_item:menu_items!menu_item_id(id, name, description, price, discounted_price, image_url, is_available, category_id, variations, addons, variation_types, bcg_classification, badge_text, order, created_at, updated_at)')
        .eq('target_id', t.id)
        .order('display_order', { ascending: true })

      items = (pickedRows || [])
        .map((r: Record<string, unknown>) => r.menu_item as MenuItem)
        .filter((item: MenuItem) => item && item.is_available)
    } else {
      // Fetch random available items from target category/tag
      if (t.target_type === 'category' && t.target_category_id) {
        const { data: catItems } = await supabase
          .from('menu_items')
          .select('*')
          .eq('category_id', t.target_category_id)
          .eq('is_available', true)
          .limit(maxSuggestions)

        items = (catItems || []) as MenuItem[]
      } else if (t.target_type === 'tag' && t.target_tag_id) {
        const { data: taggedItems } = await supabase
          .from('menu_item_tags')
          .select('menu_item:menu_items!menu_item_id(*)')
          .eq('tag_definition_id', t.target_tag_id)

        items = (taggedItems || [])
          .map((r: Record<string, unknown>) => r.menu_item as MenuItem)
          .filter((item: MenuItem) => item && item.is_available)
      }
    }

    // Filter out excluded items (already in cart + source item)
    for (const item of items) {
      if (!excludeIds.has(item.id) && allItems.length < maxSuggestions) {
        allItems.push(item)
        excludeIds.add(item.id) // prevent duplicates across targets
      }
    }

    if (allItems.length >= maxSuggestions) break
  }

  return allItems
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pairing-rules-service.ts
git commit -m "feat: add pairing rules service with CRUD and resolution engine"
```

---

### Task 5: Pairing Rules Server Actions

**Files:**
- Create: `src/app/actions/pairing-rules.ts`

- [ ] **Step 1: Create pairing rules server actions**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import {
  getPairingRules,
  createPairingRule,
  updatePairingRule,
  togglePairingRule,
  deletePairingRule,
} from '@/lib/pairing-rules-service'

export async function getPairingRulesAction(tenantId: string) {
  try {
    const data = await getPairingRules(tenantId)
    return { success: true as const, data }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to fetch rules' }
  }
}

export async function createPairingRuleAction(
  tenantId: string | null,
  tenantSlug: string,
  input: {
    name: string
    sourceType: 'category' | 'tag'
    sourceCategoryId?: string
    sourceTagId?: string
    maxSuggestions: number
    targets: {
      targetType: 'category' | 'tag'
      targetCategoryId?: string
      targetTagId?: string
      selectionMode: 'handpick' | 'any'
      itemIds?: string[]
    }[]
  }
) {
  try {
    const data = await createPairingRule(tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/boost-sales`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true as const, data }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to create rule' }
  }
}

export async function updatePairingRuleAction(
  ruleId: string,
  tenantId: string | null,
  tenantSlug: string,
  input: {
    name: string
    sourceType: 'category' | 'tag'
    sourceCategoryId?: string
    sourceTagId?: string
    maxSuggestions: number
    targets: {
      targetType: 'category' | 'tag'
      targetCategoryId?: string
      targetTagId?: string
      selectionMode: 'handpick' | 'any'
      itemIds?: string[]
    }[]
  }
) {
  try {
    await updatePairingRule(ruleId, tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/boost-sales`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to update rule' }
  }
}

export async function togglePairingRuleAction(
  ruleId: string,
  tenantSlug: string,
  isActive: boolean
) {
  try {
    await togglePairingRule(ruleId, isActive)
    revalidatePath(`/${tenantSlug}/admin/boost-sales`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to toggle rule' }
  }
}

export async function deletePairingRuleAction(
  ruleId: string,
  tenantId: string,
  tenantSlug: string
) {
  try {
    await deletePairingRule(ruleId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/boost-sales`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to delete rule' }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/actions/pairing-rules.ts
git commit -m "feat: add server actions for pairing rules CRUD"
```

---

### Task 6: Integrate Resolution into Complementary Pairs Service

**Files:**
- Modify: `src/lib/complementary-pairs-service.ts`

This is the critical integration point — extending `getComplementaryItems()` to use the priority cascade when `pairing_rules_enabled` is true.

- [ ] **Step 1: Add the cascade to `getComplementaryItems()`**

Add this import at the top of `src/lib/complementary-pairs-service.ts`:

```typescript
import { resolveRuleBasedSuggestions } from '@/lib/pairing-rules-service'
```

Replace the existing `getComplementaryItems` function with:

```typescript
/**
 * Get complementary items for a menu item.
 * Priority cascade (when pairing_rules_enabled):
 *   1. Manual pairs (item-level, then category-level from this table)
 *   2. Category pairing rules
 *   3. Tag pairing rules
 *   4. BCG auto-generated (handled by caller)
 *
 * When pairing_rules_enabled is false, uses original item→category fallback.
 */
export async function getComplementaryItems(
  itemId: string,
  categoryId: string,
  tenantId: string,
  options?: { pairingRulesEnabled?: boolean; cartItemIds?: string[] }
): Promise<MenuItem[]> {
  const supabase = createAdminClient()

  // --- Tier 1: Manual item-level pairs ---
  const { data: itemPairs, error: itemError } = await supabase
    .from('complementary_pairs')
    .select('target_item_id, display_order, target_item:menu_items!target_item_id(*)')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'item')
    .eq('source_item_id', itemId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(4)

  if (itemError) {
    console.error('Error fetching item-level complementary pairs:', itemError)
  }

  if (itemPairs && itemPairs.length > 0) {
    return itemPairs
      .map((p: Record<string, unknown>) => p.target_item as MenuItem)
      .filter((item: MenuItem) => item && item.is_available)
  }

  // --- Tier 1b: Manual category-level pairs ---
  const { data: categoryPairs, error: categoryError } = await supabase
    .from('complementary_pairs')
    .select('target_item_id, display_order, target_item:menu_items!target_item_id(*)')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'category')
    .eq('source_category_id', categoryId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(4)

  if (categoryError) {
    console.error('Error fetching category-level complementary pairs:', categoryError)
  }

  if (categoryPairs && categoryPairs.length > 0) {
    return categoryPairs
      .map((p: Record<string, unknown>) => p.target_item as MenuItem)
      .filter((item: MenuItem) => item && item.is_available)
  }

  // --- Tiers 2 & 3: Category + Tag pairing rules ---
  if (options?.pairingRulesEnabled) {
    const ruleItems = await resolveRuleBasedSuggestions(
      itemId,
      categoryId,
      tenantId,
      options.cartItemIds
    )
    if (ruleItems.length > 0) return ruleItems
  }

  return []
}
```

- [ ] **Step 2: Find all callers of `getComplementaryItems` and pass the new options**

Run: `grep -rn 'getComplementaryItems' src/ --include='*.ts' --include='*.tsx'`

For each caller, add the `pairingRulesEnabled` option. The caller needs the tenant's `pairing_rules_enabled` flag. This is typically available from the tenant object already in scope. For example, in server actions or components that already have the tenant data, pass:

```typescript
const items = await getComplementaryItems(itemId, categoryId, tenantId, {
  pairingRulesEnabled: tenant.pairing_rules_enabled ?? false,
  cartItemIds,
})
```

The exact callers will vary — update each one. If a caller doesn't have the tenant object, the `options` parameter is optional and defaults to the old behavior (no rules).

- [ ] **Step 3: Commit**

```bash
git add src/lib/complementary-pairs-service.ts
git commit -m "feat: integrate pairing rules into complementary pairs resolution cascade"
```

---

### Task 7: Tag Manager Component (Menu Item Form)

**Files:**
- Create: `src/components/admin/tag-manager.tsx`
- Modify: `src/components/admin/menu-item-form.tsx`

- [ ] **Step 1: Create tag manager component**

```typescript
'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, X, Tag } from 'lucide-react'
import { toast } from 'sonner'
import type { TagDefinition } from '@/types/database'
import {
  getTagDefinitionsAction,
  getItemTagsAction,
  setItemTagsAction,
  createTagDefinitionAction,
} from '@/app/actions/tags'

interface TagManagerProps {
  itemId: string | null // null when creating new item
  tenantId: string
  tenantSlug: string
  onChange?: (tagIds: string[]) => void // for new items that don't have an ID yet
}

export function TagManager({ itemId, tenantId, tenantSlug, onChange }: TagManagerProps) {
  const [allTags, setAllTags] = useState<TagDefinition[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [newValue, setNewValue] = useState('')

  // Group tags by group_name
  const grouped = useMemo(() => {
    const map = new Map<string, TagDefinition[]>()
    for (const tag of allTags) {
      const group = map.get(tag.group_name) || []
      group.push(tag)
      map.set(tag.group_name, group)
    }
    return map
  }, [allTags])

  // Load tags on mount
  useEffect(() => {
    startTransition(async () => {
      const [tagsResult, itemTagsResult] = await Promise.all([
        getTagDefinitionsAction(tenantId),
        itemId ? getItemTagsAction(itemId, tenantId) : Promise.resolve({ success: true as const, data: [] }),
      ])

      if (tagsResult.success) setAllTags(tagsResult.data)
      if (itemTagsResult.success && 'data' in itemTagsResult) {
        setSelectedIds(new Set(itemTagsResult.data.map((t: TagDefinition) => t.id)))
      }
    })
  }, [tenantId, itemId])

  const toggleTag = (tagId: string) => {
    const next = new Set(selectedIds)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    setSelectedIds(next)

    if (onChange) {
      onChange(Array.from(next))
    } else if (itemId) {
      // Save immediately for existing items
      startTransition(async () => {
        const result = await setItemTagsAction(itemId, tenantId, tenantSlug, Array.from(next))
        if (!result.success) toast.error(result.error)
      })
    }
  }

  const handleAddCustomTag = () => {
    if (!newGroup.trim() || !newValue.trim()) return

    startTransition(async () => {
      const result = await createTagDefinitionAction(tenantId, tenantSlug, newGroup.trim(), newValue.trim())
      if (result.success) {
        setAllTags(prev => [...prev, result.data])
        setNewGroup('')
        setNewValue('')
        setShowAdd(false)
        toast.success('Tag created')
      } else {
        toast.error(result.error)
      }
    })
  }

  const existingGroups = useMemo(() => Array.from(grouped.keys()), [grouped])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Tags
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
          disabled={isPending}
        >
          <Plus className="h-3 w-3 mr-1" />
          Custom Tag
        </Button>
      </div>

      {/* Tag groups */}
      {Array.from(grouped.entries()).map(([groupName, tags]) => (
        <div key={groupName} className="space-y-1">
          <span className="text-xs text-muted-foreground font-medium">{groupName}</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant={selectedIds.has(tag.id) ? 'default' : 'outline'}
                className="cursor-pointer select-none transition-colors"
                onClick={() => toggleTag(tag.id)}
              >
                {tag.tag_value}
                {selectedIds.has(tag.id) && (
                  <X className="h-3 w-3 ml-1" />
                )}
              </Badge>
            ))}
          </div>
        </div>
      ))}

      {allTags.length === 0 && !isPending && (
        <p className="text-xs text-muted-foreground">No tags available</p>
      )}

      {/* Add custom tag inline */}
      {showAdd && (
        <div className="flex gap-2 items-end border rounded-md p-3 bg-muted/30">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Group</Label>
            <Select value={newGroup} onValueChange={setNewGroup}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select or type..." />
              </SelectTrigger>
              <SelectContent>
                {existingGroups.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
                <SelectItem value="__custom__">+ New Group...</SelectItem>
              </SelectContent>
            </Select>
            {newGroup === '__custom__' && (
              <Input
                className="h-8 text-xs mt-1"
                placeholder="Group name"
                onChange={(e) => setNewGroup(e.target.value === '' ? '__custom__' : e.target.value)}
              />
            )}
          </div>
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Value</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. crispy"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={handleAddCustomTag}
            disabled={isPending || !newGroup.trim() || !newValue.trim() || newGroup === '__custom__'}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add TagManager to menu item form**

In `src/components/admin/menu-item-form.tsx`, import and render the TagManager in the menu engineering section. Find the block that checks `menuEngineeringEnabled` and add after the BCG/badge fields:

```typescript
import { TagManager } from '@/components/admin/tag-manager'
```

Then inside the `{menuEngineeringEnabled && (...)}` section, add:

```tsx
<TagManager
  itemId={editItem?.id ?? null}
  tenantId={tenantId}
  tenantSlug={tenantSlug}
/>
```

The exact insertion point depends on the form structure — it should go after the BCG classification / badge text fields, inside the same conditional block.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/tag-manager.tsx src/components/admin/menu-item-form.tsx
git commit -m "feat: add tag manager component to menu item form"
```

---

### Task 8: Rule Item Picker Component

**Files:**
- Create: `src/components/admin/rule-item-picker.tsx`

- [ ] **Step 1: Create the item picker dialog**

```typescript
'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MenuItem } from '@/types/database'

const BCG_BADGES: Record<string, { label: string; className: string }> = {
  star: { label: 'Star', className: 'bg-amber-900/50 text-amber-400' },
  plowhorse: { label: 'Plowhorse', className: 'bg-blue-900/50 text-blue-400' },
  puzzle: { label: 'Puzzle', className: 'bg-purple-900/50 text-purple-400' },
  dog: { label: 'Dog', className: 'bg-stone-800/50 text-stone-400' },
}

interface RuleItemPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryName: string
  items: MenuItem[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
}

export function RuleItemPicker({
  open,
  onOpenChange,
  categoryName,
  items,
  selectedIds,
  onSelectionChange,
}: RuleItemPickerProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const available = items.filter((i) => i.is_available)
    const unavailable = items.filter((i) => !i.is_available)

    const matchAvailable = q
      ? available.filter((i) => i.name.toLowerCase().includes(q))
      : available
    const matchUnavailable = q
      ? unavailable.filter((i) => i.name.toLowerCase().includes(q))
      : unavailable

    return { available: matchAvailable, unavailable: matchUnavailable }
  }, [items, search])

  const toggle = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pick items from {categoryName}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select which items to suggest when this rule triggers
          </p>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{selectedIds.size} selected</span>
        </div>

        <Input
          placeholder={`Search ${categoryName.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filtered.available.map((item) => {
            const isSelected = selectedIds.has(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-colors',
                  isSelected
                    ? 'bg-green-950/40 border border-green-800'
                    : 'bg-muted/30 border border-transparent hover:bg-muted/50'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded border flex items-center justify-center shrink-0',
                    isSelected
                      ? 'bg-green-600 border-green-600'
                      : 'border-muted-foreground/40'
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ₱{item.discounted_price ?? item.price}
                  </div>
                </div>
                {item.bcg_classification && item.bcg_classification !== 'unclassified' && (
                  <Badge variant="outline" className={cn('text-[10px] shrink-0', BCG_BADGES[item.bcg_classification]?.className)}>
                    {BCG_BADGES[item.bcg_classification]?.label}
                  </Badge>
                )}
              </button>
            )
          })}

          {filtered.unavailable.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground pt-2 pb-1">Unavailable</div>
              {filtered.unavailable.map((item) => (
                <div
                  key={item.id}
                  className="w-full flex items-center gap-3 p-2.5 rounded-md opacity-40"
                >
                  <div className="w-5 h-5 rounded border border-muted-foreground/20 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground">₱{item.price} · Unavailable</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <Button onClick={() => onOpenChange(false)} className="w-full">
          Done ({selectedIds.size} selected)
        </Button>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/rule-item-picker.tsx
git commit -m "feat: add rule item picker dialog for handpicking upsell items"
```

---

### Task 9: Pairing Rules Tab Component

**Files:**
- Create: `src/components/admin/pairing-rules-tab.tsx`
- Modify: `src/components/admin/boost-sales-dashboard.tsx`

- [ ] **Step 1: Create the pairing rules tab**

This is the largest component. It includes the rules list, add/edit dialog, and target management. Create `src/components/admin/pairing-rules-tab.tsx`:

```typescript
'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreVertical, Pencil, Trash2, ArrowRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type {
  Category,
  MenuItem,
  TagDefinition,
  PairingRuleWithDetails,
} from '@/types/database'
import {
  getPairingRulesAction,
  createPairingRuleAction,
  updatePairingRuleAction,
  togglePairingRuleAction,
  deletePairingRuleAction,
} from '@/app/actions/pairing-rules'
import { getTagDefinitionsAction } from '@/app/actions/tags'
import { RuleItemPicker } from '@/components/admin/rule-item-picker'

interface TargetDraft {
  targetType: 'category' | 'tag'
  targetCategoryId?: string
  targetTagId?: string
  selectionMode: 'handpick' | 'any'
  selectedItemIds: Set<string>
}

interface PairingRulesTabProps {
  tenantId: string
  tenantSlug: string
  categories: Category[]
  menuItems: MenuItem[]
}

export function PairingRulesTab({
  tenantId,
  tenantSlug,
  categories,
  menuItems,
}: PairingRulesTabProps) {
  const [rules, setRules] = useState<PairingRuleWithDetails[]>([])
  const [tags, setTags] = useState<TagDefinition[]>([])
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<PairingRuleWithDetails | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState<'category' | 'tag'>('category')
  const [sourceCategoryId, setSourceCategoryId] = useState('')
  const [sourceTagId, setSourceTagId] = useState('')
  const [maxSuggestions, setMaxSuggestions] = useState(4)
  const [targets, setTargets] = useState<TargetDraft[]>([])

  // Item picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number>(-1)

  const loadData = useCallback(() => {
    startTransition(async () => {
      const [rulesResult, tagsResult] = await Promise.all([
        getPairingRulesAction(tenantId),
        getTagDefinitionsAction(tenantId),
      ])
      if (rulesResult.success) setRules(rulesResult.data)
      if (tagsResult.success) setTags(tagsResult.data)
    })
  }, [tenantId])

  useEffect(() => { loadData() }, [loadData])

  const resetForm = () => {
    setName('')
    setSourceType('category')
    setSourceCategoryId('')
    setSourceTagId('')
    setMaxSuggestions(4)
    setTargets([])
    setEditingRule(null)
  }

  const openAddDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (rule: PairingRuleWithDetails) => {
    setEditingRule(rule)
    setName(rule.name)
    setSourceType(rule.source_type)
    setSourceCategoryId(rule.source_category_id || '')
    setSourceTagId(rule.source_tag_id || '')
    setMaxSuggestions(rule.max_suggestions)
    setTargets(
      rule.targets.map((t) => ({
        targetType: t.target_type,
        targetCategoryId: t.target_category_id || undefined,
        targetTagId: t.target_tag_id || undefined,
        selectionMode: t.selection_mode,
        selectedItemIds: new Set(t.items.map((i) => i.id)),
      }))
    )
    setDialogOpen(true)
  }

  const addTarget = () => {
    if (targets.length >= 3) return
    setTargets([...targets, { targetType: 'category', selectionMode: 'handpick', selectedItemIds: new Set() }])
  }

  const removeTarget = (index: number) => {
    setTargets(targets.filter((_, i) => i !== index))
  }

  const updateTarget = (index: number, updates: Partial<TargetDraft>) => {
    setTargets(targets.map((t, i) => i === index ? { ...t, ...updates } : t))
  }

  const openPicker = (index: number) => {
    setPickerTargetIndex(index)
    setPickerOpen(true)
  }

  const getItemsForTarget = (target: TargetDraft): MenuItem[] => {
    if (target.targetType === 'category' && target.targetCategoryId) {
      return menuItems.filter((i) => i.category_id === target.targetCategoryId)
    }
    return []
  }

  const getTargetLabel = (target: TargetDraft): string => {
    if (target.targetType === 'category' && target.targetCategoryId) {
      return categories.find((c) => c.id === target.targetCategoryId)?.name || 'Unknown'
    }
    if (target.targetType === 'tag' && target.targetTagId) {
      const tag = tags.find((t) => t.id === target.targetTagId)
      return tag ? `${tag.group_name}: ${tag.tag_value}` : 'Unknown'
    }
    return 'Select...'
  }

  const handleSave = () => {
    if (!name.trim()) { toast.error('Rule name is required'); return }
    if (sourceType === 'category' && !sourceCategoryId) { toast.error('Select a source category'); return }
    if (sourceType === 'tag' && !sourceTagId) { toast.error('Select a source tag'); return }
    if (targets.length === 0) { toast.error('Add at least one target category'); return }

    const input = {
      name,
      sourceType,
      sourceCategoryId: sourceType === 'category' ? sourceCategoryId : undefined,
      sourceTagId: sourceType === 'tag' ? sourceTagId : undefined,
      maxSuggestions,
      targets: targets.map((t) => ({
        targetType: t.targetType,
        targetCategoryId: t.targetType === 'category' ? t.targetCategoryId : undefined,
        targetTagId: t.targetType === 'tag' ? t.targetTagId : undefined,
        selectionMode: t.selectionMode,
        itemIds: t.selectionMode === 'handpick' ? Array.from(t.selectedItemIds) : undefined,
      })),
    }

    startTransition(async () => {
      const result = editingRule
        ? await updatePairingRuleAction(editingRule.id, tenantId, tenantSlug, input)
        : await createPairingRuleAction(tenantId, tenantSlug, input)

      if (result.success) {
        toast.success(editingRule ? 'Rule updated' : 'Rule created')
        setDialogOpen(false)
        resetForm()
        loadData()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleToggle = (ruleId: string, isActive: boolean) => {
    startTransition(async () => {
      const result = await togglePairingRuleAction(ruleId, tenantSlug, isActive)
      if (result.success) loadData()
      else toast.error(result.error)
    })
  }

  const handleDelete = (ruleId: string) => {
    startTransition(async () => {
      const result = await deletePairingRuleAction(ruleId, tenantId, tenantSlug)
      if (result.success) {
        toast.success('Rule deleted')
        loadData()
      } else {
        toast.error(result.error)
      }
    })
  }

  const platformRules = rules.filter((r) => r.tenant_id === null)
  const tenantRules = rules.filter((r) => r.tenant_id !== null)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Pairing Rules</h3>
          <p className="text-xs text-muted-foreground">Automatic suggestions based on category and tags</p>
        </div>
        <Button size="sm" onClick={openAddDialog} disabled={isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
      </div>

      {/* Platform defaults */}
      {platformRules.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Platform Defaults</span>
          {platformRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              isPlatform
              onToggle={(active) => handleToggle(rule.id, active)}
              categories={categories}
              tags={tags}
              menuItems={menuItems}
            />
          ))}
        </div>
      )}

      {/* Tenant rules */}
      {tenantRules.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Your Rules</span>
          {tenantRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              isPlatform={false}
              onToggle={(active) => handleToggle(rule.id, active)}
              onEdit={() => openEditDialog(rule)}
              onDelete={() => handleDelete(rule.id)}
              categories={categories}
              tags={tags}
              menuItems={menuItems}
            />
          ))}
        </div>
      )}

      {rules.length === 0 && !isPending && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No pairing rules yet. Add one to automatically suggest items when customers shop.
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Rules are checked in order: Manual Pairs → Category Rules → Tag Rules → Smart BCG
      </p>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Add Rule'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rule Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drinks with Chicken" />
            </div>

            {/* Source */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">When customer adds item from...</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={sourceType === 'category' ? 'default' : 'outline'}
                  onClick={() => setSourceType('category')}
                >
                  Category
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sourceType === 'tag' ? 'default' : 'outline'}
                  onClick={() => setSourceType('tag')}
                >
                  Tag
                </Button>
              </div>
              {sourceType === 'category' ? (
                <Select value={sourceCategoryId} onValueChange={setSourceCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={sourceTagId} onValueChange={setSourceTagId}>
                  <SelectTrigger><SelectValue placeholder="Select tag..." /></SelectTrigger>
                  <SelectContent>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.group_name}: {t.tag_value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Arrow */}
            <div className="text-center text-muted-foreground text-sm">↓ suggest items from</div>

            {/* Targets */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Target Categories (1-3)</Label>
              {targets.map((target, index) => (
                <div key={index} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeTarget(index)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={target.targetType === 'category' ? 'default' : 'outline'}
                      onClick={() => updateTarget(index, { targetType: 'category', targetTagId: undefined })}
                    >
                      Category
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={target.targetType === 'tag' ? 'default' : 'outline'}
                      onClick={() => updateTarget(index, { targetType: 'tag', targetCategoryId: undefined })}
                    >
                      Tag
                    </Button>
                  </div>

                  {target.targetType === 'category' ? (
                    <Select
                      value={target.targetCategoryId || ''}
                      onValueChange={(v) => updateTarget(index, { targetCategoryId: v, selectedItemIds: new Set() })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={target.targetTagId || ''}
                      onValueChange={(v) => updateTarget(index, { targetTagId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select tag..." /></SelectTrigger>
                      <SelectContent>
                        {tags.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.group_name}: {t.tag_value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Selection mode */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={target.selectionMode === 'handpick' ? 'default' : 'outline'}
                      onClick={() => updateTarget(index, { selectionMode: 'handpick' })}
                      className="flex-1 text-xs"
                    >
                      Handpick Items
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={target.selectionMode === 'any' ? 'default' : 'outline'}
                      onClick={() => updateTarget(index, { selectionMode: 'any' })}
                      className="flex-1 text-xs"
                    >
                      Any from Category
                    </Button>
                  </div>

                  {/* Handpicked items */}
                  {target.selectionMode === 'handpick' && target.targetType === 'category' && target.targetCategoryId && (
                    <div>
                      {target.selectedItemIds.size > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {Array.from(target.selectedItemIds).map((id) => {
                            const item = menuItems.find((i) => i.id === id)
                            return item ? (
                              <Badge key={id} variant="secondary" className="text-[10px]">
                                {item.name}
                              </Badge>
                            ) : null
                          })}
                        </div>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={() => openPicker(index)} className="w-full text-xs">
                        {target.selectedItemIds.size > 0
                          ? `Change items (${target.selectedItemIds.size} selected)`
                          : 'Pick items...'
                        }
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {targets.length < 3 && (
                <button
                  type="button"
                  onClick={addTarget}
                  className="w-full border border-dashed rounded-lg p-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  + Add Category (optional, max 3)
                </button>
              )}
            </div>

            {/* Max suggestions */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Max suggestions shown</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={maxSuggestions}
                onChange={(e) => setMaxSuggestions(Number(e.target.value))}
                className="w-24"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end border-t pt-4">
              <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false) }}>Cancel</Button>
              <Button onClick={handleSave} disabled={isPending}>
                {editingRule ? 'Save Changes' : 'Save Rule'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Picker */}
      {pickerTargetIndex >= 0 && pickerTargetIndex < targets.length && (
        <RuleItemPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          categoryName={getTargetLabel(targets[pickerTargetIndex])}
          items={getItemsForTarget(targets[pickerTargetIndex])}
          selectedIds={targets[pickerTargetIndex].selectedItemIds}
          onSelectionChange={(ids) => updateTarget(pickerTargetIndex, { selectedItemIds: ids })}
        />
      )}
    </div>
  )
}

// ============================================================
// RuleRow — single rule in the list
// ============================================================

function RuleRow({
  rule,
  isPlatform,
  onToggle,
  onEdit,
  onDelete,
  categories,
  tags,
}: {
  rule: PairingRuleWithDetails
  isPlatform: boolean
  onToggle: (active: boolean) => void
  onEdit?: () => void
  onDelete?: () => void
  categories: Category[]
  tags: TagDefinition[]
  menuItems: MenuItem[]
}) {
  const sourceLabel = rule.source_type === 'category'
    ? categories.find((c) => c.id === rule.source_category_id)?.name || 'Unknown'
    : tags.find((t) => t.id === rule.source_tag_id)
      ? `${tags.find((t) => t.id === rule.source_tag_id)!.tag_value}`
      : 'Unknown'

  const totalItems = rule.targets.reduce((sum, t) => sum + t.items.length, 0)

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2 h-2 rounded-full',
            rule.is_active ? 'bg-green-500' : 'bg-amber-500'
          )} />
          <span className="text-sm font-medium">{rule.name}</span>
          {isPlatform && (
            <Badge variant="outline" className="text-[10px] bg-indigo-950/40 text-indigo-400 border-indigo-800">
              PLATFORM
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {totalItems > 0 ? `${totalItems} items · ` : ''}Max {rule.max_suggestions}
          </span>
          {isPlatform ? (
            <Switch
              checked={rule.is_active}
              onCheckedChange={onToggle}
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-3 w-3 mr-2" /> Edit
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-3 w-3 mr-2" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Source → Targets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge
          variant="outline"
          className={cn(
            'text-[11px]',
            rule.source_type === 'category'
              ? 'bg-blue-950/40 text-blue-400 border-blue-800'
              : 'bg-red-950/40 text-red-400 border-red-800'
          )}
        >
          {rule.source_type === 'category' ? 'Category' : 'Tag'}: {sourceLabel}
        </Badge>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        {rule.targets.map((target) => {
          const targetLabel = target.target_type === 'category'
            ? target.target_category?.name || 'Unknown'
            : target.target_tag?.tag_value || 'Unknown'

          return (
            <Badge
              key={target.id}
              variant="outline"
              className="text-[11px] bg-green-950/40 text-green-400 border-green-800"
            >
              {targetLabel}
              {target.selection_mode === 'handpick' && target.items.length > 0
                ? ` (${target.items.length} picked)`
                : target.selection_mode === 'any' ? ' (any)' : ''
              }
            </Badge>
          )
        })}
      </div>

      {/* Item names preview */}
      {totalItems > 0 && (
        <div className="flex flex-wrap gap-1">
          {rule.targets.flatMap((t) => t.items).slice(0, 6).map((item) => (
            <span key={item.id} className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              {item.name}
            </span>
          ))}
          {totalItems > 6 && (
            <span className="text-[10px] text-muted-foreground">+{totalItems - 6} more</span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add tab to boost sales dashboard**

In `src/components/admin/boost-sales-dashboard.tsx`:

Add the lazy-loaded import after the existing ones (around line 36):

```typescript
const PairingRulesTab = dynamic(
  () => import('@/components/admin/pairing-rules-tab').then(mod => ({ default: mod.PairingRulesTab })),
  { ssr: false, loading: LoadingPlaceholder }
)
```

Add `pairingRulesEnabled` to the `BoostSalesDashboardProps` interface:

```typescript
  pairingRulesEnabled: boolean
```

Add it to the destructured props in the function signature.

Add a new `TabsTrigger` in the `TabsList` (after "Pair Suggestions"):

```tsx
{pairingRulesEnabled && (
  <TabsTrigger value="rules">Pairing Rules</TabsTrigger>
)}
```

Add the corresponding `TabsContent` (after the pairs TabsContent):

```tsx
{pairingRulesEnabled && (
  <TabsContent value="rules">
    <PairingRulesTab
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      categories={_categories}
      menuItems={menuItems}
    />
  </TabsContent>
)}
```

Note: `_categories` was previously prefixed with underscore — remove the underscore alias since it's now used:
change `categories: _categories,` to `categories,` in the destructured props.

- [ ] **Step 3: Pass `pairingRulesEnabled` from the page**

In `src/app/[tenant]/admin/boost-sales/page.tsx`, the tenant object is already fetched. Pass the new prop:

```typescript
pairingRulesEnabled={tenant.pairing_rules_enabled ?? false}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/pairing-rules-tab.tsx src/components/admin/boost-sales-dashboard.tsx src/app/[tenant]/admin/boost-sales/page.tsx
git commit -m "feat: add Pairing Rules tab to Boost Sales dashboard

Category and tag-based rule builder with handpicked item selection,
platform defaults with toggle, and priority cascade display."
```

---

### Task 10: Superadmin Tag Presets Management

**Files:**
- Create: `src/components/superadmin/tag-presets.tsx`
- Modify: Superadmin settings page to include the tag presets component

- [ ] **Step 1: Create tag presets manager**

```typescript
'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Tag } from 'lucide-react'
import { toast } from 'sonner'
import type { TagDefinition } from '@/types/database'
import { getPresetTagsAction, createPresetTagAction, deletePresetTagAction } from '@/app/actions/tags'

export function TagPresetsManager() {
  const [tags, setTags] = useState<TagDefinition[]>([])
  const [isPending, startTransition] = useTransition()
  const [newGroup, setNewGroup] = useState('')
  const [newValue, setNewValue] = useState('')

  const grouped = useMemo(() => {
    const map = new Map<string, TagDefinition[]>()
    for (const tag of tags) {
      const group = map.get(tag.group_name) || []
      group.push(tag)
      map.set(tag.group_name, group)
    }
    return map
  }, [tags])

  useEffect(() => {
    startTransition(async () => {
      const result = await getPresetTagsAction()
      if (result.success) setTags(result.data)
    })
  }, [])

  const handleAdd = () => {
    if (!newGroup.trim() || !newValue.trim()) return
    startTransition(async () => {
      const result = await createPresetTagAction(newGroup.trim(), newValue.trim())
      if (result.success) {
        setTags((prev) => [...prev, result.data])
        setNewValue('')
        toast.success('Preset tag added')
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deletePresetTagAction(id)
      if (result.success) {
        setTags((prev) => prev.filter((t) => t.id !== id))
        toast.success('Tag deleted')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Platform Tag Presets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from(grouped.entries()).map(([groupName, groupTags]) => (
          <div key={groupName} className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{groupName}</span>
            <div className="flex flex-wrap gap-1.5">
              {groupTags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="gap-1">
                  {tag.tag_value}
                  <button
                    onClick={() => handleDelete(tag.id)}
                    className="ml-1 hover:text-destructive"
                    disabled={isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        ))}

        <div className="flex gap-2 items-end border-t pt-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Group</Label>
            <Input
              className="h-8 text-sm"
              placeholder="e.g. Flavor Profile"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Value</Label>
            <Input
              className="h-8 text-sm"
              placeholder="e.g. bitter"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
          <Button size="sm" className="h-8" onClick={handleAdd} disabled={isPending || !newGroup.trim() || !newValue.trim()}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Add to superadmin settings page**

Find the superadmin settings page and import + render `<TagPresetsManager />` in an appropriate section. The exact file path needs to be confirmed at implementation time — look in `src/app/superadmin/settings/page.tsx` or the component it renders.

```typescript
import { TagPresetsManager } from '@/components/superadmin/tag-presets'
```

Add `<TagPresetsManager />` in the settings layout.

- [ ] **Step 3: Commit**

```bash
git add src/components/superadmin/tag-presets.tsx
git commit -m "feat: add superadmin tag presets management"
```

---

### Task 11: Add `pairing_rules_enabled` to Tenant Admin

**Files:**
- Modify: Superadmin tenant edit form (wherever feature flags are toggled)
- Modify: `src/lib/product-detail-data.ts` (if it uses partial SELECT — add new column)

- [ ] **Step 1: Add toggle to superadmin tenant settings**

Find the superadmin tenant form that manages feature flags (look for `menu_engineering_enabled`, `bundles_enabled` toggles). Add a new toggle for `pairing_rules_enabled` following the same pattern.

- [ ] **Step 2: Update partial SELECT if needed**

Check `src/lib/product-detail-data.ts` — per MEMORY.md, `getCachedTenantBySlug` uses a partial SELECT. Add `pairing_rules_enabled` to both the SELECT string and the `SelectedTenant` interface.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add pairing_rules_enabled toggle to superadmin and tenant queries"
```

---

### Task 12: Lint Check and Final Verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: No new errors from the added files. Fix any issues.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds. Fix any TypeScript errors.

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve lint and build errors from pairing rules feature"
```
