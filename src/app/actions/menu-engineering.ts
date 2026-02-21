'use server'

import { revalidatePath } from 'next/cache'
import {
  updateBcgClassification,
  bulkUpdateBcgClassification,
  updateBadgeText,
  createUpsellPair,
  deleteUpsellPair,
  getUpsellPairsByTenant,
  getUpsellsForCart,
  getStarItems,
  getManualUpsellItems,
  updateCheckoutUpsellSettings,
  type UpsellPairInput,
  type CheckoutUpsellSettingsInput,
} from '@/lib/menu-engineering-service'
import { toggleMenuItemAvailability } from '@/lib/admin-service'
import type { BcgClassification } from '@/types/database'

// ============================================
// BCG Classification Actions
// ============================================

export async function updateBcgClassificationAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  classification: BcgClassification
) {
  try {
    const data = await updateBcgClassification(itemId, tenantId, classification)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update classification' }
  }
}

export async function bulkUpdateBcgAction(
  tenantId: string,
  tenantSlug: string,
  updates: { itemId: string; classification: BcgClassification }[]
) {
  try {
    const data = await bulkUpdateBcgClassification(tenantId, updates)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to bulk update classifications' }
  }
}

// ============================================
// Badge Text Action
// ============================================

export async function updateBadgeTextAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  badgeText: string | null
) {
  try {
    const data = await updateBadgeText(itemId, tenantId, badgeText)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update badge text' }
  }
}

// ============================================
// Promote / Hide Actions
// ============================================

export async function promoteItemAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  isFeatured: boolean
) {
  try {
    const supabase = (await import('@/lib/supabase/server')).createClient
    const client = await supabase()
    const { data, error } = await client
      .from('menu_items')
      // @ts-expect-error – Supabase generated types not available; update is typed as never
      .update({ is_featured: isFeatured })
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .select('id, is_featured')
      .single()

    if (error) throw error
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update featured status' }
  }
}

export async function hideItemAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  isAvailable: boolean
) {
  try {
    const data = await toggleMenuItemAvailability(itemId, tenantId, isAvailable)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle availability' }
  }
}

// ============================================
// Upsell Pair Actions
// ============================================

export async function createUpsellPairAction(
  tenantId: string,
  tenantSlug: string,
  input: UpsellPairInput
) {
  try {
    const data = await createUpsellPair(tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    // Revalidate product detail pages so ISR cache picks up new upsell pairs
    revalidatePath(`/${tenantSlug}/menu/item/${input.source_item_id}`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create upsell pair' }
  }
}

export async function deleteUpsellPairAction(
  pairId: string,
  tenantId: string,
  tenantSlug: string
) {
  try {
    await deleteUpsellPair(pairId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    // Revalidate product pages so removed upsell pairs don't show stale data
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete upsell pair' }
  }
}

export async function getUpsellPairsAction(tenantId: string) {
  try {
    const data = await getUpsellPairsByTenant(tenantId)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch upsell pairs' }
  }
}

// ============================================
// Checkout Upsell Actions
// ============================================

export async function getCheckoutUpsellsAction(
  cartItemIds: string[],
  tenantId: string,
  maxItems: number = 4
) {
  try {
    const seen = new Set<string>(cartItemIds)
    const items: Awaited<ReturnType<typeof getManualUpsellItems>> = []

    const addUnique = (newItems: typeof items) => {
      for (const item of newItems) {
        if (!seen.has(item.id) && items.length < maxItems) {
          seen.add(item.id)
          items.push(item)
        }
      }
    }

    // 1. Manually-selected items (highest priority — admin-curated)
    const manualItems = await getManualUpsellItems(tenantId, maxItems)
    addUnique(manualItems)

    // 2. Complementary upsell pairs for cart items
    if (items.length < maxItems) {
      const pairItems = await getUpsellsForCart(cartItemIds, tenantId)
      addUnique(pairItems)
    }

    // 3. Star items (BCG classification)
    if (items.length < maxItems) {
      const starItems = await getStarItems(tenantId, maxItems - items.length)
      addUnique(starItems)
    }

    // 4. Any available items as final fallback (so the modal always has something)
    if (items.length < maxItems) {
      const { data: anyItems } = await (async () => {
        const { createClient } = await import('@/lib/supabase/server')
        const supabase = await createClient()
        return supabase
          .from('menu_items')
          .select('id, tenant_id, category_id, name, description, price, discounted_price, image_url, is_available, is_featured, show_in_checkout_upsell, variations, variation_types, addons')
          .eq('tenant_id', tenantId)
          .eq('is_available', true)
          .order('is_featured', { ascending: false })
          .limit(maxItems * 3)
      })()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (anyItems || []).map((item: any) => ({
        ...item,
        variations: item.variations || [],
        variation_types: item.variation_types || [],
        addons: item.addons || [],
      }))
      addUnique(mapped)
    }

    return { success: true, data: items.slice(0, maxItems) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch checkout upsells' }
  }
}

export async function updateCheckoutUpsellSettingsAction(
  tenantId: string,
  tenantSlug: string,
  input: CheckoutUpsellSettingsInput
) {
  try {
    const data = await updateCheckoutUpsellSettings(tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update checkout upsell settings' }
  }
}
