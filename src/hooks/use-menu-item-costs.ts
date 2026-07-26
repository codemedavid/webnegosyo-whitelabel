'use client'

/**
 * Loads one menu item's recipe-derived costs for the product editor.
 *
 * This is the client-side caller for `getMenuItemCostAction`. It is deliberately
 * forgiving: an unsaved item, a tenant without inventory, a failed action, or a
 * thrown request all resolve to "no recipe costs", because a cost display that
 * cannot load must never take the product form down with it. The costing
 * service itself still throws on a fetch failure — that distinction is
 * intentional, and this is the layer that decides the editor keeps working.
 */

import { useEffect, useState } from 'react'
import { getMenuItemCostAction } from '@/app/actions/inventory'

export interface MenuItemCosts {
  /** Recipe-derived cost per modifier option id. Empty when nothing is costed. */
  optionRecipeCosts: Record<string, number>
  /** Recipe-derived cost of the item's base configuration, if it has a recipe. */
  baseRecipeCost: number | null
  isLoading: boolean
}

const NO_COSTS: MenuItemCosts = { optionRecipeCosts: {}, baseRecipeCost: null, isLoading: false }

export function useMenuItemCosts(
  tenantId: string,
  menuItemId: string | undefined,
  inventoryEnabled: boolean,
): MenuItemCosts {
  const [costs, setCosts] = useState<MenuItemCosts>(NO_COSTS)

  useEffect(() => {
    if (!menuItemId || !inventoryEnabled) {
      setCosts(NO_COSTS)
      return
    }

    let isCurrent = true
    setCosts((prev) => ({ ...prev, isLoading: true }))

    getMenuItemCostAction(tenantId, menuItemId)
      .then((result) => {
        if (!isCurrent) return
        if (!result.success) {
          setCosts(NO_COSTS)
          return
        }
        setCosts({
          optionRecipeCosts: result.data.modifierOptionCosts,
          baseRecipeCost: result.data.baseCost,
          isLoading: false,
        })
      })
      .catch(() => {
        if (isCurrent) setCosts(NO_COSTS)
      })

    return () => {
      isCurrent = false
    }
  }, [tenantId, menuItemId, inventoryEnabled])

  return costs
}
