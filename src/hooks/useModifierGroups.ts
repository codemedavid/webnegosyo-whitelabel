import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MenuItem, ModifierGroup } from '@/types/database'
import { MAX_CART_ITEM_QUANTITY } from '@/lib/cart-utils'
import { computeModifierSubtotal, normalizeModifierGroups } from '@/lib/modifier-groups'
import {
  getDefaultSelection,
  getSelectedOptions,
  mapSelectionToCartFormat,
  toggleOption,
  validateAllGroups,
  type CartSelectionFormat,
  type ModifierSelection,
} from '@/lib/modifier-groups-cart'
import type { SelectionValidationResult } from '@/lib/modifier-groups'

interface UseModifierGroupsOptions {
  item: MenuItem
}

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
export function useModifierGroups({ item }: UseModifierGroupsOptions): UseModifierGroupsResult {
  const active = Boolean(item.modifier_groups && item.modifier_groups.length > 0)

  const groups = useMemo(
    () => (active ? normalizeModifierGroups({ modifier_groups: item.modifier_groups }) : []),
    [active, item.modifier_groups],
  )

  const [selection, setSelection] = useState<ModifierSelection>(() => getDefaultSelection(groups))
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

  const toggle = useCallback((group: ModifierGroup, optionId: string) => {
    setSelection((prev) => toggleOption(prev, group, optionId))
  }, [])

  const incrementQuantity = useCallback(() => {
    setQuantity((q) => Math.min(q + 1, MAX_CART_ITEM_QUANTITY))
  }, [])

  const decrementQuantity = useCallback(() => {
    setQuantity((q) => Math.max(1, q - 1))
  }, [])

  const validate = useCallback(
    () => validateAllGroups(groups, selection),
    [groups, selection],
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
    setQuantity,
    incrementQuantity,
    decrementQuantity,
    validate,
  }
}
