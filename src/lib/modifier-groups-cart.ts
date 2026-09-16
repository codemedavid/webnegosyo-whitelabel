/**
 * Storefront selection adapter for unified modifier groups.
 *
 * Pure and side-effect free. The customer's choices are tracked as a
 * `ModifierSelection` (group id → selected option ids). These helpers seed the
 * default selection, toggle options honouring single- vs multi-select rules,
 * validate min/max, and map the selection back into the legacy
 * `selected_variations` / `selected_addons` shapes the existing cart, order and
 * messenger pipeline uses. Quantity groups carry explicit per-item portions on
 * their selected add-on snapshots.
 *
 * Choice groups use `max_select` for single/multi selection; quantity groups
 * stay add-ons even when capped to one portion.
 */

import type { Addon, ModifierGroup, ModifierOption, VariationOption } from '@/types/database'
import { addonQuantity, MAX_ADDON_QUANTITY } from '@/lib/addon-quantity'
import {
  isOptionAvailable,
  validateGroupSelection,
  type SelectionValidationResult,
} from '@/lib/modifier-groups'

/** Group → option IDs; quantity groups carry one occurrence per portion. */
export type ModifierSelection = { [groupId: string]: string[] }

/** Cart-facing projection of a selection, consumable by `calculateCartItemSubtotal`. */
export interface CartSelectionFormat {
  selectedVariations: { [groupId: string]: VariationOption }
  selectedAddons: Addon[]
}

/** Older carts stored raw linked groups but resolved prices on their selections. */
export function restoreLinkedOptionSnapshots(groups: readonly ModifierGroup[], cart: CartSelectionFormat): ModifierGroup[] {
  return groups.map(group => ({ ...group, options: group.options.map(option => {
    if (!option.menu_item_id) return option
    const addon = cart.selectedAddons.find(a => a.id === option.id)
    const variation = Object.values(cart.selectedVariations).find(o => o.id === option.id)
    return addon ? { ...option, name: addon.name, price_modifier: addon.price }
      : variation ? { ...option, name: variation.name, price_modifier: variation.price_modifier } : option
  }) }))
}

function isSingleSelect(group: ModifierGroup): boolean {
  return group.selection_mode !== 'quantity' && group.max_select === 1
}

/** Update portions immutably; count caps apply to all portions in the group. */
export function setOptionQuantity(
  selection: ModifierSelection, group: ModifierGroup, optionId: string, quantity: number,
): ModifierSelection {
  if (group.selection_mode !== 'quantity' || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_ADDON_QUANTITY) return selection
  const option = group.options.find(o => o.id === optionId)
  if (!option) return selection
  const current = selection[group.id] ?? []
  const previous = current.filter(id => id === optionId).length
  const others = current.filter(id => id !== optionId)
  if (quantity > previous && (!isOptionAvailable(option)
    || (group.max_select !== null && others.length + quantity > group.max_select)
    || (option.stock_mode === 'simple' && quantity > (option.stock_qty ?? 0)))) return selection
  return { ...selection, [group.id]: [...others, ...Array<string>(quantity).fill(optionId)] }
}

/** Restore a cart configuration without collapsing repeated portions. */
export function mapCartFormatToSelection(groups: readonly ModifierGroup[], cart: CartSelectionFormat): ModifierSelection {
  const selection: ModifierSelection = {}
  for (const group of groups) {
    if (isSingleSelect(group)) {
      const option = cart.selectedVariations[group.id]
      selection[group.id] = option ? [option.id] : []
    } else {
      selection[group.id] = group.options.flatMap(option => {
        const addon = cart.selectedAddons.find(a => a.id === option.id)
        return addon ? Array<string>(group.selection_mode === 'quantity' ? addonQuantity(addon) : 1).fill(option.id) : []
      })
    }
  }
  return selection
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
        .slice(0, group.max_select ?? undefined)
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
      const count = selectedIds.filter(id => id === option.id).length
      options.push(...Array<ModifierOption>(group.selection_mode === 'quantity' ? count : Math.min(count, 1)).fill(option))
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
      if (chosen[0]) selectedVariations[group.id] = optionToVariationOption(chosen[0])
    } else {
      selectedAddons.push(...chosen.map(option => ({
        ...optionToAddon(option),
        ...(group.selection_mode === 'quantity' ? { quantity: selectedIds.filter(id => id === option.id).length } : {}),
      })))
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
  parentQuantity = 1,
): SelectionValidationResult {
  for (const group of groups) {
    const ids = selection[group.id] ?? []
    for (const id of ids) {
      const option = group.options.find(o => o.id === id)
      const portions = ids.filter(selected => selected === id).length
      if (!option || !isOptionAvailable(option)) return { valid: false, error: `An option in ${group.name} is no longer available.` }
      if (group.selection_mode !== 'quantity' && portions > 1) return { valid: false, error: `Choose each option in ${group.name} only once.` }
      if (portions > MAX_ADDON_QUANTITY || (option.stock_mode === 'simple' && portions * parentQuantity > (option.stock_qty ?? 0))) {
        return { valid: false, error: `Not enough stock for ${option.name}.` }
      }
    }
    const result = validateGroupSelection(group, ids)
    if (!result.valid) {
      return result
    }
  }
  return { valid: true }
}
