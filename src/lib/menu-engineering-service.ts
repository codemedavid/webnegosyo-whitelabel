/**
 * Service layer for menu engineering features
 * BCG classification, upsell pairs, badge management
 * Uses server-side Supabase client with RLS policies
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantAdmin } from '@/lib/admin-service'
import type { BcgClassification, MenuItem, UpsellPair, UpsellPairWithItems } from '@/types/database'
import { z } from 'zod'

// ============================================
// Schemas
// ============================================

const bcgClassificationSchema = z.enum(['star', 'plowhorse', 'puzzle', 'dog', 'unclassified'])

const upsellPairInputSchema = z.object({
  source_item_id: z.string().uuid(),
  target_item_id: z.string().uuid(),
  pair_type: z.enum(['complementary', 'upgrade']),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  source_label: z.string().max(50).optional(),
  target_label: z.string().max(50).optional(),
  upgrade_header: z.string().max(100).optional(),
})

export type UpsellPairInput = z.input<typeof upsellPairInputSchema>

const checkoutUpsellSettingsSchema = z.object({
  checkout_upsell_enabled: z.boolean(),
  checkout_upsell_title: z.string().min(1).max(100),
  checkout_upsell_subtitle: z.string().max(200).optional(),
  checkout_upsell_max_items: z.number().int().min(1).max(8),
})

export type CheckoutUpsellSettingsInput = z.input<typeof checkoutUpsellSettingsSchema>

// ============================================
// BCG Classification
// ============================================

export async function updateBcgClassification(
  itemId: string,
  tenantId: string,
  classification: BcgClassification
) {
  await verifyTenantAdmin(tenantId)
  bcgClassificationSchema.parse(classification)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('menu_items')
    .update({ bcg_classification: classification } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select('id, bcg_classification')
    .single()

  if (error) throw error
  return data
}

export async function bulkUpdateBcgClassification(
  tenantId: string,
  updates: { itemId: string; classification: BcgClassification }[]
) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()
  const results = await Promise.all(
    updates.map(({ itemId, classification }) => {
      bcgClassificationSchema.parse(classification)
      return supabase
        .from('menu_items')
        .update({ bcg_classification: classification } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .eq('id', itemId)
        .eq('tenant_id', tenantId)
        .select('id, bcg_classification')
        .single()
    })
  )

  const errors = results.filter((r) => r.error)
  if (errors.length > 0) {
    throw new Error(`Failed to update ${errors.length} items`)
  }

  return results.map((r) => r.data)
}

// ============================================
// Badge Text
// ============================================

export async function updateBadgeText(
  itemId: string,
  tenantId: string,
  badgeText: string | null
) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('menu_items')
    .update({ badge_text: badgeText } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select('id, badge_text')
    .single()

  if (error) throw error
  return data
}

// ============================================
// Query by Classification
// ============================================

export async function getMenuItemsByBcgClassification(
  tenantId: string,
  classification?: BcgClassification
) {
  const supabase = await createClient()

  let query = supabase
    .from('menu_items')
    .select('*, category:categories(id, name)')
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })

  if (classification) {
    query = query.eq('bcg_classification', classification)
  }

  const { data, error } = await query
  if (error) throw error
  return data as unknown as (MenuItem & { category: { id: string; name: string } | null })[]
}

// ============================================
// Upsell Pairs
// ============================================

export async function createUpsellPair(tenantId: string, input: UpsellPairInput) {
  await verifyTenantAdmin(tenantId)
  const validated = upsellPairInputSchema.parse(input)

  if (validated.source_item_id === validated.target_item_id) {
    throw new Error('Source and target items must be different')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('upsell_pairs')
    .insert({
      tenant_id: tenantId,
      ...validated,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('This upsell pair already exists')
    }
    throw error
  }
  return data as unknown as UpsellPair
}

export async function deleteUpsellPair(pairId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()
  const { error } = await supabase
    .from('upsell_pairs')
    .delete()
    .eq('id', pairId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

export async function getUpsellPairsByTenant(tenantId: string): Promise<UpsellPairWithItems[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('upsell_pairs')
    .select(`
      *,
      source_item:menu_items!upsell_pairs_source_item_id_fkey(id, name, price, image_url),
      target_item:menu_items!upsell_pairs_target_item_id_fkey(id, name, price, image_url)
    `)
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data as unknown as UpsellPairWithItems[]
}

export async function getUpsellsForItem(
  itemId: string,
  tenantId: string,
  pairType?: 'complementary' | 'upgrade'
) {
  const supabase = await createClient()

  let query = supabase
    .from('upsell_pairs')
    .select(`
      *,
      target_item:menu_items!upsell_pairs_target_item_id_fkey(
        id, tenant_id, category_id, name, description, price, discounted_price,
        image_url, is_available, is_featured, variations, variation_types, addons
      )
    `)
    .eq('source_item_id', itemId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (pairType) {
    query = query.eq('pair_type', pairType)
  }

  const { data, error } = await query
  if (error) throw error

  // Filter out unavailable target items and extract the MenuItem
  return (data || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((pair: any) => pair.target_item?.is_available === true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((pair: any) => ({
      ...pair.target_item,
      variations: pair.target_item.variations || [],
      variation_types: pair.target_item.variation_types || [],
      addons: pair.target_item.addons || [],
    })) as MenuItem[]
}

// ============================================
// Cart / Checkout Upsells
// ============================================

export async function getUpsellsForCart(
  cartItemIds: string[],
  tenantId: string
): Promise<MenuItem[]> {
  if (cartItemIds.length === 0) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('upsell_pairs')
    .select(`
      target_item_id,
      target_item:menu_items!upsell_pairs_target_item_id_fkey(
        id, tenant_id, category_id, name, description, price, discounted_price,
        image_url, is_available, is_featured, variations, variation_types, addons
      )
    `)
    .in('source_item_id', cartItemIds)
    .eq('tenant_id', tenantId)
    .eq('pair_type', 'complementary')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error

  // Deduplicate by target_item_id, filter unavailable, exclude items already in cart
  const seen = new Set<string>(cartItemIds)
  const items: MenuItem[] = []

  for (const pair of data || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (pair as any).target_item
    if (!target || target.is_available !== true || seen.has(target.id)) continue
    seen.add(target.id)
    items.push({
      ...target,
      variations: target.variations || [],
      variation_types: target.variation_types || [],
      addons: target.addons || [],
    } as MenuItem)
  }

  return items
}

export async function getStarItems(tenantId: string, limit: number = 4): Promise<MenuItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, tenant_id, category_id, name, description, price, discounted_price, image_url, is_available, is_featured, show_in_checkout_upsell, variations, variation_types, addons')
    .eq('tenant_id', tenantId)
    .eq('bcg_classification', 'star')
    .eq('is_available', true)
    .limit(limit)

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((item: any) => ({
    ...item,
    variations: item.variations || [],
    variation_types: item.variation_types || [],
    addons: item.addons || [],
  })) as MenuItem[]
}

/** Items manually marked by admin to appear in the checkout upsell */
export async function getManualUpsellItems(tenantId: string, limit: number = 8): Promise<MenuItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, tenant_id, category_id, name, description, price, discounted_price, image_url, is_available, is_featured, show_in_checkout_upsell, variations, variation_types, addons')
    .eq('tenant_id', tenantId)
    .eq('show_in_checkout_upsell', true)
    .eq('is_available', true)
    .limit(limit)

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((item: any) => ({
    ...item,
    variations: item.variations || [],
    variation_types: item.variation_types || [],
    addons: item.addons || [],
  })) as MenuItem[]
}


