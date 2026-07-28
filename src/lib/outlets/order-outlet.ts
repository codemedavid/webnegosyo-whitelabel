/**
 * Which branch an order belongs to.
 *
 * The branch a customer picked lives in their browser, so the id reaches the
 * server as a claim rather than a fact. Everything here exists to turn that
 * claim into something safe to write down: it is honoured only when the tenant
 * opted in, and only when it names one of that tenant's own branches.
 *
 * Nothing here throws or queries. An order that cannot be attributed to a
 * branch is still an order.
 */

/** The branch fields needed to validate a claim — the tenant's own branches. */
export interface OrderOutletCandidate {
  id: string
  name: string
  is_active: boolean
}

/** A branch the server is willing to record against an order. */
export interface OrderOutletContext {
  id: string
  name: string
}

export interface OrderOutletInput {
  isEnabled: boolean
  /** What the customer's browser claims they chose. */
  requestedOutletId?: string | null
  /** The tenant's branches. Already scoped to the tenant by the caller's query. */
  outlets: readonly OrderOutletCandidate[]
}

export function resolveOrderOutlet({
  isEnabled,
  requestedOutletId,
  outlets,
}: OrderOutletInput): OrderOutletContext | null {
  if (!isEnabled) return null

  const wanted = typeof requestedOutletId === 'string' ? requestedOutletId.trim() : ''
  if (wanted === '') return null

  // Not in the tenant's own list means it is somebody else's branch, or none at
  // all. Either way it does not go onto this merchant's order.
  const match = outlets.find((outlet) => outlet.id === wanted)
  if (!match) return null

  // A branch hidden between menu and checkout still took the sale; recording it
  // is more honest than recording nothing. `is_active` is deliberately not a
  // filter here — it governs which branches are *offered*, not which ones can
  // be credited.
  return { id: match.id, name: match.name }
}

/** Keys the branch travels under inside `customer_data`. */
export const ORDER_OUTLET_ID_KEY = 'outlet_id'
export const ORDER_OUTLET_NAME_KEY = 'outlet_name'

/**
 * Stamp the resolved branch onto the order's `customer_data`.
 *
 * Convex and tenant-owned Supabase projects run schemas this app cannot migrate
 * on demand, so there is no column to write to there. `customer_data` is the
 * carrier the advance-order schedule and the payment proof already use for
 * exactly this reason, and it needs no redeploy to start working.
 *
 * With no branch resolved the caller's payload is returned *as it is* — same
 * object, no added key — so an order placed by a tenant without the feature is
 * byte-for-byte what it is today.
 */
export function withOrderOutlet(
  customerData: Record<string, unknown> | undefined,
  outlet: OrderOutletContext | null
): Record<string, unknown> | undefined {
  if (!outlet) return customerData

  return {
    ...(customerData ?? {}),
    // Written last so a client-supplied `outlet_id` cannot survive.
    [ORDER_OUTLET_ID_KEY]: outlet.id,
    [ORDER_OUTLET_NAME_KEY]: outlet.name,
  }
}
