'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  getAddonLibrary,
  createAddonLibraryEntry,
  updateAddonLibraryEntry,
  deleteAddonLibraryEntry,
  type AddonLibraryInput,
} from '@/lib/addon-library-service'

function zodErrorMessage(error: z.ZodError): string {
  return JSON.stringify(error.issues.map((err) => ({ path: err.path, message: err.message })))
}

export async function getAddonLibraryAction(tenantId: string) {
  try {
    const entries = await getAddonLibrary(tenantId)
    return { success: true, data: entries }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch add-on library' }
  }
}

export async function createAddonLibraryEntryAction(
  tenantId: string,
  tenantSlug: string,
  input: AddonLibraryInput,
) {
  try {
    const entry = await createAddonLibraryEntry(tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/addons`)
    return { success: true, data: entry }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: zodErrorMessage(error) }
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create add-on' }
  }
}

export async function updateAddonLibraryEntryAction(
  entryId: string,
  tenantId: string,
  tenantSlug: string,
  input: AddonLibraryInput,
) {
  try {
    const entry = await updateAddonLibraryEntry(entryId, tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/addons`)
    return { success: true, data: entry }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: zodErrorMessage(error) }
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update add-on' }
  }
}

export async function deleteAddonLibraryEntryAction(entryId: string, tenantId: string, tenantSlug: string) {
  try {
    await deleteAddonLibraryEntry(entryId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/addons`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete add-on' }
  }
}
