'use client'

import { useCallback, useMemo } from 'react'
import { selectCeiling, useStockCeilings } from '@/hooks/use-stock-ceilings'
import { readOutletSelection } from '@/lib/outlets/outlet-selection'
import { canAddMoreOfDish, countDishInCart, describeCartLineStock } from '@/lib/inventory/cart-stock-caps'
import type { CartItem } from '@/types/database'

interface StockCartCapsOptions {
  tenantId: string | null | undefined
  tenantSlug?: string
  /** `tenants.inventory_enabled`: without it nothing is read and nothing is capped. */
  isInventoryEnabled: boolean
  items: CartItem[]
}

/**
 * The cart page's "+" told where the kitchen's stock ends, and the line under
 * a row ("Only 2 left"). Thin glue over the same ceilings read as the product
 * page (`useStockCeilings`, the shopper's stored branch); every decision lives
 * in `cart-stock-caps.ts`. A failed read = no ceilings = today's behaviour.
 */
export function useStockCartCaps({ tenantId, tenantSlug, isInventoryEnabled, items }: StockCartCapsOptions) {
  const outletId = useMemo(() => {
    if (!tenantSlug || typeof window === 'undefined') return null
    return readOutletSelection(window.localStorage, tenantSlug, Date.now())?.outletId ?? null
  }, [tenantSlug])
  const ceilings = useStockCeilings(isInventoryEnabled ? tenantId : null, outletId)

  const canIncreaseForStock = useCallback(
    (item: CartItem): boolean =>
      canAddMoreOfDish(selectCeiling(ceilings, item.menu_item.id), countDishInCart(items, item.menu_item.id)),
    [ceilings, items],
  )

  const stockHintFor = useCallback(
    (item: CartItem): string | null =>
      describeCartLineStock(selectCeiling(ceilings, item.menu_item.id), countDishInCart(items, item.menu_item.id)),
    [ceilings, items],
  )

  return { canIncreaseForStock, stockHintFor }
}
