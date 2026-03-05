'use server'

import { revalidatePath } from 'next/cache'
import {
  updateBcgClassification,
  bulkUpdateBcgClassification,
  updateBadgeText,
  createUpsellPair,
  deleteUpsellPair,
  getUpsellPairsByTenant,
  getManualUpsellItems,
  getUpsellsForCart,
  getStarItems,
  updateCheckoutUpsellSettings,
  getSmartUpgradeSuggestions,
  generateSmartPairSuggestions,
  acceptPairSuggestion,
  bulkAcceptPairSuggestions,
  type UpsellPairInput,
  type CheckoutUpsellSettingsInput,
} from '@/lib/menu-engineering-service'
import { toggleMenuItemAvailability } from '@/lib/admin-service'
import type { BcgClassification, MenuItem } from '@/types/database'

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
    const { verifyTenantAdmin } = await import('@/lib/admin-service')
    await verifyTenantAdmin(tenantId)

    const supabase = (await import('@/lib/supabase/server')).createClient
    const client = await supabase()
    const { data, error } = await client
      .from('menu_items')
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
    const collectedItems: MenuItem[] = []
    const seenIds = new Set(cartItemIds)

    const addUnique = (items: MenuItem[]) => {
      for (const item of items) {
        if (!seenIds.has(item.id) && collectedItems.length < maxItems) {
          seenIds.add(item.id)
          collectedItems.push(item)
        }
      }
    }

    // Tier 1: Manually-flagged items
    const manualItems = await getManualUpsellItems(tenantId, maxItems)
    addUnique(manualItems)

    // Tier 2: Complementary pairs for items in cart
    if (collectedItems.length < maxItems && cartItemIds.length > 0) {
      try {
        const complementary = await getUpsellsForCart(cartItemIds, tenantId)
        addUnique(complementary)
      } catch {
        // Complementary pairs may not exist, continue to next tier
      }
    }

    // Tier 3: BCG star items
    if (collectedItems.length < maxItems) {
      try {
        const stars = await getStarItems(tenantId, maxItems)
        addUnique(stars)
      } catch {
        // Star items may not be classified yet, continue
      }
    }

    return { success: true, data: collectedItems.slice(0, maxItems) }
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

export async function setCheckoutUpsellItemsAction(
  tenantId: string,
  tenantSlug: string,
  selectedItemIds: string[]
) {
  try {
    const { verifyTenantAdmin } = await import('@/lib/admin-service')
    await verifyTenantAdmin(tenantId)
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    // Clear all existing selections for this tenant, then set new ones — 2 queries instead of N
    const { error: clearError } = await supabase
      .from('menu_items')
      .update({ show_in_checkout_upsell: false })
      .eq('tenant_id', tenantId)
      .eq('show_in_checkout_upsell', true)

    if (clearError) throw clearError

    if (selectedItemIds.length > 0) {
      const { error: setError } = await supabase
        .from('menu_items')
        .update({ show_in_checkout_upsell: true })
        .eq('tenant_id', tenantId)
        .in('id', selectedItemIds)

      if (setError) throw setError
    }

    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update checkout upsell items' }
  }
}

// ============================================
// Smart Upgrade Suggestions Actions
// ============================================

export async function getSmartUpgradeSuggestionsAction(
  itemId: string,
  tenantId: string
) {
  try {
    return await getSmartUpgradeSuggestions(itemId, tenantId)
  } catch (error) {
    console.error('Failed to get smart upgrade suggestions:', error)
    return { bundles: [], categoryUpgrades: [] }
  }
}

// ============================================
// BCG Smart Pair Suggestions Actions
// ============================================

export async function generateSmartPairSuggestionsAction(tenantId: string) {
  try {
    return await generateSmartPairSuggestions(tenantId)
  } catch (error) {
    console.error('Failed to generate smart pair suggestions:', error)
    return []
  }
}

export async function acceptPairSuggestionAction(
  tenantId: string,
  tenantSlug: string,
  sourceItemId: string,
  targetItemId: string,
  strategy: string
) {
  try {
    await acceptPairSuggestion(tenantId, sourceItemId, targetItemId, strategy)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
  } catch (error) {
    console.error('Failed to accept pair suggestion:', error)
    throw error
  }
}

export async function bulkAcceptPairSuggestionsAction(
  tenantId: string,
  tenantSlug: string,
  suggestions: Array<{ sourceItemId: string; targetItemId: string; strategy: string }>
) {
  try {
    await bulkAcceptPairSuggestions(tenantId, suggestions)
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
  } catch (error) {
    console.error('Failed to bulk accept pair suggestions:', error)
    throw error
  }
}
