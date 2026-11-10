'use client'

import { useCallback, useState } from 'react'
import type { useCart } from '@/hooks/useCart'
import { usePresellCartCaps } from '@/hooks/use-presell-cart-caps'
import { useStockCartCaps } from '@/hooks/use-stock-cart-caps'
import type { CartBundleItem, CartItem } from '@/types/database'

type CartCommandsOptions = {
  tenantId: string | undefined
  /** For the shopper's stored branch (stock ceilings read that shelf). */
  tenantSlug?: string
  /** `tenants.inventory_enabled`; absent = no stock caps (today's behaviour). */
  isInventoryEnabled?: boolean
  cart: Pick<ReturnType<typeof useCart>, 'items' | 'updateQuantity' | 'removeItem' | 'updateItemConfiguration' | 'updateBundleQuantity' | 'removeBundleFromCart'>
}

/** Line-specific edits and confirmation state shared by cart pages and drawers. */
export function useCartCommands({ tenantId, tenantSlug, isInventoryEnabled = false, cart }: CartCommandsOptions) {
  const { items, updateQuantity, removeItem, updateItemConfiguration, updateBundleQuantity, removeBundleFromCart } = cart
  const [itemToRemove, setItemToRemove] = useState<CartItem | null>(null)
  const [itemToEdit, setItemToEdit] = useState<CartItem | null>(null)
  const [bundleToRemove, setBundleToRemove] = useState<CartBundleItem | null>(null)
  const presellCaps = usePresellCartCaps(tenantId, items)
  const stockCaps = useStockCartCaps({ tenantId, tenantSlug, isInventoryEnabled, items })
  const { canIncreaseItem: canIncreaseForPresell } = presellCaps
  const { canIncreaseForStock } = stockCaps
  // "+" stops where the presell date OR the kitchen's stock ends.
  const canIncreaseItem = useCallback(
    (item: CartItem) => canIncreaseForPresell(item) && canIncreaseForStock(item),
    [canIncreaseForPresell, canIncreaseForStock],
  )
  const caps = { presellHintFor: presellCaps.presellHintFor, stockHintFor: stockCaps.stockHintFor, canIncreaseItem }

  const handleDecreaseQuantity = (item: CartItem) => {
    if (item.quantity <= 1) setItemToRemove(item)
    else updateQuantity(item.id, item.quantity - 1)
  }
  const handleConfirmRemove = () => {
    if (itemToRemove) removeItem(itemToRemove.id)
    setItemToRemove(null)
  }
  const handleCancelRemove = () => setItemToRemove(null)

  const handleUpdateItem = useCallback((
    cartItemId: string,
    menuItem: Parameters<typeof updateItemConfiguration>[1],
    variationOrVariations: Parameters<typeof updateItemConfiguration>[2],
    addons: Parameters<typeof updateItemConfiguration>[3],
    quantity: number,
    specialInstructions?: string,
  ) => {
    const presellDate = items.find((line) => line.id === cartItemId)?.presell_date
    updateItemConfiguration(cartItemId, menuItem, variationOrVariations, addons, quantity, specialInstructions,
      // Ordinary edits retain their six-argument contract; presell dates survive edits.
      ...(presellDate ? [presellDate] : []))
    setItemToEdit(null)
  }, [items, updateItemConfiguration])

  const handleDecreaseBundleQuantity = (bundle: CartBundleItem) => {
    if (bundle.quantity <= 1) setBundleToRemove(bundle)
    else updateBundleQuantity(bundle.id, bundle.quantity - 1)
  }
  const handleConfirmBundleRemove = () => {
    if (bundleToRemove) removeBundleFromCart(bundleToRemove.id)
    setBundleToRemove(null)
  }

  return { ...caps, itemToRemove, setItemToRemove, itemToEdit, setItemToEdit,
    bundleToRemove, setBundleToRemove, handleDecreaseQuantity, handleConfirmRemove,
    handleCancelRemove, handleUpdateItem, handleDecreaseBundleQuantity, handleConfirmBundleRemove }
}
