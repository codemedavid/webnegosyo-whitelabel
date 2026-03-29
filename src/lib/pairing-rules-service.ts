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
    itemIds?: string[]
  }[]
}

export async function getPairingRules(
  tenantId: string
): Promise<PairingRuleWithDetails[]> {
  const supabase = createAdminClient()

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

  const targetItemsMap: Record<string, MenuItem[]> = {}
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

export async function createPairingRule(
  tenantId: string | null,
  input: CreateRuleInput
): Promise<PairingRule> {
  const supabase = createAdminClient()

  if (input.targets.length === 0 || input.targets.length > 3) {
    throw new Error('Rules must have 1-3 target categories')
  }

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

export async function updatePairingRule(
  ruleId: string,
  tenantId: string | null,
  input: CreateRuleInput
): Promise<void> {
  const supabase = createAdminClient()

  if (input.targets.length === 0 || input.targets.length > 3) {
    throw new Error('Rules must have 1-3 target categories')
  }

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

  const { error: deleteError } = await supabase
    .from('pairing_rule_targets')
    .delete()
    .eq('rule_id', ruleId)

  if (deleteError) throw deleteError

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

export async function resolveRuleBasedSuggestions(
  itemId: string,
  categoryId: string,
  tenantId: string,
  cartItemIds: string[] = []
): Promise<MenuItem[]> {
  const supabase = createAdminClient()

  const { data: tagRows } = await supabase
    .from('menu_item_tags')
    .select('tag_definition_id')
    .eq('menu_item_id', itemId)
    .eq('tenant_id', tenantId)

  const tagIds = (tagRows || []).map((r: { tag_definition_id: string }) => r.tag_definition_id)

  const excludeIds = new Set([itemId, ...cartItemIds])

  // Tier 2: Category pairing rules
  const categoryItems = await resolveRulesBySource(
    supabase,
    tenantId,
    'category',
    categoryId,
    excludeIds
  )
  if (categoryItems.length > 0) return categoryItems

  // Tier 3: Tag pairing rules
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

  const { data: rules } = await supabase
    .from('pairing_rules')
    .select('id, tenant_id, max_suggestions')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq('source_type', sourceType)
    .eq(sourceColumn, sourceId)
    .eq('is_active', true)
    .order('tenant_id', { ascending: false, nullsFirst: false })

  if (!rules || rules.length === 0) return []

  const rule = rules[0] as { id: string; tenant_id: string | null; max_suggestions: number }

  return resolveRuleTargets(supabase, rule.id, rule.max_suggestions, excludeIds)
}

async function resolveRulesBySourceTags(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  tagIds: string[],
  excludeIds: Set<string>
): Promise<MenuItem[]> {
  const { data: rules } = await supabase
    .from('pairing_rules')
    .select('id, tenant_id, max_suggestions, source_tag_id')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq('source_type', 'tag')
    .in('source_tag_id', tagIds)
    .eq('is_active', true)
    .order('tenant_id', { ascending: false, nullsFirst: false })

  if (!rules || rules.length === 0) return []

  const rule = rules[0] as { id: string; max_suggestions: number }

  return resolveRuleTargets(supabase, rule.id, rule.max_suggestions, excludeIds)
}

async function resolveRuleTargets(
  supabase: ReturnType<typeof createAdminClient>,
  ruleId: string,
  maxSuggestions: number,
  excludeIds: Set<string>
): Promise<MenuItem[]> {
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
      const { data: pickedRows } = await supabase
        .from('pairing_rule_target_items')
        .select('menu_item:menu_items!menu_item_id(id, name, description, price, discounted_price, image_url, is_available, category_id, variations, addons, variation_types, bcg_classification, badge_text, order, created_at, updated_at)')
        .eq('target_id', t.id)
        .order('display_order', { ascending: true })

      items = (pickedRows || [])
        .map((r: Record<string, unknown>) => r.menu_item as MenuItem)
        .filter((item: MenuItem) => item && item.is_available)
    } else {
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

    for (const item of items) {
      if (!excludeIds.has(item.id) && allItems.length < maxSuggestions) {
        allItems.push(item)
        excludeIds.add(item.id)
      }
    }

    if (allItems.length >= maxSuggestions) break
  }

  return allItems
}
