/**
 * Unified modifier groups — the single model behind both variations and add-ons.
 *
 * Pure, side-effect free so it can be unit-tested exhaustively and reused across
 * web (server + client), the desktop POS, and the mobile apps. The functions
 * here NEVER touch the database.
 *
 * Backward compatibility is the core contract: a menu item may carry the new
 * `modifier_groups` payload OR only the legacy `variation_types` / `variations`
 * / `addons` columns. `normalizeModifierGroups` returns the same
 * `ModifierGroup[]` shape either way, so every consumer reads one model.
 */

import type {
  Addon,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  Variation,
  VariationType,
} from '@/types/database'

/** Group name used when deriving a group from legacy flat `variations`. */
export const LEGACY_VARIATION_GROUP_NAME = 'Options'
/** Group name used when deriving a group from legacy flat `addons`. */
export const LEGACY_ADDON_GROUP_NAME = 'Add-ons'

/** Subset of a menu item that carries modifier data (all optional/legacy). */
export type ModifierSource = Pick<
  MenuItem,
  'modifier_groups' | 'variation_types' | 'variations' | 'addons'
>

/**
 * Return the item's modifier groups as one normalized model.
 *
 * Precedence: explicit `modifier_groups` → grouped `variation_types` + `addons`
 * → legacy flat `variations` + `addons`. Groups and their options are returned
 * sorted by `display_order`.
 */
export function normalizeModifierGroups(_item: ModifierSource): ModifierGroup[] {
  throw new Error('not implemented')
}

export interface SelectionValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate a customer's selection for one group against its min/max rules.
 * `max_select === null` means unlimited.
 */
export function validateGroupSelection(
  _group: ModifierGroup,
  _selectedOptionIds: readonly string[],
): SelectionValidationResult {
  throw new Error('not implemented')
}

/**
 * Subtotal for a configured line: (base + Σ selected option price modifiers) × qty.
 * Rounded to cents.
 */
export function computeModifierSubtotal(
  _basePrice: number,
  _selectedOptions: readonly ModifierOption[],
  _quantity: number,
): number {
  throw new Error('not implemented')
}

/**
 * Whether an option can currently be selected. An explicit `is_available: false`
 * always hides it; `simple` stock at/below zero hides it; `recipe` stock is
 * resolved elsewhere (best-effort available here).
 */
export function isOptionAvailable(_option: ModifierOption): boolean {
  throw new Error('not implemented')
}

/**
 * Effective per-option cost. A recipe-derived cost (when a recipe is attached)
 * overrides the manual cost; otherwise the manual cost is used; otherwise 0.
 * `recipeCost === undefined` means no recipe is attached (distinct from a real
 * recipe cost of 0).
 */
export function resolveOptionCost(
  _manualCost: number | undefined,
  _recipeCost: number | undefined,
): number {
  throw new Error('not implemented')
}
