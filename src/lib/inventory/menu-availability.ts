/**
 * What a menu item's availability means, and who decided it.
 *
 * `is_available = false` says a dish is off the menu but not why. Auto-86 and a
 * merchant tapping "Hidden" produce byte-identical rows, which is exactly the
 * ambiguity `menu_items.auto_disabled_at` was added to resolve — and until now
 * nothing read it, so the one failure this feature can cause (a bestseller
 * silently pulled) was also the one thing no screen could show.
 *
 * Pure, like `low-stock.ts` and `stock-history.ts`: the web admin and the
 * merchant app render this differently but must not disagree about what the
 * state is or what it is called. `webnegosyo-app/lib/menu-availability.ts`
 * mirrors this file for the app's separate bundle.
 */

export type MenuAvailabilityState = 'available' | 'auto-hidden' | 'hidden'

/**
 * Named for the cause a merchant can act on, not the mechanism.
 * "Auto-disabled" describes what the software did; "Out of stock" tells them
 * to go and look at the shelf.
 */
export const MENU_AVAILABILITY_LABEL: Record<MenuAvailabilityState, string> = {
  available: 'Available',
  'auto-hidden': 'Out of stock',
  hidden: 'Hidden',
}

/** The subset of a menu item this decision depends on. */
export interface MenuAvailabilityInput {
  is_available: boolean
  /** Optional: a caller whose query omitted the column must not read as auto-hidden. */
  auto_disabled_at?: string | null
}

/**
 * Whether an item is on sale, hidden by the merchant, or hidden by auto-86.
 *
 * Being on sale wins over a surviving marker. Recovery clears the marker as it
 * re-enables, so that combination should not occur — but if it ever does, what
 * a customer can actually order is the truth worth showing.
 */
export function describeMenuAvailability(item: MenuAvailabilityInput): MenuAvailabilityState {
  if (item.is_available) return 'available'
  return item.auto_disabled_at ? 'auto-hidden' : 'hidden'
}
