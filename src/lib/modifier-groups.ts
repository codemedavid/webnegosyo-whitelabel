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

import { resolveCostByMode } from '@/lib/inventory/cost-mode'
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
export type ModifierSource = Partial<
  Pick<MenuItem, 'modifier_groups' | 'variation_types' | 'variations' | 'addons'>
>

/**
 * Return the item's modifier groups as one normalized model.
 *
 * Precedence: explicit `modifier_groups` → grouped `variation_types` + `addons`
 * → legacy flat `variations` + `addons`. Groups and their options are returned
 * sorted by `display_order`.
 */
export function normalizeModifierGroups(item: ModifierSource): ModifierGroup[] {
  // 1. Explicit unified payload wins.
  if (item.modifier_groups && item.modifier_groups.length > 0) {
    return sortGroups(item.modifier_groups)
  }

  const groups: ModifierGroup[] = []

  // 2. Grouped variation_types → single-select groups. Fall back to legacy flat
  //    variations only when no grouped types exist.
  if (item.variation_types && item.variation_types.length > 0) {
    groups.push(...item.variation_types.map(groupFromVariationType))
  } else if (item.variations && item.variations.length > 0) {
    groups.push(groupFromLegacyVariations(item.variations))
  }

  // 3. Add-ons → one optional multi-select group.
  if (item.addons && item.addons.length > 0) {
    groups.push(groupFromAddons(item.addons))
  }

  return sortGroups(groups)
}

function sortGroups(groups: readonly ModifierGroup[]): ModifierGroup[] {
  return [...groups]
    .sort((a, b) => a.display_order - b.display_order)
    .map((g) => ({
      ...g,
      options: [...g.options].sort((a, b) => a.display_order - b.display_order),
    }))
}

function groupFromVariationType(type: VariationType): ModifierGroup {
  return {
    id: type.id,
    name: type.name,
    display_order: type.display_order,
    min_select: type.is_required ? 1 : 0,
    max_select: 1, // variation types are single-select
    options: type.options.map((o) => ({
      id: o.id,
      name: o.name,
      price_modifier: o.price_modifier,
      image_url: o.image_url,
      is_default: o.is_default,
      display_order: o.display_order,
    })),
  }
}

function groupFromLegacyVariations(variations: readonly Variation[]): ModifierGroup {
  return {
    id: 'legacy-variations',
    name: LEGACY_VARIATION_GROUP_NAME,
    display_order: 0,
    min_select: 0,
    max_select: 1, // legacy variations were single-select
    options: variations.map((v, index) => ({
      id: v.id,
      name: v.name,
      price_modifier: v.price_modifier,
      is_default: v.is_default,
      display_order: index,
    })),
  }
}

function groupFromAddons(addons: readonly Addon[]): ModifierGroup {
  return {
    id: 'legacy-addons',
    name: LEGACY_ADDON_GROUP_NAME,
    // Sort after variation groups by default.
    display_order: 1000,
    min_select: 0,
    max_select: null, // add-ons are unlimited multi-select
    options: addons.map((a, index) => ({
      id: a.id,
      name: a.name,
      price_modifier: a.price, // an add-on's price is a price modifier
      is_default: a.is_default,
      display_order: index,
    })),
  }
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
  group: ModifierGroup,
  selectedOptionIds: readonly string[],
): SelectionValidationResult {
  const count = selectedOptionIds.length

  if (count < group.min_select) {
    return {
      valid: false,
      error:
        group.min_select === 1
          ? `Please choose an option for ${group.name}.`
          : `Please choose at least ${group.min_select} for ${group.name}.`,
    }
  }

  if (group.max_select !== null && count > group.max_select) {
    return {
      valid: false,
      error: `Choose at most ${group.max_select} for ${group.name}.`,
    }
  }

  return { valid: true }
}

/**
 * Subtotal for a configured line: (base + Σ selected option price modifiers) × qty.
 * Rounded to cents.
 */
export function computeModifierSubtotal(
  basePrice: number,
  selectedOptions: readonly ModifierOption[],
  quantity: number,
): number {
  const modifierTotal = selectedOptions.reduce((sum, o) => sum + o.price_modifier, 0)
  return Math.round((basePrice + modifierTotal) * quantity * 100) / 100
}

/**
 * Whether an option can currently be selected. An explicit `is_available: false`
 * always hides it; `simple` stock at/below zero hides it; `recipe` stock is
 * resolved elsewhere (best-effort available here).
 */
export function isOptionAvailable(option: ModifierOption): boolean {
  if (option.is_available === false) {
    return false
  }
  if (option.stock_mode === 'simple') {
    return (option.stock_qty ?? 0) > 0
  }
  // 'none' | 'recipe' | undefined → available (recipe stock resolved elsewhere)
  return true
}

/**
 * Effective per-option cost under the **legacy** rule: a recipe-derived cost
 * (when a recipe is attached) overrides the manual cost; otherwise the manual
 * cost; otherwise 0. `recipeCost === undefined` means no recipe is attached
 * (distinct from a real recipe cost of 0).
 *
 * Kept as the mode-less entry point for callers that have no `ModifierOption`
 * in hand. Prefer `resolveOptionCostForOption` in `@/lib/inventory/cost-mode`,
 * which honors the option's explicit Simple/Composite choice.
 */
export function resolveOptionCost(
  manualCost: number | undefined,
  recipeCost: number | undefined,
): number {
  return resolveCostByMode(undefined, manualCost, recipeCost)
}
