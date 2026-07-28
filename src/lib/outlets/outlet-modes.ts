/**
 * Which fulfillment tiles the branch chooser's first screen should offer.
 *
 * Derived from the branches themselves rather than configured separately: a
 * merchant who has no branch that seats customers should never be shown a
 * "Dine In" tile that leads to an empty list, and a merchant who adds table
 * service to one branch should get the tile without a second setting to find.
 */

import type { OutletOrderMode } from '@/lib/outlets/nearest-outlet'

/** The subset of a branch this module reads. */
export interface ModeCapableOutlet {
  supports_pickup: boolean
  supports_delivery: boolean
  supports_dine_in: boolean
  is_active: boolean
}

/**
 * Fixed display order, so a merchant switching a branch on or off never
 * reshuffles the tiles under a returning customer's thumb. Dine-in leads
 * because it is the most immediate: the customer is already in the shop.
 */
export const OUTLET_MODE_ORDER: readonly OutletOrderMode[] = ['dine_in', 'pickup', 'delivery'] as const

export const OUTLET_MODE_LABELS: Record<OutletOrderMode, string> = {
  dine_in: 'Dine In',
  pickup: 'Pickup',
  delivery: 'Delivery',
}

const SUPPORT_FIELD: Record<OutletOrderMode, keyof ModeCapableOutlet> = {
  dine_in: 'supports_dine_in',
  pickup: 'supports_pickup',
  delivery: 'supports_delivery',
}

/** Modes at least one active branch can actually fulfill, in display order. */
export function resolveAvailableModes(
  outlets: readonly ModeCapableOutlet[]
): OutletOrderMode[] {
  const active = outlets.filter((outlet) => outlet.is_active)
  return OUTLET_MODE_ORDER.filter((mode) => active.some((outlet) => outlet[SUPPORT_FIELD[mode]] === true))
}
