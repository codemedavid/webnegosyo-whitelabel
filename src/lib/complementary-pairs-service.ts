import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedOrFetch, invalidateCache, generateCacheKey, CACHE_TTL } from '@/lib/redis-cache'
import type { MenuItem, ComplementaryPairWithDetails } from '@/types/database'
import { resolveRuleBasedSuggestions } from '@/lib/pairing-rules-service'

/**
 * Get complementary items for a menu item.
 * Resolution: item-level pairs override category-level pairs, max 4 items.
 * Results are cached in Redis for 5 min (keyed by tenant+item+category).
 */
export async function getComplementaryItems(
  itemId: string,
  categoryId: string,
  tenantId: string,
  options?: { pairingRulesEnabled?: boolean; cartItemIds?: string[] }
): Promise<MenuItem[]> {
  // When cart-aware filtering is active, skip Redis (results vary per cart state)
  if (options?.cartItemIds && options.cartItemIds.length > 0) {
    return fetchComplementaryItems(itemId, categoryId, tenantId, options)
  }

  const cacheKey = generateCacheKey(
    'complementary',
    `${tenantId}:${itemId}:${categoryId}:rules=${!!options?.pairingRulesEnabled}`
  )

  return getCachedOrFetch(
    cacheKey,
    () => fetchComplementaryItems(itemId, categoryId, tenantId, options),
    CACHE_TTL.UPSELL_PAIRS
  )
}

async function fetchComplementaryItems(
  itemId: string,
  categoryId: string,
  tenantId: string,
  options?: { pairingRulesEnabled?: boolean; cartItemIds?: string[] }
): Promise<MenuItem[]> {
  const supabase = createAdminClient()

  // Tier 1: Manual item-level pairs (always highest priority)
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

  // Tier 2 & 3: Pairing rules (when enabled, override old category-level manual pairs)
  if (options?.pairingRulesEnabled) {
    const ruleItems = await resolveRuleBasedSuggestions(
      itemId,
      categoryId,
      tenantId,
      options.cartItemIds
    )
    if (ruleItems.length > 0) return ruleItems
  }

  // Tier 4: Fall back to category-level manual pairs
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

  return []
}

/**
 * Invalidate complementary pairs cache for a tenant.
 * Call after any pair create/delete/update.
 */
export async function invalidateComplementaryPairsCache(tenantId: string): Promise<void> {
  await invalidateCache(`complementary:${tenantId}:*`)
}

/**
 * Get all complementary pairs for a tenant (admin list).
 */
export async function getComplementaryPairsByTenant(
  tenantId: string
): Promise<ComplementaryPairWithDetails[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('complementary_pairs')
    .select(`
      *,
      target_item:menu_items!target_item_id(id, name, price, discounted_price, image_url, is_available),
      source_item:menu_items!source_item_id(id, name, image_url),
      source_category:categories!source_category_id(id, name)
    `)
    .eq('tenant_id', tenantId)
    .order('source_type', { ascending: true })
    .order('display_order', { ascending: true })

  if (error) {
    console.error('Error fetching complementary pairs:', error)
    return []
  }

  return (data || []) as unknown as ComplementaryPairWithDetails[]
}

/**
 * Create complementary pairs (bulk — one source to multiple targets).
 */
export async function createComplementaryPairs(
  tenantId: string,
  sourceType: 'item' | 'category',
  sourceId: string,
  targetItemIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  const rows = targetItemIds.map((targetId, index) => ({
    tenant_id: tenantId,
    source_type: sourceType,
    source_item_id: sourceType === 'item' ? sourceId : null,
    source_category_id: sourceType === 'category' ? sourceId : null,
    target_item_id: targetId,
    display_order: index,
    is_active: true,
  }))

  const { error } = await supabase.from('complementary_pairs').insert(rows)

  if (error) {
    console.error('Error creating complementary pairs:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Delete a complementary pair.
 */
export async function deleteComplementaryPair(
  id: string,
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('complementary_pairs')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Error deleting complementary pair:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Delete all complementary pairs for a source (used when re-setting pairs).
 */
export async function deleteComplementaryPairsForSource(
  tenantId: string,
  sourceType: 'item' | 'category',
  sourceId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  let query = supabase
    .from('complementary_pairs')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('source_type', sourceType)

  if (sourceType === 'item') {
    query = query.eq('source_item_id', sourceId)
  } else {
    query = query.eq('source_category_id', sourceId)
  }

  const { error } = await query

  if (error) {
    console.error('Error deleting complementary pairs for source:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}
