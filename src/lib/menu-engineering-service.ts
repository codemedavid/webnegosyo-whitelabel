/**
 * Service layer for menu engineering features
 * BCG classification, upsell pairs, badge management
 * Uses server-side Supabase client with RLS policies
 */

import { createClient } from '@/lib/supabase/server'
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
    .update({ bcg_classification: classification } as Record<string, unknown>)
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
        .update({ bcg_classification: classification } as Record<string, unknown>)
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
    .update({ badge_text: badgeText } as Record<string, unknown>)
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
  return data as (MenuItem & { category: { id: string; name: string } | null })[]
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
    } as Record<string, unknown>)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('This upsell pair already exists')
    }
    throw error
  }
  return data as UpsellPair
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
    .update(validated as Record<string, unknown>)
    .eq('id', tenantId)
    .select('id, checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items')
    .single()

  if (error) throw error
  return data
}
