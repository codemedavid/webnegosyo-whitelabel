/**
 * The lines a checkout voucher preview must be priced against.
 *
 * The preview is a rendering hint — `createOrderAction` re-prices from the
 * codes themselves — but it is the number the customer decides on, so the two
 * have to agree. They agree only if they see the same cart.
 *
 * The order does not: `useCheckout` sends regular cart items PLUS every bundle
 * slot flattened by `flattenBundleOrderItems`. The preview used to send the
 * regular items alone, so a cart holding a bundle previewed a discount computed
 * against a smaller subtotal than the one actually charged — visible as the
 * total moving between the checkout summary and "Order Placed!".
 *
 * Flattening goes through `flattenBundleOrderItems` rather than repeating its
 * arithmetic, so the two can no longer drift apart line by line.
 */

import { flattenBundleOrderItems } from '@/lib/bundle-order-items'
import type { CartBundleItem, CartItem } from '@/types/database'

/** One priceable line, in the shape `validateVoucherAction` accepts. */
export interface VoucherPreviewLine {
  id: string
  menuItemId: string
  /**
   * Null for bundle slots: the cart never carries a slot's category. Claiming
   * one would let a category-scoped voucher preview a discount the server will
   * not grant, so the action resolves these from the database instead.
   */
  categoryId: string | null
  quantity: number
  subtotal: number
}

export function buildVoucherPreviewLines(
  items: readonly CartItem[],
  bundleItems: readonly CartBundleItem[],
): VoucherPreviewLine[] {
  const itemLines = items.map((item) => ({
    id: item.id,
    menuItemId: item.menu_item.id,
    categoryId: item.menu_item.category_id ?? null,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }))

  // Bundle slots have no id of their own that survives a re-render, and the
  // same dish can sit in two bundles at once. The index is the line identity —
  // it only has to be unique inside one evaluation, which is the same rule
  // `priceOrderWithVouchers` applies server-side.
  const bundleLines = flattenBundleOrderItems(bundleItems).map((line, index) => ({
    id: `bundle-line-${index}`,
    menuItemId: line.menu_item_id,
    categoryId: null,
    quantity: line.quantity,
    subtotal: line.subtotal,
  }))

  return [...itemLines, ...bundleLines]
}
