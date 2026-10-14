/**
 * What an import row may write under the Phase 0d split. Pure.
 *
 * The import itself is `menu` (it builds the ingredient list). A row can also
 * carry a price (`costs`), a reorder level and an opening count (`inventory`).
 * A row needing a grant the importer lacks is refused with a sentence, never
 * silently stripped: someone who uploaded prices must not believe they were
 * saved. Only a CHANGED price or level asks, so re-importing an export of the
 * store's own list needs nothing extra.
 */

import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'
import {
  grantsForIngredientWrite,
  ingredientWriteRefusal,
  type StoredIngredient,
} from '@/lib/inventory/ingredient-write-grants'
import type { ImportRowInput } from '@/lib/inventory/import/import-batch'

export const IMPORT_COUNT_REFUSAL =
  'Saved, but its stock count needs the Inventory permission. Ask the store owner to record it.'

export interface ImportRowRefusals {
  /** Why the row may not be saved at all, or null. */
  save: string | null
  /** Why its stock count may not be recorded, or null. */
  count: string | null
}

/** Whether a row records a stock count. Mirrors `applyRow`'s rule. */
export function rowRecordsCount(row: ImportRowInput): boolean {
  return row.onHand !== null && (row.existingId !== null || row.onHand > 0)
}

/** What an update writes: never the unit (mirrors `toPatch` in import-apply). */
function updateFields(input: ImportRowInput['input']) {
  return {
    name: input.name,
    sku: input.sku,
    category: input.category,
    unit_cost: input.unit_cost,
    reorder_level: input.reorder_level,
    is_prep: input.is_prep,
    is_active: input.is_active,
  }
}

/**
 * `stored` is the row an update targets, or undefined when it is a new row or
 * the target is gone (the update itself then reports "no longer exists").
 */
export function importRowRefusals(
  holder: PermissionHolder,
  row: ImportRowInput,
  stored: StoredIngredient | undefined,
): ImportRowRefusals {
  const required = row.existingId === null
    ? grantsForIngredientWrite(null, row.input)
    : stored
      ? grantsForIngredientWrite(stored, updateFields(row.input))
      : []
  // The import already holds `menu`, so a no-change update is never refused here.
  const save = required.length > 0 ? ingredientWriteRefusal(holder, required) : null
  const count = rowRecordsCount(row) && !hasPermission(holder, 'inventory') ? IMPORT_COUNT_REFUSAL : null
  return { save, count }
}
