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
 *
 * `modifierDelta` is what the line's options and add-ons are worth, priced by
 * the caller from the dish's own JSON (see `order-line-modifier-pricing.ts`).
 * It may be negative ("No rice −₱10"); the floor never drops below zero.
 *
 * The submitted price is only ever a claim that can RAISE the charge. Anything
 * that is not a finite, non-negative number is refused — `NaN < floor` is
 * false, which is how a NaN price once walked straight past this check. The
 * submitted subtotal is never used: it is always `price × quantity`.
 */
export function resolveOrderLinePrice(
  line: OrderLinePriceInput,
  storeItem: StoreMenuItemPricing | undefined,
  override: OutletMenuOverrideRow | null,
  modifierDelta = 0
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

  if (!isFiniteNonNegative(line.price)) {
    return { ok: false, error: `Invalid price for ${line.menu_item_name}` }
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
  // its sale price when it is running one, plus the options they chose.
  const floor = Math.max(0, getEffectiveItemPrice(resolved) + modifierDelta)
  if (!Number.isFinite(floor)) {
    return { ok: false, error: `${line.menu_item_name} could not be priced.` }
  }

  // Above the floor is accepted — the customer only ever overpays themselves.
  const price = round(line.price < floor - PRICE_EPSILON ? floor : line.price)

  if (price > MAX_LINE_PRICE) {
    return { ok: false, error: `Price exceeds maximum for ${line.menu_item_name}` }
  }

  return { ok: true, price, subtotal: round(price * line.quantity) }
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
