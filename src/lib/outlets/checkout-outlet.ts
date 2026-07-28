/**
 * Which branch a checkout-time picker should offer, and which one stays picked.
 *
 * The splash chooser asks for the mode first and narrows branches by it. When
 * the merchant moves the question to checkout that order inverts: the order
 * type is already chosen, so IT narrows the branches. Ranking itself is not
 * reimplemented here — `rankOutlets` already knows that a dine-in branch is not
 * a pickup branch and that a walk-in mode never consults a delivery radius.
 *
 * The second job is keeping a selection honest while the customer changes their
 * mind. Switching from dine-in to delivery must drop a branch that cannot
 * deliver rather than submit the order against it, which is exactly the bug a
 * "just remember what they tapped" implementation would ship.
 *
 * Pure, so the picker and the submit-time guard cannot disagree.
 */

import { byManualOrder, rankOutlets } from '@/lib/outlets/nearest-outlet'
import type { OutletLocation, OutletOrderMode, RankedOutlet } from '@/lib/outlets/nearest-outlet'

export interface CheckoutOutletInput<T extends OutletLocation> {
  outlets: readonly T[]
  /** From the chosen order type; null before one is chosen, or for custom types. */
  mode: OutletOrderMode | null
  /** What the customer has tapped so far, if anything. */
  selectedOutletId: string | null
}

export interface CheckoutOutletResult<T extends OutletLocation> {
  /** Branches that can fulfill this order, best first. Never truncated. */
  choices: RankedOutlet<T>[]
  /** The branch to submit with, or null while the customer must still choose. */
  selectedOutletId: string | null
}

export function resolveCheckoutOutletSelection<T extends OutletLocation>({
  outlets,
  mode,
  selectedOutletId,
}: CheckoutOutletInput<T>): CheckoutOutletResult<T> {
  const choices = mode ? rankOutlets(outlets, { mode }).outlets : allActiveOutlets(outlets)

  // A selection survives only while it is still on offer — the merchant may
  // have deactivated it, or the new order type may have ruled it out.
  const isStillOffered = choices.some((entry) => entry.outlet.id === selectedOutletId)
  if (isStillOffered) return { choices, selectedOutletId }

  // One choice is not a choice; anything more, the customer decides.
  return { choices, selectedOutletId: choices.length === 1 ? choices[0].outlet.id : null }
}

/**
 * Every active branch, in the merchant's own order.
 *
 * Used before an order type is chosen: there is nothing to narrow by yet, and
 * showing an empty list would read as "no branches" rather than "not yet".
 * Shaped as `RankedOutlet` so the picker renders one thing either way; no
 * distance is known at checkout, where nothing asks for the customer's location.
 */
function allActiveOutlets<T extends OutletLocation>(
  outlets: readonly T[]
): RankedOutlet<T>[] {
  return outlets
    .filter((outlet) => outlet.is_active)
    .slice()
    .sort(byManualOrder)
    .map((outlet) => ({ outlet, distanceKm: null, withinDeliveryRadius: false }))
}
