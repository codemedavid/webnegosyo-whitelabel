/**
 * Admin-editor helpers for unified modifier groups.
 *
 * Pure and side-effect free. Two responsibilities:
 *  1. Immutable editor-state transforms (factories + selection-rule toggles) the
 *     unified Modifier Groups editor uses to build `ModifierGroup[]`.
 *  2. The backward-compatibility contract: `splitGroupsToLegacyColumns` mirrors
 *     the unified groups back into the legacy `variation_types` / `addons`
 *     columns so surfaces that don't yet read `modifier_groups` (storefront,
 *     desktop POS, mobile) keep rendering unchanged.
 *
 * A group is single-select when `max_select === 1`; anything else (null =
 * unlimited, or a finite cap > 1) is multi-select.
 */

import type {
  Addon,
  CostMode,
  ModifierGroup,
  ModifierOption,
  Variation,
  VariationType,
} from '@/types/database'

export interface LegacyColumns {
  variation_types: VariationType[]
  variations: Variation[]
  addons: Addon[]
}

/** A group is single-select when its max cap is exactly 1. */
export function isSingleSelectGroup(group: ModifierGroup): boolean {
  return group.max_select === 1
}

/** New empty group: optional, single-select (the most common shape). */
export function createModifierGroup(id: string, displayOrder: number): ModifierGroup {
  return {
    id,
    name: '',
    display_order: displayOrder,
    min_select: 0,
    max_select: 1,
    options: [],
  }
}

/** New empty option: zero price, no stock tracking. */
export function createModifierOption(id: string, displayOrder: number): ModifierOption {
  return {
    id,
    name: '',
    price_modifier: 0,
    display_order: displayOrder,
    stock_mode: 'none',
  }
}

/**
 * Toggle a group between multi-select and single-select. Switching to
 * single-select caps `max_select` at 1 and clamps `min_select` to that cap so
 * the rule stays coherent. Returns a new group (never mutates).
 */
export function setGroupMultiple(group: ModifierGroup, multiple: boolean): ModifierGroup {
  if (multiple) {
    return { ...group, max_select: null }
  }
  return {
    ...group,
    max_select: 1,
    min_select: Math.min(group.min_select, 1),
  }
}

/**
 * Set an explicit minimum number of picks, so merchants can author "choose at
 * least 2" — previously unreachable, because the editor only offered a Required
 * checkbox that pinned `min_select` to 0 or 1.
 *
 * The cap is raised to match when the new minimum exceeds it: a group whose
 * minimum is above its maximum can never be satisfied, so add-to-cart would
 * reject every possible selection. Returns a new group (never mutates).
 */
export function setGroupMinSelect(group: ModifierGroup, min: number): ModifierGroup {
  const nextMin = Math.max(0, Math.floor(min) || 0)
  return {
    ...group,
    min_select: nextMin,
    max_select: group.max_select === null ? null : Math.max(group.max_select, nextMin),
  }
}

/**
 * Set the maximum number of picks (`null` = unlimited). Mirrors
 * `setGroupMinSelect`: the minimum is lowered to match when the new cap falls
 * below it, keeping the rule satisfiable. Returns a new group (never mutates).
 */
export function setGroupMaxSelect(group: ModifierGroup, max: number | null): ModifierGroup {
  if (max === null) {
    return { ...group, max_select: null }
  }
  const nextMax = Math.max(1, Math.floor(max) || 1)
  return {
    ...group,
    max_select: nextMax,
    min_select: Math.min(group.min_select, nextMax),
  }
}

/**
 * Mark a group required (min_select >= 1) or optional (min_select = 0),
 * preserving `max_select`. Returns a new group (never mutates).
 */
export function setGroupRequired(group: ModifierGroup, required: boolean): ModifierGroup {
  return {
    ...group,
    min_select: required ? Math.max(group.min_select, 1) : 0,
  }
}

/**
 * Choose where an option's cost comes from: a number the merchant types
 * ('simple') or its attached inventory recipe ('composite').
 *
 * `manual_cost` is deliberately preserved when switching to composite. The mode
 * decides which cost is *used* (see resolveCostByMode), so the typed number is
 * inert rather than wrong, and switching back restores it instead of silently
 * discarding what the merchant entered. Stock tracking is untouched — costing by
 * recipe and depleting stock by recipe are separate decisions.
 *
 * Returns a new option (never mutates).
 */
export function setOptionCostMode(option: ModifierOption, mode: CostMode): ModifierOption {
  return { ...option, cost_mode: mode }
}

/**
 * Clean editor state for persistence: trim names, drop blank-name options, drop
 * groups left with no options, and reindex display_order densely from 0.
 */
export function serializeGroups(groups: readonly ModifierGroup[]): ModifierGroup[] {
  return groups
    .map((group) => {
      const options = group.options
        .map((o) => ({ ...o, name: o.name.trim() }))
        .filter((o) => o.name.length > 0)
        .map((o, index) => ({ ...o, display_order: index }))
      return { ...group, name: group.name.trim(), options }
    })
    .filter((group) => group.options.length > 0)
    .map((group, index) => ({ ...group, display_order: index }))
}

/**
 * Mirror unified groups into the legacy columns. Single-select groups become
 * `variation_types`; every multi-select group's options are flattened into the
 * shared `addons` list. `variations` (the oldest flat format) is never emitted —
 * grouped `variation_types` fully supersedes it.
 */
export function splitGroupsToLegacyColumns(groups: readonly ModifierGroup[]): LegacyColumns {
  const variation_types: VariationType[] = []
  const addons: Addon[] = []

  groups.forEach((group, groupIndex) => {
    if (isSingleSelectGroup(group)) {
      variation_types.push({
        id: group.id,
        name: group.name,
        is_required: group.min_select >= 1,
        display_order: group.display_order ?? groupIndex,
        options: group.options.map((o, optionIndex) => ({
          id: o.id,
          name: o.name,
          price_modifier: o.price_modifier,
          image_url: o.image_url,
          is_default: o.is_default,
          is_upgrade_target: o.is_upgrade_target,
          display_order: o.display_order ?? optionIndex,
        })),
      })
      return
    }

    group.options.forEach((o) => {
      addons.push({ id: o.id, name: o.name, price: o.price_modifier, is_default: o.is_default })
    })
  })

  return { variation_types, variations: [], addons }
}
