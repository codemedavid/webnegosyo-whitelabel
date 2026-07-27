/**
 * What a menu item's availability means, and who decided it.
 *
 * Mirror of `src/lib/inventory/menu-availability.ts`. The app is a separate
 * bundle and cannot import from the web app, so this is a deliberate copy —
 * `lib/inventory-stock.ts` mirrors `low-stock.ts` for the same reason. The
 * wording is locked to the web copy by `menu-availability.test.ts`, so a
 * relabel on either side fails rather than drifting.
 *
 * `is_available = false` says a dish is off the menu but not why. Auto-86 and
 * a merchant tapping the switch produce identical rows; `auto_disabled_at` is
 * what tells them apart.
 */

export type MenuAvailabilityState = "available" | "auto-hidden" | "hidden";

/**
 * Named for the cause a merchant can act on, not the mechanism.
 * "Auto-disabled" describes what the software did; "Out of stock" tells them
 * to go and look at the shelf.
 */
export const MENU_AVAILABILITY_LABEL: Record<MenuAvailabilityState, string> = {
  available: "Available",
  "auto-hidden": "Out of stock",
  hidden: "Hidden",
};

/** The subset of a product this decision depends on. */
export interface MenuAvailabilityInput {
  is_available: boolean;
  /** Optional: a caller whose query omitted the column must not read as auto-hidden. */
  auto_disabled_at?: string | null;
}

/**
 * Whether an item is on sale, hidden by the merchant, or hidden by auto-86.
 *
 * Being on sale wins over a surviving marker. Recovery clears the marker as it
 * re-enables, so that combination should not occur — but if it ever does, what
 * a customer can actually order is the truth worth showing.
 */
export function describeMenuAvailability(
  item: MenuAvailabilityInput
): MenuAvailabilityState {
  if (item.is_available) return "available";
  return item.auto_disabled_at ? "auto-hidden" : "hidden";
}
