/**
 * Translate the branch chooser's fulfillment mode into the tenant's own order
 * type, so checkout does not ask the customer a question they already answered.
 *
 * Matching is on `OrderType.type`, never on the merchant's label: a merchant is
 * free to name their dine-in type "Eat In" or "Kain Dito", and a name-based
 * match would stop working the moment they did — silently, and only for them.
 *
 * Returns null rather than guessing. A tenant with no matching type simply gets
 * today's behaviour, where checkout asks; picking "the first one" instead would
 * place a delivery order for a customer who chose to dine in.
 */

import type { OutletOrderMode } from '@/lib/outlets/nearest-outlet'
import type { OrderType } from '@/types/database'

/** Modes and order-type `type` values share a vocabulary, so this is identity. */
const MODE_TO_ORDER_TYPE: Record<OutletOrderMode, OrderType['type']> = {
  dine_in: 'dine_in',
  pickup: 'pickup',
  delivery: 'delivery',
}

export function resolveOrderTypeIdForMode(
  orderTypes: readonly OrderType[],
  mode: OutletOrderMode
): string | null {
  const wanted = MODE_TO_ORDER_TYPE[mode]

  const candidates = orderTypes
    .filter((orderType) => orderType.is_enabled && orderType.type === wanted)
    // A merchant with two dine-in types has ordered them for a reason; honour it
    // rather than depending on whatever order the query happened to return.
    .sort((a, b) => a.order_index - b.order_index)

  return candidates[0]?.id ?? null
}
