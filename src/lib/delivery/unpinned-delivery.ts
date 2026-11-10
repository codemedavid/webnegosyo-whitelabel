/**
 * "I can't find my place on the map" — TURNED OFF (owner, 2026-11-09).
 *
 * It let a customer on a Lalamove / per-km store send a delivery order with no
 * pin, at no delivery fee and outside any radius check, for the store to call
 * and price later. Checkout no longer offers it and createOrderAction ignores
 * the mark. What remains reads orders placed while it was on, so the merchant
 * still sees "no pin, no fee charged" on them. A pin always wins over the mark.
 */

import { DELIVERY_PIN_SKIPPED_KEY } from '@/lib/checkout/customer-field-input'
import { toLatLng } from '@/lib/delivery-fee'

type Answers = Readonly<Record<string, unknown>>

export function isPinSkipped(answers: Answers | null | undefined): boolean {
  const data = answers ?? {}
  return data[DELIVERY_PIN_SKIPPED_KEY] === 'true' && toLatLng(data.delivery_lat, data.delivery_lng) === null
}
