'use server'

import { z } from 'zod'
import { importIngredientBatch } from '@/lib/inventory/import/import-service'

/**
 * One batch of the ingredient import.
 *
 * Deliberately no `revalidatePath`: the wizard calls this once per 25 rows,
 * and revalidating the page the merchant is on re-renders it on every call.
 * The wizard refreshes once, when the last batch is in.
 */
export async function importIngredientsBatchAction(tenantId: string, batch: unknown) {
  try {
    return { success: true as const, data: await importIngredientBatch(tenantId, batch) }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false as const, error: 'Some rows in this file couldn’t be read. Re-upload it and try again.' }
    }
    console.error('[inventory-import] batch failed', { tenantId, error })
    const isAuthError = error instanceof Error && error.message.startsWith('Unauthorized')
    return {
      success: false as const,
      error: isAuthError
        ? 'You don’t have permission to change ingredients.'
        : 'We couldn’t reach the server. Check your connection and try again.',
    }
  }
}
