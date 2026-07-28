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
