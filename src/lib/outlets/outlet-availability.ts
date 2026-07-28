/**
 * What a storefront does when it cannot load a merchant's branches.
 *
 * This module resolves a conflict between two earlier decisions, both correct:
 *
 * - **Phase 1, Decision E** — an outlet read failure must fail loudly, because
 *   degrading to "no branches" renders the single-outlet flow for a
 *   multi-branch merchant and sends the order to the wrong kitchen.
 * - **Phase 3** — `menu-server.tsx` must not throw on a failed outlet query,
 *   because a throw there blanks the whole menu. That is the regression commit
 *   `38b4ede` already fixed once for the dish query.
 *
 * The resolution is to stop treating "show the menu" and "accept an order" as
 * one question. The menu still renders. Ordering is what stops. Expressing that
 * as a value rather than a `throw` is what lets both the server component and
 * the checkout read the same decision.
 *
 * Fails **open**: anything other than a confirmed failure at an opted-in tenant
 * lets the customer order. A tenant that never enabled branches never ran the
 * query and so can never be blocked by its failure.
 */

/** Whether the storefront knows which branches it has. */
export type OutletAvailabilityState = 'ok' | 'branches_unavailable'

/**
 * Shown to the customer when branches cannot be loaded. Deliberately free of
 * "error", "failed" and "query" — the customer cannot act on any of that, and
 * the merchant's storefront should not read like a stack trace.
 */
export const BRANCHES_UNAVAILABLE_MESSAGE =
  "We can't load this restaurant's branches right now. Please try again in a moment."

export interface OutletAvailabilityInput {
  /** `tenants.multi_branch_enabled` — false for every tenant that never opted in. */
  isEnabled: boolean
  /** True when the outlets query returned an error. */
  didLoadFail: boolean
  /** How many branches did come back. A partial list still counts as a failure. */
  outletCount: number
}

export interface OutletAvailabilityResult {
  /** False only when an opted-in tenant's branches could not be loaded. */
  canOrder: boolean
  state: OutletAvailabilityState
  /** Customer-facing explanation, or null when there is nothing to say. */
  message: string | null
}

const ORDERING_ALLOWED: OutletAvailabilityResult = Object.freeze({
  canOrder: true,
  state: 'ok',
  message: null,
})

export function resolveOutletAvailability(
  input: OutletAvailabilityInput | null | undefined
): OutletAvailabilityResult {
  // No input at all is not a reason to close a shop.
  if (!input) return ORDERING_ALLOWED

  // A tenant without the feature never issued the query, so it cannot be
  // blocked by that query's failure.
  if (!input.isEnabled) return ORDERING_ALLOWED

  if (input.didLoadFail) {
    return {
      canOrder: false,
      state: 'branches_unavailable',
      message: BRANCHES_UNAVAILABLE_MESSAGE,
    }
  }

  // An opted-in tenant with no branches configured yet is not broken — there is
  // no wrong kitchen to send the order to, because there is only one. Blocking
  // here would close a shop the moment the merchant ticked the box.
  return ORDERING_ALLOWED
}
