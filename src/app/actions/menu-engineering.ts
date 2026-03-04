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
    const manualItems = await getManualUpsellItems(tenantId, maxItems)
    // Filter out items already in cart
    const filtered = manualItems.filter(item => !cartItemIds.includes(item.id))
    return { success: true, data: filtered.slice(0, maxItems) }
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

export async function toggleCheckoutUpsellItemAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  showInCheckout: boolean
) {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('menu_items')
      // @ts-expect-error – Supabase generated types not available
      .update({ show_in_checkout_upsell: showInCheckout })
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .select('id, show_in_checkout_upsell')
      .single()

    if (error) throw error
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle checkout upsell item' }
  }
}
