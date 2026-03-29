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
