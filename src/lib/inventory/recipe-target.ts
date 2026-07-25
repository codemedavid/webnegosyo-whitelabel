/**
 * Pure mapping from a costable-target descriptor to the `recipes` table's
 * target columns. This is the single source of truth for how each of the five
 * `RecipeTargetType`s is keyed — including the unified `modifier_option` path
 * added in migration 20260724120000.
 *
 * Keeping it pure and exhaustively tested guarantees no cross-target column
 * leakage (e.g. a modifier_option recipe never accidentally sets addon_id),
 * which the partial unique indexes on the table rely on.
 */

import type { RecipeTargetType } from '@/types/database'

export type RecipeTarget =
  | { type: 'menu_item'; menuItemId: string }
  | { type: 'variation_option'; menuItemId: string; variationOptionId: string }
  | { type: 'addon'; menuItemId: string; addonId: string }
  | { type: 'modifier_option'; menuItemId: string; modifierOptionId: string }
  | { type: 'prep_item'; prepItemId: string }

export interface RecipeTargetColumns {
  target_type: RecipeTargetType
  menu_item_id: string | null
  variation_option_id: string | null
  addon_id: string | null
  modifier_option_id: string | null
  prep_item_id: string | null
}

const EMPTY_COLUMNS: Omit<RecipeTargetColumns, 'target_type'> = {
  menu_item_id: null,
  variation_option_id: null,
  addon_id: null,
  modifier_option_id: null,
  prep_item_id: null,
}

function requireId(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

/** Maps a target descriptor to the exact `recipes` columns for that target. */
export function buildRecipeTargetColumns(target: RecipeTarget): RecipeTargetColumns {
  switch (target.type) {
    case 'menu_item':
      return {
        ...EMPTY_COLUMNS,
        target_type: 'menu_item',
        menu_item_id: requireId(target.menuItemId, 'Menu item'),
      }
    case 'variation_option':
      return {
        ...EMPTY_COLUMNS,
        target_type: 'variation_option',
        menu_item_id: requireId(target.menuItemId, 'Menu item'),
        variation_option_id: requireId(target.variationOptionId, 'Variation option'),
      }
    case 'addon':
      return {
        ...EMPTY_COLUMNS,
        target_type: 'addon',
        menu_item_id: requireId(target.menuItemId, 'Menu item'),
        addon_id: requireId(target.addonId, 'Addon'),
      }
    case 'modifier_option':
      return {
        ...EMPTY_COLUMNS,
        target_type: 'modifier_option',
        menu_item_id: requireId(target.menuItemId, 'Menu item'),
        modifier_option_id: requireId(target.modifierOptionId, 'Modifier option'),
      }
    case 'prep_item':
      return {
        ...EMPTY_COLUMNS,
        target_type: 'prep_item',
        prep_item_id: requireId(target.prepItemId, 'Prep item'),
      }
  }
}