// ============================================
// Smart Upgrade Suggestions
// ============================================

/**
 * Get smart upgrade suggestions for an item:
 * 1. Bundles containing this item
 * 2. Higher-priced items in the same category
 * Returns ranked by potential AOV lift.
 */
export async function getSmartUpgradeSuggestions(
  itemId: string,
  tenantId: string
): Promise<{ bundles: Array<{ id: string; name: string; slots: unknown[]; pricing_type: string; fixed_price?: number; discount_percent?: number; image_url: string; description?: string }>; categoryUpgrades: MenuItem[] }> {
  const supabase = createAdminClient()

  // Get the source item to know its category and price
  const { data: sourceItem } = await supabase
    .from('menu_items')
    .select('id, category_id, price, name')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .single()

  if (!sourceItem) return { bundles: [], categoryUpgrades: [] }

  // 1. Find bundles containing this item's category via bundle_slots
  const { data: bundleSlots } = await supabase
    .from('bundle_slots')
    .select('bundle_id')
    .eq('category_id', sourceItem.category_id!)

  let bundles: Array<{ id: string; name: string; slots: unknown[]; pricing_type: string; fixed_price?: number; discount_percent?: number; image_url: string; description?: string }> = []
  if (bundleSlots && bundleSlots.length > 0) {
    const bundleIds = [...new Set(bundleSlots.map((bs: { bundle_id: string }) => bs.bundle_id))]
    const { data: bundleData } = await supabase
      .from('bundles')
      .select('*, slots:bundle_slots(*, category:categories(id, name, icon, icon_color), price_overrides:bundle_slot_price_overrides(*))')
      .in('id', bundleIds)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    bundles = (bundleData || []) as typeof bundles
  }

  // 2. Higher-priced items in the same category
  const { data: categoryUpgrades } = await supabase
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('category_id', sourceItem.category_id!)
    .eq('is_available', true)
    .gt('price', sourceItem.price!)
    .neq('id', itemId)
    .order('price', { ascending: true })
    .limit(5)

  return {
    bundles,
    categoryUpgrades: (categoryUpgrades || []) as unknown as MenuItem[],
  }
}

