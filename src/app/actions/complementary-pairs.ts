'use server'

import { revalidatePath } from 'next/cache'
import {
  getComplementaryItems,
  getComplementaryPairsByTenant,
  createComplementaryPairs,
  deleteComplementaryPair,
  deleteComplementaryPairsForSource,
} from '@/lib/complementary-pairs-service'
import type { MenuItem, ComplementaryPairWithDetails } from '@/types/database'

export async function getComplementaryItemsAction(
  itemId: string,
  categoryId: string,
  tenantId: string
): Promise<MenuItem[]> {
  return getComplementaryItems(itemId, categoryId, tenantId)
}

export async function getComplementaryPairsAction(
  tenantId: string
): Promise<ComplementaryPairWithDetails[]> {
  return getComplementaryPairsByTenant(tenantId)
}

export async function createComplementaryPairsAction(
  tenantId: string,
  tenantSlug: string,
  sourceType: 'item' | 'category',
  sourceId: string,
  targetItemIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const result = await createComplementaryPairs(tenantId, sourceType, sourceId, targetItemIds)

  if (result.success) {
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
  }

  return result
}

export async function deleteComplementaryPairAction(
  id: string,
  tenantId: string,
  tenantSlug: string
): Promise<{ success: boolean; error?: string }> {
  const result = await deleteComplementaryPair(id, tenantId)

  if (result.success) {
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
  }

  return result
}

export async function updateComplementaryPairsAction(
  tenantId: string,
  tenantSlug: string,
  sourceType: 'item' | 'category',
  sourceId: string,
  targetItemIds: string[]
): Promise<{ success: boolean; error?: string }> {
  // Delete existing pairs for this source, then create new ones
  const deleteResult = await deleteComplementaryPairsForSource(tenantId, sourceType, sourceId)
  if (!deleteResult.success) return deleteResult

  if (targetItemIds.length === 0) {
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
    return { success: true }
  }

  const createResult = await createComplementaryPairs(tenantId, sourceType, sourceId, targetItemIds)

  if (createResult.success) {
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
  }

  return createResult
}
