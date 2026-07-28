/**
 * WHEN the customer picks a branch.
 *
 * Two shapes of the same feature, chosen per tenant:
 *  - 'before' — the splash chooser gates the menu (mode tiles, then branches),
 *    so the whole visit is scoped to one branch. This is what shipped first.
 *  - 'after'  — the menu opens immediately and the branch is picked at checkout
 *    beside the order type, which suits merchants whose menu is identical
 *    everywhere and who do not want a screen between the customer and the food.
 *
 * Every existing tenant row predates the column, so an absent value MUST read
 * as 'before'. So must an unrecognised one: falling through to "neither" would
 * take the gate away without putting a checkout picker in its place, and a
 * multi-branch order would be placed against no branch at all.
 *
 * Pure and dependency-free, like `multi-branch-flag.ts`, so the server render
 * and the client overlay reach the same verdict.
 */

import {
  isMultiBranchEnabled,
  shouldPromptOutletSelection,
  type MultiBranchTenantFields,
} from '@/lib/outlets/multi-branch-flag'

export type OutletSelectionTiming = 'before' | 'after'

/** The subset of tenant columns this module needs. */
export interface OutletTimingTenantFields extends MultiBranchTenantFields {
  outlet_selection_timing?: string | null
}

/** The subset of an outlet this module needs to count what is choosable. */
interface CountableOutlet {
  is_active: boolean
}

export const DEFAULT_OUTLET_SELECTION_TIMING: OutletSelectionTiming = 'before'

/** When the customer is asked for a branch. Anything unknown means 'before'. */
export function resolveOutletSelectionTiming(
  tenant: OutletTimingTenantFields | null | undefined
): OutletSelectionTiming {
  return tenant?.outlet_selection_timing === 'after' ? 'after' : DEFAULT_OUTLET_SELECTION_TIMING
}

/**
 * Whether the branch chooser should cover the menu.
 *
 * Both this and `shouldPickOutletAtCheckout` inherit the flag-plus-two-active
 * rule from `shouldPromptOutletSelection`, so a merchant switched on mid-setup
 * keeps today's storefront under either timing.
 */
export function shouldGateMenuForOutlet(
  tenant: OutletTimingTenantFields | null | undefined,
  outlets: readonly CountableOutlet[]
): boolean {
  if (!shouldPromptOutletSelection(tenant, outlets)) return false
  return resolveOutletSelectionTiming(tenant) === 'before'
}

/** Whether checkout should ask for the branch. Never true alongside the gate. */
export function shouldPickOutletAtCheckout(
  tenant: OutletTimingTenantFields | null | undefined,
  outlets: readonly CountableOutlet[]
): boolean {
  if (!shouldPromptOutletSelection(tenant, outlets)) return false
  return resolveOutletSelectionTiming(tenant) === 'after'
}

/** Re-exported so callers need one import to answer "is this tenant multi-branch?". */
export { isMultiBranchEnabled }