// ============================================
// BCG-Based Smart Pair Suggestions
// ============================================

export interface PairSuggestion {
  sourceItem: MenuItem
  targetItem: MenuItem
  strategy: string
  reason: string
}

/**
 * Generate smart pair suggestions based on BCG classification:
 * - Plowhorses → Stars/Puzzles (boost margin)
 * - Stars → Stars (maximize AOV)
 * - Puzzles → Plowhorses (drive discovery)
 */
export async function generateSmartPairSuggestions(
  tenantId: string
): Promise<PairSuggestion[]> {
  const supabase = createAdminClient()

  const { data: items } = await supabase
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .neq('bcg_classification', 'unclassified')
    .not('bcg_classification', 'is', null)

  if (!items || items.length < 2) return []

  const byClass: Record<string, MenuItem[]> = { star: [], plowhorse: [], puzzle: [], dog: [] }
  for (const item of items as unknown as MenuItem[]) {
    const cls = item.bcg_classification || 'unclassified'
    if (byClass[cls]) byClass[cls].push(item)
  }

  // Existing pairs to avoid dupes
  const { data: existingPairs } = await supabase
    .from('upsell_pairs')
    .select('source_item_id, target_item_id')
    .eq('tenant_id', tenantId)
    .eq('pair_type', 'complementary')

  const existingSet = new Set(
    (existingPairs || []).map((p: { source_item_id: string; target_item_id: string }) => `${p.source_item_id}:${p.target_item_id}`)
  )

  const suggestions: PairSuggestion[] = []

  // Plowhorses → Stars
  for (const plowhorse of byClass.plowhorse) {
    for (const star of byClass.star) {
      if (plowhorse.category_id === star.category_id) continue
      if (existingSet.has(`${plowhorse.id}:${star.id}`)) continue
      suggestions.push({
        sourceItem: plowhorse,
        targetItem: star,
        strategy: 'plowhorse_to_star',
        reason: `${plowhorse.name} is popular but low-margin. Pairing with ${star.name} (star) boosts order value.`,
      })
    }
  }

  // Stars → Stars
  for (let i = 0; i < byClass.star.length; i++) {
    for (let j = i + 1; j < byClass.star.length; j++) {
      const a = byClass.star[i], b = byClass.star[j]
      if (a.category_id === b.category_id) continue
      if (existingSet.has(`${a.id}:${b.id}`)) continue
      suggestions.push({
        sourceItem: a, targetItem: b,
        strategy: 'star_to_star',
        reason: `Both ${a.name} and ${b.name} are stars. Pairing maximizes AOV.`,
      })
    }
  }

  // Puzzles → Plowhorses
  for (const puzzle of byClass.puzzle) {
    for (const plowhorse of byClass.plowhorse) {
      if (puzzle.category_id === plowhorse.category_id) continue
      if (existingSet.has(`${puzzle.id}:${plowhorse.id}`)) continue
      suggestions.push({
        sourceItem: puzzle, targetItem: plowhorse,
        strategy: 'puzzle_to_plowhorse',
        reason: `${puzzle.name} is high-margin but low-popularity. Pairing with popular ${plowhorse.name} drives discovery.`,
      })
    }
  }

  return suggestions.slice(0, 50)
}

