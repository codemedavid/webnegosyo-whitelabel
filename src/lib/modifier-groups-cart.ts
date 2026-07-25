/**
 * Storefront selection adapter for unified modifier groups.
 *
 * Pure and side-effect free. The customer's choices are tracked as a
 * `ModifierSelection` (group id → selected option ids). These helpers seed the
 * default selection, toggle options honouring single- vs multi-select rules,
 * validate min/max, and map the selection back into the legacy
 * `selected_variations` / `selected_addons` shapes the existing cart, order and
 * messenger pipeline already understands — so nothing downstream needs to know
 * about modifier groups.
 *
 * A group is single-select when `max_select === 1` (variation-style) and
 * multi-select otherwise (`null` = unlimited, or a numeric cap).
 */

import type { Addon, ModifierGroup, ModifierOption, VariationOption } from '@/types/database'
import {
  isOptionAvailable,
  validateGroupSelection,
  type SelectionValidationResult,
} from '@/lib/modifier-groups'

/** Customer selection: group id → the ids of the options chosen in that group. */
export type ModifierSelection = { [groupId: string]: string[] }

/** Cart-facing projection of a selection, consumable by `calculateCartItemSubtotal`. */
export interface CartSelectionFormat {
  selectedVariations: { [groupId: string]: VariationOption }
  selectedAddons: Addon[]
}

function isSingleSelect(group: ModifierGroup): boolean {
  return group.max_select === 1
}

/**
 * Seed the initial selection. Single-select groups pick their `is_default`
 * option (or, when required, the first available option); multi-select groups
 * pick every `is_default` option. Optional single-select groups start empty.
 */
export function getDefaultSelection(groups: readonly ModifierGroup[]): ModifierSelection {
  const selection: ModifierSelection = {}

  for (const group of groups) {
    if (isSingleSelect(group)) {
      const explicitDefault = group.options.find((o) => o.is_default && isOptionAvailable(o))
      if (explicitDefault) {
        selection[group.id] = [explicitDefault.id]
      } else if (group.min_select > 0) {
        const firstAvailable = group.options.find((o) => isOptionAvailable(o))
        selection[group.id] = firstAvailable ? [firstAvailable.id] : []
      } else {
        selection[group.id] = []
      }
    } else {
      selection[group.id] = group.options
        .filter((o) => o.is_default && isOptionAvailable(o))
        .map((o) => o.id)
    }
  }

  return selection
}

/**
 * Immutably toggle an option within its group. Single-select replaces the
 * current pick; multi-select adds or removes, ignoring an add that would exceed
 * `max_select`. Removals are always honoured.
 */
export function toggleOption(
  selection: ModifierSelection,
  group: ModifierGroup,
  optionId: string,
): ModifierSelection {
  const current = selection[group.id] ?? []

  if (isSingleSelect(group)) {
    const next = current.includes(optionId) ? [] : [optionId]
    return { ...selection, [group.id]: next }
  }

  if (current.includes(optionId)) {
    return { ...selection, [group.id]: current.filter((id) => id !== optionId) }
  }

  if (group.max_select !== null && current.length >= group.max_select) {
    return selection
  }

  return { ...selection, [group.id]: [...current, optionId] }
}

/** Flatten a selection into the chosen option objects, in group then option order. */
export function getSelectedOptions(
  groups: readonly ModifierGroup[],
  selection: ModifierSelection,
): ModifierOption[] {
  const options: ModifierOption[] = []

  for (const group of groups) {
    const selectedIds = selection[group.id] ?? []
    for (const option of group.options) {
      if (selectedIds.includes(option.id)) {
        options.push(option)
      }
    }
  }

  return options
}

function optionToVariationOption(option: ModifierOption): VariationOption {
  return {
    id: option.id,
    name: option.name,
    price_modifier: option.price_modifier,
    image_url: option.image_url,
    is_default: option.is_default,
    display_order: option.display_order,
  }
}

function optionToAddon(option: ModifierOption): Addon {
  return {
    id: option.id,
    name: option.name,
    // An option's price modifier is the add-on's absolute price in the legacy shape.
    price: option.price_modifier,
  }
}

/**
 * Project a selection into the legacy cart shapes. Single-select groups become
 * `selected_variations` entries keyed by group id; multi-select group options
 * become `selected_addons`. Feeding these to `calculateCartItemSubtotal` yields
 * exactly `computeModifierSubtotal` for the same options.
 */
export function mapSelectionToCartFormat(
  groups: readonly ModifierGroup[],
  selection: ModifierSelection,
): CartSelectionFormat {
  const selectedVariations: { [groupId: string]: VariationOption } = {}
  const selectedAddons: Addon[] = []

  for (const group of groups) {
    const selectedIds = selection[group.id] ?? []
    if (selectedIds.length === 0) continue

    const chosen = group.options.filter((o) => selectedIds.includes(o.id))

    if (isSingleSelect(group)) {
      // Single-select: at most one option maps to a variation entry.
      selectedVariations[group.id] = optionToVariationOption(chosen[0])
    } else {
      selectedAddons.push(...chosen.map(optionToAddon))
    }
  }

  return { selectedVariations, selectedAddons }
}

/**
 * Validate every group against its min/max rules, returning the first failure
 * (or `{ valid: true }`). Used to gate add-to-cart.
 */
export function validateAllGroups(
  groups: readonly ModifierGroup[],
  selection: ModifierSelection,
): SelectionValidationResult {
  for (const group of groups) {
    const result = validateGroupSelection(group, selection[group.id] ?? [])
    if (!result.valid) {
      return result
    }
  }
  return { valid: true }
}
