/**
 * Replacing a Lalamove booking that died without delivering.
 *
 * A cancelled booking used to keep its `lalamove_order_id` on the order
 * forever, and book and requote both refuse while that id is set — so one
 * accidental Cancel left the order with no rider and no way to get one. A
 * requote now retires a dead booking (see `isRebookableLalamoveStatus`) and
 * the order becomes bookable again. A live booking is still refused: quoting
 * under it would end in a second rider on the road.
 *
 * Shared by the server action (web dashboard) and /api/lalamove (merchant
 * app). The Convex deployment applies the same rule in its own lalamove.ts.
 */

import { isRebookableLalamoveStatus } from '@/lib/lalamove-status'
import type { Database } from '@/types/database'

type OrderUpdate = Database['public']['Tables']['orders']['Update']

export type RequoteGate =
  | { ok: true; /** The dead booking being replaced, if any. */ retiredOrderId: string | null }
  | { ok: false; error: string }

export function resolveRequoteGate(order: {
  lalamoveOrderId: string | null | undefined
  lalamoveStatus: string | null | undefined
}): RequoteGate {
  const bookedId = order.lalamoveOrderId?.trim()
  if (!bookedId) return { ok: true, retiredOrderId: null }

  if (isRebookableLalamoveStatus(order.lalamoveStatus)) {
    return { ok: true, retiredOrderId: bookedId }
  }

  const status = order.lalamoveStatus?.toUpperCase()
  if (status === 'COMPLETED' || status === 'DELIVERED') {
    return { ok: false, error: 'This delivery was already completed — there is nothing to rebook' }
  }
  // Includes a booking with no recorded status: it may well be live.
  return {
    ok: false,
    error: 'A delivery is already booked for this order — cancel it before re-quoting',
  }
}

/**
 * The order update that swaps a dead booking for a fresh quotation. Every
 * booking field is cleared: a leftover driver name or tracking link would show
 * the merchant a rider who is no longer coming.
 */
export function retireDeadBookingPatch(quotationId: string): OrderUpdate {
  return {
    lalamove_quotation_id: quotationId,
    lalamove_order_id: null,
    lalamove_status: null,
    lalamove_tracking_url: null,
    lalamove_driver_id: null,
    lalamove_driver_name: null,
    lalamove_driver_phone: null,
  }
}
