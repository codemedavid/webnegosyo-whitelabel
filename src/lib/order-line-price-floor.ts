/**
 * What the server will charge for one order line.
 *
 * A submitted price cannot be trusted — anyone can post JSON — so
 * `createOrderAction` floors every line at the price the database says. The
 * floor is both the protection and the hazard: computed from a price the
 * customer was never shown, it silently OVERCHARGES, and they find out on the
 * receipt.
 *
 * The floor was wrong in two ways before this module existed, both the same
 * mistake:
 *
 *  1. It read `menu_items.price`, the list price, while the cart charges
 *     `getEffectiveItemPrice` — so every line of a discounted item was raised
 *     back to list price after checkout.
 *  2. It knew nothing about branches, so a branch selling below the store-wide
 *     price had its orders re-priced upward — which is per-branch pricing not
 *     working at all in the direction merchants most want it.
 *
 * So the floor is decided once, here, from the same resolution the storefront
 * showed the customer: store-wide item, overridden by the branch they chose.
 * Pure — no queries, no throws, no mutation of the submitted line.
 */

import { getEffectiveItemPrice } from '@/lib/cart-utils'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import {
  isItemListedAtOutlet,
  resolveItemForOutlet,
  type OutletMenuOverrideRow,
} from '@/lib/outlets/outlet-menu-overrides'

/** Highest per-unit price any real menu could carry. */
export const MAX_LINE_PRICE = 1_000_000
/** Matches `MAX_CART_ITEM_QUANTITY`; a bigger order is a mistake or an attack. */
export const MAX_LINE_QUANTITY = 99
/** Currency rounding slack, so float noise is not read as tampering. */
const PRICE_EPSILON = 0.01
const SUBTOTAL_EPSILON = 0.02

/** The submitted line, as the checkout posts it. */
export interface OrderLinePriceInput {
  menu_item_id: string
  menu_item_name: string
  price: number
  quantity: number
  subtotal: number
}

/** The store-wide truth about the dish, straight from `menu_items`. */
export interface StoreMenuItemPricing {
  id: string
  price: number
  discounted_price?: number | null
  is_available?: boolean | null
}

export type OrderLinePriceResult =
  | { ok: true; price: number; subtotal: number }
  | { ok: false; error: string }

const round = (value: number): number => Math.round(value * 100) / 100

/**
 * Price one line, or refuse it.
 *
 * `storeItem` is undefined when the tenant has no such dish. `override` is the
 * chosen branch's opinion, or null when there is no branch or it has none —
 * which is the single-location case and must behave exactly as it always has.
 */
export function resolveOrderLinePrice(
  line: OrderLinePriceInput,
  storeItem: StoreMenuItemPricing | undefined,
  override: OutletMenuOverrideRow | null
): OrderLinePriceResult {
  if (!storeItem) {
    return { ok: false, error: `Menu item not found: ${line.menu_item_name}` }
  }

  if (
    !Number.isInteger(line.quantity) ||
    line.quantity < 1 ||
    line.quantity > MAX_LINE_QUANTITY
  ) {
    return { ok: false, error: `Invalid quantity for ${line.menu_item_name}` }
  }

  if (!isItemListedAtOutlet(override)) {
    return {
      ok: false,
      error: `${line.menu_item_name} is not offered at the branch you selected.`,
    }
  }

  const resolved = resolveItemForOutlet(storeItem, override)

  if (!isMenuItemOrderable(resolved)) {
    return { ok: false, error: `${line.menu_item_name} is currently unavailable.` }
  }

  // The floor is what the customer was quoted for one unit: the branch's price,
  // and its sale price when it is running one.
  const floor = getEffectiveItemPrice(resolved)

  // Above the floor is legitimate — variations and add-ons add to the base.
  const price = line.price < floor - PRICE_EPSILON ? floor : line.price

  if (price > MAX_LINE_PRICE) {
    return { ok: false, error: `Price exceeds maximum for ${line.menu_item_name}` }
  }

  const expectedSubtotal = round(price * line.quantity)
  const subtotal =
    Math.abs(round(line.subtotal) - expectedSubtotal) > SUBTOTAL_EPSILON
      ? expectedSubtotal
      : round(line.subtotal)

  return { ok: true, price, subtotal }
}
