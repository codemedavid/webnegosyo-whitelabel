/**
 * The last check before an order row is written on the platform backend.
 *
 * By the time `createOrder` runs, `createOrderAction` has priced every line at
 * the price the customer was shown — effective (sale-aware) price, branch
 * override, options and add-ons. This used to re-floor each line against
 * `menu_items.price`, the LIST price, which silently raised every sale-priced
 * and branch-cheaper line back up, and it let a NaN price through because
 * `NaN < x` is false. It now only enforces invariants: the dish belongs to the
 * tenant, the quantity and price are sane numbers, and the subtotal is
 * `price × quantity`.
 *
 * Pure. Returns new line objects; throws on a violation.
 */

import { MAX_LINE_PRICE, MAX_LINE_QUANTITY } from '@/lib/order-line-price-floor'

export interface InvariantOrderLine {
  menu_item_id: string
  menu_item_name: string
  price: number
  quantity: number
  subtotal: number
}

const round = (value: number): number => Math.round(value * 100) / 100

export function verifyPricedOrderLines<T extends InvariantOrderLine>(
  items: readonly T[],
  knownMenuItemIds: ReadonlySet<string>
): T[] {
  return items.map((item) => {
    if (!knownMenuItemIds.has(item.menu_item_id)) {
      throw new Error(`Menu item not found: ${item.menu_item_id}`)
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_LINE_QUANTITY) {
      throw new Error(`Invalid quantity for ${item.menu_item_name}: must be between 1 and ${MAX_LINE_QUANTITY}`)
    }
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) {
      throw new Error(`Invalid price for ${item.menu_item_name}`)
    }
    if (item.price > MAX_LINE_PRICE) {
      throw new Error(`Price exceeds maximum allowed value for ${item.menu_item_name}`)
    }
    return { ...item, subtotal: round(item.price * item.quantity) }
  })
}