export async function acceptPairSuggestion(
  tenantId: string,
  sourceItemId: string,
  targetItemId: string,
  strategy: string
): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('upsell_pairs').insert({
    tenant_id: tenantId,
    source_item_id: sourceItemId,
    target_item_id: targetItemId,
    pair_type: 'complementary',
    is_auto_generated: true,
    bcg_strategy: strategy,
    is_active: true,
  })
}

export async function bulkAcceptPairSuggestions(
  tenantId: string,
  suggestions: Array<{ sourceItemId: string; targetItemId: string; strategy: string }>
): Promise<void> {
  const supabase = createAdminClient()
  const rows = suggestions.map(s => ({
    tenant_id: tenantId,
    source_item_id: s.sourceItemId,
    target_item_id: s.targetItemId,
    pair_type: 'complementary' as const,
    is_auto_generated: true,
    bcg_strategy: s.strategy,
    is_active: true,
  }))
  await supabase.from('upsell_pairs').upsert(rows, {
    onConflict: 'tenant_id,source_item_id,target_item_id,pair_type',
  })
}

// ============================================
// Ranked Upgrade Suggestions with AOV Scoring
// ============================================

export interface RankedUpgradeSuggestion {
  item: MenuItem
  type: 'bundle' | 'category_upgrade'
  aovLift: number
  bundleId?: string
  bundleName?: string
}

/**
 * Get ranked upgrade suggestions sorted by AOV lift potential.
 * Combines bundles and same-category upgrades, ranked by price difference.
 */
export async function getSmartUpgradeSuggestionsRanked(
  itemId: string,
  tenantId: string
): Promise<RankedUpgradeSuggestion[]> {
  const { bundles, categoryUpgrades } = await getSmartUpgradeSuggestions(itemId, tenantId)

  const supabase = createAdminClient()
  const { data: sourceItem } = await supabase
    .from('menu_items')
    .select('price, discounted_price')
    .eq('id', itemId)
    .single()

  const sourcePrice = sourceItem?.discounted_price || sourceItem?.price || 0

  const ranked: RankedUpgradeSuggestion[] = [
    ...bundles.map(b => {
      const itemsArr = (b.items || []) as Array<{ menu_item?: { price?: number } }>
      const totalItemPrice = itemsArr.reduce((s, bi) => s + (bi.menu_item?.price || 0), 0)
      const bundlePrice = b.pricing_type === 'fixed'
        ? (b.fixed_price || 0)
        : totalItemPrice * (1 - (b.discount_percent || 0) / 100)
      return {
        item: { id: b.id, name: b.name, price: bundlePrice, image_url: b.image_url } as unknown as MenuItem,
        type: 'bundle' as const,
        aovLift: bundlePrice - sourcePrice,
        bundleId: b.id,
        bundleName: b.name,
      }
    }),
    ...categoryUpgrades.map(item => ({
      item,
      type: 'category_upgrade' as const,
      aovLift: (item.discounted_price || item.price) - sourcePrice,
    })),
  ]

  return ranked
    .filter(r => r.aovLift > 0)
    .sort((a, b) => b.aovLift - a.aovLift)
}

// ============================================
// Checkout Upsell Settings
// ============================================

