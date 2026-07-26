/**
 * Pure mapping from validated recipe input to the `recipes` row's own columns
 * (as opposed to its component lines, which live in `recipe_components`).
 *
 * Split out from the service so the write shape is unit-testable without a
 * database: the yield is the number the costing core divides a prep's batch
 * cost by, so getting it wrong — or dropping it on update — quietly changes
 * every cost derived from that prep.
 */

import type { RecipeInput } from '@/lib/inventory/schemas'

export interface RecipeRowFields {
  notes: string | null
  yield_quantity: number | null
  yield_unit_id: string | null
}

/**
 * Every field is written explicitly, including nulls. An omitted yield must
 * *clear* a previously-saved one rather than be skipped — otherwise a merchant
 * who typed the wrong yield could never take it back.
 */
export function buildRecipeRowFields(input: RecipeInput): RecipeRowFields {
  const notes = input.notes?.trim()
  return {
    notes: notes ? notes : null,
    yield_quantity: input.yield_quantity ?? null,
    yield_unit_id: input.yield_unit_id ?? null,
  }
}
