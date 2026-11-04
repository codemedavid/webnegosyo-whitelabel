/**
 * Whether a customer can order a dish.
 *
 * `is_available = false` used to be enforced as a query filter — the storefront
 * simply never fetched the row. That made "out of stock" and "deleted" the same
 * thing to a customer, and left the "Unavailable" overlay every card template
 * renders as unreachable code. The flag now means out of stock: the dish stays
 * on the menu, marked, and unorderable.
 *
 * Enforcing that is a decision rather than a filter, so it needs one home. This
 * is it. `src/lib/inventory/menu-availability.ts` answers the neighbouring but
 * different question — *who* took the dish off, which only merchants see.
 */

import { STOCK_HINT_THRESHOLD } from '@/lib/inventory/stepper-cap'

/** The subset of a menu item this decision depends on. */
export interface MenuItemOrderabilityInput {
  is_available?: boolean | null
}

/**
 * Defaults to orderable when the column is absent.
 *
 * Several call sites project a narrower column list than the full row. Reading
 * a missing `is_available` as "out of stock" would turn a dropped projection
 * into an entire menu no one can order from — the failure mode that has already
 * bitten modifier groups and mobile branding overrides here. An over-permissive
 * add is the cheaper mistake: `useCart.refreshCartItems` re-checks against the
 * database and drops anything that has since gone out of stock.
 */
export function isMenuItemOrderable(item: MenuItemOrderabilityInput): boolean {
  return item.is_available !== false
}

/** What a menu card shows about stock. */
export interface MenuCardStock {
  /** The dish can be added (switched on AND the kitchen can make at least one). */
  isOrderable: boolean
  /** Switched on, but the kitchen can make none right now ("Sold out"). */
  isSoldOut: boolean
  /** Few left: the number to show ("Only N left"), else null. */
  onlyLeft: number | null
}

/**
 * The card's stock state from whether the dish is switched on
 * (`isMenuItemOrderable`, passed in so callers keep calling the one rule) and
 * its producible ceiling
 * (`/api/inventory/ceilings`; `null` = untracked or unknown — a missing branch
 * shelf row or a never-counted ingredient — which never limits a dish).
 * The low-stock threshold is the stepper's (`STOCK_HINT_THRESHOLD`) so the
 * card and the stepper say the same thing. Checkout stays the hard refusal.
 */
export function resolveMenuCardStock(
  isSwitchedOn: boolean,
  ceiling: number | null,
): MenuCardStock {
  if (!isSwitchedOn) return { isOrderable: false, isSoldOut: false, onlyLeft: null }
  if (ceiling === null || !Number.isFinite(ceiling)) return { isOrderable: true, isSoldOut: false, onlyLeft: null }
  const whole = Math.floor(ceiling)
  if (whole <= 0) return { isOrderable: false, isSoldOut: true, onlyLeft: null }
  return { isOrderable: true, isSoldOut: false, onlyLeft: whole <= STOCK_HINT_THRESHOLD ? whole : null }
}