export async function updateCheckoutUpsellSettings(
  tenantId: string,
  input: CheckoutUpsellSettingsInput
) {
  await verifyTenantAdmin(tenantId)
  const validated = checkoutUpsellSettingsSchema.parse(input)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .update(validated as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .eq('id', tenantId)
    .select('id, checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items')
    .single()

  if (error) throw error
  return data
}

// ============================================
// Boost Sales — Coverage & Recommendations
// ============================================

/**
 * Returns menu items that are not part of any upsell flow:
 * - Not in any upsell_pairs (as source or target)
 * - Not in any bundle_slots (via included_item_ids)
 * - Not marked as show_in_checkout_upsell
 */
export async function getItemsNotInAnyUpsell(tenantId: string): Promise<MenuItem[]> {
  const supabase = createAdminClient()

  // Get all item IDs that appear in upsell_pairs
  const { data: upsellPairItems } = await supabase
    .from('upsell_pairs')
    .select('source_item_id, target_item_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  const upsellItemIds = new Set<string>()
  for (const pair of upsellPairItems || []) {
    upsellItemIds.add(pair.source_item_id)
    upsellItemIds.add(pair.target_item_id)
  }

  // Get all item IDs that appear in bundle slot included_item_ids
  const { data: bundleSlots } = await supabase
    .from('bundle_slots')
    .select('included_item_ids, bundle_id')
    .not('included_item_ids', 'is', null)

  for (const slot of bundleSlots || []) {
    if (slot.included_item_ids) {
      for (const id of slot.included_item_ids) {
        upsellItemIds.add(id)
      }
    }
  }

  // Get all menu items for this tenant that are NOT in any upsell
  const { data: allItems, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .eq('show_in_checkout_upsell', false)
    .order('name')

  if (error) throw error

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (allItems || [])
    .filter((item: any) => !upsellItemIds.has(item.id))
    .map((item: any) => ({
      ...item,
      variations: item.variations || [],
      variation_types: item.variation_types || [],
      addons: item.addons || [],
    })) as MenuItem[]
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Returns which upsell types an item appears in.
 * Used by the cross-reference indicator in Checkout Picks tab.
 */
export async function getUpsellCoverageForItem(
  itemId: string,
  tenantId: string
): Promise<{ pairCount: number; bundleCount: number; isCheckoutPick: boolean }> {
  const supabase = createAdminClient()

  // Count upsell pairs where this item is source or target
  const { count: pairCount } = await supabase
    .from('upsell_pairs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .or(`source_item_id.eq.${itemId},target_item_id.eq.${itemId}`)

  // Get item's category and checkout status
  const { data: item } = await supabase
    .from('menu_items')
    .select('category_id, show_in_checkout_upsell')
    .eq('id', itemId)
    .single()

  let bundleCount = 0
  if (item?.category_id) {
    const { count } = await supabase
      .from('bundle_slots')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', item.category_id)

    bundleCount = count ?? 0
  }

  return {
    pairCount: pairCount ?? 0,
    bundleCount,
    isCheckoutPick: item?.show_in_checkout_upsell ?? false,
  }
}

type RecommendedPlacement = 'upgrade' | 'complementary' | 'checkout_pick' | 'bundle'

/**
 * Analyzes an item and recommends the best upsell placement.
 */
export async function getRecommendedPlacement(
  itemId: string,
  tenantId: string
): Promise<{ placement: RecommendedPlacement; reason: string; suggestedTargets?: MenuItem[] }> {
  const supabase = createAdminClient()

  // Get the item with its category
  const { data: item } = await supabase
    .from('menu_items')
    .select('*, category:categories(id, name)')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .single()

  if (!item) throw new Error('Item not found')

  // Check if item's category is in any bundle slot
  const { count: bundleSlotCount } = await supabase
    .from('bundle_slots')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', item.category_id)

  // Get category average price
  const { data: categoryItems } = await supabase
    .from('menu_items')
    .select('price')
    .eq('tenant_id', tenantId)
    .eq('category_id', item.category_id)
    .eq('is_available', true)

  const categoryAvg = categoryItems && categoryItems.length > 0
    ? categoryItems.reduce((sum: number, i: { price: number }) => sum + i.price, 0) / categoryItems.length
    : item.price

  // Get higher-priced items in same category for upgrade suggestions
  const { data: higherItems } = await supabase
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('category_id', item.category_id)
    .eq('is_available', true)
    .gt('price', item.price)
    .order('price', { ascending: true })
    .limit(3)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suggestedTargets = (higherItems || []).map((i: any) => ({
    ...i,
    variations: i.variations || [],
    variation_types: i.variation_types || [],
    addons: i.addons || [],
  })) as MenuItem[]

  // Decision logic
  if ((bundleSlotCount ?? 0) > 0 && suggestedTargets.length > 0) {
    return {
      placement: 'upgrade',
      reason: 'This item has higher-priced alternatives in its category — great for "Upgrade to Meal" prompts',
      suggestedTargets,
    }
  }

  if (item.price < categoryAvg * 0.7) {
    return {
      placement: 'complementary',
      reason: 'This is a lower-priced item — works well as a "Goes well with" suggestion alongside mains',
    }
  }

  if ((bundleSlotCount ?? 0) > 0) {
    return {
      placement: 'bundle',
      reason: 'This item\'s category is already in a bundle — consider adding it to more combos',
    }
  }

  return {
    placement: 'checkout_pick',
    reason: 'This standalone item works well as a last-chance checkout suggestion',
  }
}
