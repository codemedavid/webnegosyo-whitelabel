'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  getModifierGroupLibrary,
  createModifierGroupLibraryEntry,
  updateModifierGroupLibraryEntry,
  deleteModifierGroupLibraryEntry,
  type ModifierGroupLibraryInput,
} from '@/lib/modifier-library-service'

function zodErrorMessage(error: z.ZodError): string {
  return JSON.stringify(error.issues.map((err) => ({ path: err.path, message: err.message })))
}

export async function getModifierGroupLibraryAction(tenantId: string) {
  try {
    const entries = await getModifierGroupLibrary(tenantId)
    return { success: true, data: entries }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch modifier library',
    }
  }
}

export async function createModifierGroupLibraryEntryAction(
  tenantId: string,
  tenantSlug: string,
  input: ModifierGroupLibraryInput,
) {
  try {
    const entry = await createModifierGroupLibraryEntry(tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    return { success: true, data: entry }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: zodErrorMessage(error) }
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create modifier group' }
  }
}

export async function updateModifierGroupLibraryEntryAction(
  entryId: string,
  tenantId: string,
  tenantSlug: string,
  input: ModifierGroupLibraryInput,
) {
  try {
    const entry = await updateModifierGroupLibraryEntry(entryId, tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    return { success: true, data: entry }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: zodErrorMessage(error) }
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update modifier group' }
  }
}

export async function deleteModifierGroupLibraryEntryAction(
  entryId: string,
  tenantId: string,
  tenantSlug: string,
) {
  try {
    await deleteModifierGroupLibraryEntry(entryId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete modifier group' }
  }
}
