/**
 * Whether checkout has a fulfillment question to ask.
 *
 * `useCheckout` already selects the sole order type the moment it loads, so a
 * dine-in-only restaurant renders "How would you like to receive your order?"
 * above a single tile that is already chosen. Nothing is asked and nothing can
 * be changed — it is a step made of an answer. On the branch-QR flow, where the
 * link answers the branch too, it is the last thing between the scan and the
 * form.
 *
 * The count alone is not the rule. That same section hosts the ASAP-or-schedule
 * choice and the date and time slots, so a single order type that takes advance
 * orders still has a real question in it; hiding it would remove the only way
 * to place a pre-order. Ask when there is something to answer.
 *
 * The stored flag is not the whole answer either. A presell cart forces
 * scheduling on at runtime over an order type that never scheduled, and the
 * scheduler lives inside this section — so the caller passes that verdict in
 * rather than letting this read a config that is already out of date.
 *
 * Pure so every checkout design reaches the same verdict — the section exists
 * five times over, and they must not disagree about whether it is a question.
 */

import { getAdvanceOrderConfig } from '@/lib/advance-order-utils'
import type { OrderType } from '@/types/database'

interface FulfillmentChoiceOptions {
  /**
   * Scheduling forced on from outside the order type — today, a presell cart.
   * The stored `advance_order_enabled` says nothing about it.
   */
  isSchedulingForced?: boolean
}

export function shouldAskFulfillmentMethod(
  orderTypes: readonly OrderType[],
  { isSchedulingForced = false }: FulfillmentChoiceOptions = {},
): boolean {
  // Empty is "not loaded yet", not "no choices". An empty section is not a
  // question either way, and the existing loading state covers the moment —
  // and a forced flag must not conjure a section out of an unloaded page.
  if (orderTypes.length === 0) return false
  if (orderTypes.length > 1) return true

  return isSchedulingForced || getAdvanceOrderConfig(orderTypes[0]).enabled
}
