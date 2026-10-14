import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MenuItem, ModifierGroup } from '@/types/database'
import { MAX_CART_ITEM_QUANTITY } from '@/lib/cart-utils'
import { computeModifierSubtotal, normalizeModifierGroups } from '@/lib/modifier-groups'
import { resolveLinkedOptions, type LinkedItemSnapshot } from '@/lib/modifier-linked-options'
import { withRecipeStockAvailability } from '@/lib/inventory/option-availability'
import {
  getDefaultSelection,
  getSelectedOptions,
  mapSelectionToCartFormat,
  pruneUnavailableSelection,
  toggleOption,
  validateAllGroups,
  setOptionQuantity,
  type CartSelectionFormat,
  type ModifierSelection,
} from '@/lib/modifier-groups-cart'
import type { SelectionValidationResult } from '@/lib/modifier-groups'

interface UseModifierGroupsOptions {
  item: MenuItem
  /**
   * Menu items referenced by linked add-on options, keyed by id. Supplied by the
   * page that fetched them; omitted (or missing an id) makes those options
   * render as unavailable rather than blank.
   */
  linkedItems?: ReadonlyMap<string, LinkedItemSnapshot>
  /**
   * Options whose recipe the shelf cannot cover right now (from the stock
   * ceilings). They render as unavailable, and any pick of them — e.g. a
   * default seeded before the ceilings arrived — is dropped.
   */
  soldOutOptionIds?: ReadonlySet<string>
}

const NONE_SOLD_OUT: ReadonlySet<string> = new Set()

interface UseModifierGroupsResult {
  /** Whether the item carries an explicit unified modifier_groups payload. */
  active: boolean
  groups: ModifierGroup[]
  selection: ModifierSelection
  quantity: number
  basePrice: number
  totalPrice: number
  cartFormat: CartSelectionFormat
  toggle: (group: ModifierGroup, optionId: string) => void
  setOptionQuantity: (group: ModifierGroup, optionId: string, quantity: number) => void
  setQuantity: (quantity: number) => void
  incrementQuantity: () => void
  decrementQuantity: () => void
  validate: () => SelectionValidationResult
}

/**
 * Drives the unified modifier-groups selection UI on the storefront. Thin React
 * state over the pure adapter in `@/lib/modifier-groups-cart`: it seeds the
 * default selection, toggles options (single- vs multi-select), tracks quantity,
 * and exposes the price plus the legacy cart projection used by add-to-cart.
 *
 * `active` is false for items without an explicit `modifier_groups` payload, so
 * callers keep their existing legacy variation/add-on path untouched.
 */
export function useModifierGroups({
  item,
  linkedItems,
  soldOutOptionIds = NONE_SOLD_OUT,
}: UseModifierGroupsOptions): UseModifierGroupsResult {
  const active = Boolean(item.modifier_groups && item.modifier_groups.length > 0)

  const groups = useMemo(() => {
    if (!active) return []
    const normalized = normalizeModifierGroups({ modifier_groups: item.modifier_groups })
    // Linked options resolve to an ordinary ModifierOption, so everything
    // downstream (pricing, validation, cart projection) is unchanged. A
    // recipe-sold-out option becomes an ordinary unavailable one the same way.
    return withRecipeStockAvailability(
      resolveLinkedOptions(normalized, linkedItems ?? new Map()),
      soldOutOptionIds,
    )
  }, [active, item.modifier_groups, linkedItems, soldOutOptionIds])

  const [rawSelection, setSelection] = useState<ModifierSelection>(() => getDefaultSelection(groups))
  // Availability can arrive after the defaults were seeded; what the diner
  // sees, pays for and adds is always the selection minus sold-out picks.
  const selection = useMemo(() => pruneUnavailableSelection(groups, rawSelection), [groups, rawSelection])
  const [quantity, setQuantity] = useState(1)

  // Reset selection + quantity to defaults when the item changes.
  useEffect(() => {
    setSelection(getDefaultSelection(groups))
    setQuantity(1)
    // Re-seed only when the underlying item identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  const hasDiscount = Boolean(item.discounted_price && item.discounted_price < item.price)
  const basePrice = hasDiscount ? item.discounted_price! : item.price

  const selectedOptions = useMemo(
    () => getSelectedOptions(groups, selection),
    [groups, selection],
  )

  const totalPrice = useMemo(
    () => computeModifierSubtotal(basePrice, selectedOptions, quantity),
    [basePrice, selectedOptions, quantity],
  )

  const cartFormat = useMemo(
    () => mapSelectionToCartFormat(groups, selection),
    [groups, selection],
  )

  // Edits start from what the diner sees, so a hidden sold-out pick never
  // counts against a group's limit.
  const toggle = useCallback((group: ModifierGroup, optionId: string) => {
    setSelection((prev) => toggleOption(pruneUnavailableSelection(groups, prev), group, optionId))
  }, [groups])

  const incrementQuantity = useCallback(() => {
    setQuantity((q) => Math.min(q + 1, MAX_CART_ITEM_QUANTITY))
  }, [])

  const decrementQuantity = useCallback(() => {
    setQuantity((q) => Math.max(1, q - 1))
  }, [])

  const validate = useCallback(
    () => validateAllGroups(groups, selection, quantity),
    [groups, selection, quantity],
  )

  return {
    active,
    groups,
    selection,
    quantity,
    basePrice,
    totalPrice,
    cartFormat,
    toggle,
    setOptionQuantity: (group, optionId, portions) =>
      setSelection(prev => setOptionQuantity(pruneUnavailableSelection(groups, prev), group, optionId, portions)),
    setQuantity,
    incrementQuantity,
    decrementQuantity,
    validate,
  }
}
