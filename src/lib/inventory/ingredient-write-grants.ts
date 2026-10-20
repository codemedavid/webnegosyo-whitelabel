/**
 * Which staff grants one ingredient write needs (Phase 0d, plan §6.1). Pure.
 *
 * Mirrors `inventory_items_client_guard` (migration 20261013120100) column for
 * column, so the web refuses with a sentence before the database refuses with
 * a 42501:
 *   - adding an ingredient, or changing its master fields, is `menu`;
 *   - a new ingredient with a price, or a changed price, is `costs`;
 *   - a changed reorder level is `inventory` (a starting one rides with `menu`);
 *   - an update that changes none of these still needs one of the three.
 *
 * Only a CHANGED field asks for its grant: the ingredient form resubmits every
 * field, and a cook renaming "Beef" must not need the right to reprice it.
 */

import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'
import type { IngredientInput } from '@/lib/inventory/schemas'

export type IngredientGrant = 'menu' | 'costs' | 'inventory'

export const INGREDIENT_REFUSALS: Readonly<Record<IngredientGrant, string>> = {
  menu: 'Adding or editing ingredients needs the Menu permission. Ask the store owner to turn it on for you.',
  costs: 'Changing what an ingredient costs needs the Costs & Profit permission. Ask the store owner to turn it on for you.',
  inventory: 'Changing a reorder level needs the Inventory permission. Ask the store owner to turn it on for you.',
}

/** The master columns, exactly the tuple the database guard compares. */
const MASTER_FIELDS = ['name', 'sku', 'category', 'stock_unit_id', 'is_prep', 'image_url', 'is_active'] as const

/** What an ingredient write may carry; a field that is absent is not written. */
export type IngredientWrite = Partial<IngredientInput>

/** The stored row an update is compared against. */
export type StoredIngredient = Pick<IngredientInput, (typeof MASTER_FIELDS)[number] | 'unit_cost' | 'reorder_level'>

function sameNumber(stored: unknown, next: number): boolean {
  return Number(stored) === next
}

function changes<K extends keyof StoredIngredient>(stored: StoredIngredient, next: IngredientWrite, field: K): boolean {
  const value = next[field]
  if (value === undefined) return false
  if (typeof value === 'number') return !sameNumber(stored[field], value)
  return (stored[field] ?? null) !== (value ?? null)
}

/**
 * The grants `next` needs, in a fixed order (menu, costs, inventory).
 * `stored` of `null` is an insert.
 */
export function grantsForIngredientWrite(stored: StoredIngredient | null, next: IngredientWrite): IngredientGrant[] {
  if (stored === null) {
    // A starting reorder level rides with adding the ingredient (`menu`), as
    // in the database guard; changing it later is `inventory`.
    return (next.unit_cost ?? 0) !== 0 ? ['menu', 'costs'] : ['menu']
  }
  const needed: Array<[IngredientGrant, boolean]> = [
    ['menu', MASTER_FIELDS.some((field) => changes(stored, next, field))],
    ['costs', changes(stored, next, 'unit_cost')],
    ['inventory', changes(stored, next, 'reorder_level')],
  ]
  return needed.filter(([, isNeeded]) => isNeeded).map(([grant]) => grant)
}

/**
 * The sentence refusing `holder` this write, or null when they may make it.
 * An empty `required` (nothing changed) still needs one ingredient-side grant:
 * a register-only account has no business writing the table at all.
 */
export function ingredientWriteRefusal(holder: PermissionHolder, required: readonly IngredientGrant[]): string | null {
  if (required.length === 0) {
    const holdsAny = (['menu', 'inventory', 'costs'] as const).some((key) => hasPermission(holder, key))
    return holdsAny ? null : INGREDIENT_REFUSALS.menu
  }
  const missing = required.find((key) => !hasPermission(holder, key))
  return missing ? INGREDIENT_REFUSALS[missing] : null
}
