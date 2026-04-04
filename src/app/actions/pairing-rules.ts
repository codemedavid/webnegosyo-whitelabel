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
