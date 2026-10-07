/**
 * The cart, as the order lines `createOrderAction` and the preflights take.
 *
 * Lifted out of `useCheckout.handleCheckout`, where it was an inline map with a
 * hand-written 16-field type. Pure: the same cart always yields the same
 * payload, so the exact shape the server receives is unit-testable.
 *
 * Prices here are display hints — the server re-prices every line (see
 * src/lib/checkout/price-order-lines.ts) and clamps subtotal to
 * price × quantity.
 */
import { addonLabel } from '@/lib/addon-quantity'
import { flattenBundleOrderItems, type BundleOrderItem } from '@/lib/bundle-order-items'
import { calculateCartItemUnitPrice, getEffectiveItemPrice } from '@/lib/cart-utils'
import { extractSelectionIds } from '@/lib/inventory/order-item-selection'
import type { CartBundleItem, CartItem } from '@/types/database'

/** One regular cart line, in the shape `createOrderAction` order items expect. */
export interface CartLineOrderItem {
  menu_item_id: string
  menu_item_name: string
  variation?: string
  addons: string[]
  quantity: number
  price: number
  subtotal: number
  special_instructions?: string
  option_ids: string[]
  addon_ids: string[]
  addon_quantities?: Record<string, number>
  isUpsellItem?: true
  /** YYYY-MM-DD pickup date for a presell line. */
  presell_date?: string
}

export type CheckoutOrderItem = CartLineOrderItem | BundleOrderItem

export interface StockPreflightLine {
  menuItemId: string
  quantity: number
}

export interface PresellPreflightLine extends StockPreflightLine {
  presellDate: string | undefined
}

function variationText(item: CartItem): string {
  if (item.selected_variation) return item.selected_variation.name
  if (item.selected_variations) return Object.values(item.selected_variations).map(option => option.name).join(', ')
  return ''
}

/**
 * One cart line as an order item. The display strings flatten the selection;
 * the ids beside them let inventory spend what an option actually adds.
 */
export function buildCartLineOrderItem(item: CartItem): CartLineOrderItem {
  // Includes add-ons; the server clamps subtotal to price × quantity.
  const price = calculateCartItemUnitPrice(
    getEffectiveItemPrice(item.menu_item),
    item.selected_variations ?? item.selected_variation,
    item.selected_addons
  )
  const selection = extractSelectionIds(item)

  return {
    menu_item_id: item.menu_item.id,
    menu_item_name: item.menu_item.name,
    variation: variationText(item) || undefined,
    addons: item.selected_addons.map(addonLabel),
    quantity: item.quantity,
    price,
    subtotal: item.subtotal,
    special_instructions: item.special_instructions,
    option_ids: selection.optionIds,
    addon_ids: selection.addonIds,
    ...(selection.addonQuantities ? { addon_quantities: selection.addonQuantities } : {}),
    ...(item.upsellSource ? { isUpsellItem: true as const } : {}),
    ...(item.presell_date ? { presell_date: item.presell_date } : {}),
  }
}

/** Every cart line, then every bundle slot (with provenance and selection ids). */
export function buildOrderItemsPayload(
  items: readonly CartItem[],
  bundleItems: readonly CartBundleItem[]
): CheckoutOrderItem[] {
  return [...items.map(buildCartLineOrderItem), ...flattenBundleOrderItems(bundleItems)]
}

/** What the stock preflight asks about: each line's menu item and quantity. */
export function toStockPreflightLines(items: readonly CartItem[]): StockPreflightLine[] {
  return items.map(item => ({ menuItemId: item.menu_item.id, quantity: item.quantity }))
}

/** What the presell preflight asks about: the same, with each line's pickup date. */
export function toPresellPreflightLines(items: readonly CartItem[]): PresellPreflightLine[] {
  return items.map(item => ({ menuItemId: item.menu_item.id, quantity: item.quantity, presellDate: item.presell_date }))
}
