/**
 * Releasing a presell claim when a Convex-backed order is cancelled.
 *
 * `updateOrderStatus` releases the claim for platform-backed orders, but a
 * Convex tenant's order never passes through it: the admin sheet cancels via a
 * Convex mutation and then restores ingredients through its own action. This is
 * the presell half of that same path — without it a cancelled pre-order holds
 * its dates sold out forever, because `sold_qty` only ever moves through
 * `apply_presell_order`.
 *
 * The claim rides in `customer_data` exactly so any backend's cancel can find
 * it, so nothing here needs to know which store the order came from.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { readPresellClaim } from '@/lib/presell/checkout-schedule'
import { releasePresellForOrder } from '@/lib/presell/order-claim'

export async function releasePresellForCancelledConvexOrder(
  tenantId: string,
  customerData: unknown,
): Promise<void> {
  const claim = readPresellClaim(customerData)
  if (!claim) return

  // Best-effort: the cancellation has already happened in Convex and must not
  // be undone by a stock write that fails.
  try {
    await releasePresellForOrder(createAdminClient(), tenantId, claim.claimId, claim.lines)
  } catch {
    // `releasePresellForOrder` is itself best-effort; this guards the client
    // construction and anything else that could throw before it.
  }
}
