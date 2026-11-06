/**
 * "I can't find my place on the map."
 *
 * A store on Lalamove or per-km pricing can't price a delivery without a pin, so
 * a customer whose place isn't findable used to be stuck. Their order now goes
 * through at no delivery fee, marked so the merchant calls, gets the spot (a
 * pin link does it) and sets the fee. A pin always wins: the mark is ignored
 * once coordinates exist, so it can't be sent to dodge a fee on a pinned order.
 */

import { DELIVERY_PIN_SKIPPED_KEY } from '@/lib/checkout/customer-field-input'
import { toLatLng } from '@/lib/delivery-fee'
import { isPhoneFieldKey } from '@/lib/lalamove-recipient'

type Answers = Readonly<Record<string, unknown>>

export const UNPINNED_NEEDS_ADDRESS_MESSAGE = 'Please type your address so the store can find you.'
export const UNPINNED_NEEDS_CONTACT_MESSAGE = 'Please add your phone number so the store can call you for the exact spot.'

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export function isPinSkipped(answers: Answers | null | undefined): boolean {
  const data = answers ?? {}
  return data[DELIVERY_PIN_SKIPPED_KEY] === 'true' && toLatLng(data.delivery_lat, data.delivery_lng) === null
}

/**
 * Whether the server honours the mark on this order. Only a store that can't
 * price without a pin offers "I can't find my place", so a forged mark elsewhere
 * is ignored and the order is priced as usual.
 */
export function isUnpinnedDeliveryOrder(input: {
  answers: Answers | null | undefined
  isDeliveryOrder: boolean
  lalamoveEnabled: boolean
  hasDistancePricing: boolean
}): boolean {
  return input.isDeliveryOrder && (input.lalamoveEnabled || input.hasDistancePricing) && isPinSkipped(input.answers)
}

/** Why an order without a pin can't go through yet, or null. The store must be able to reach this customer. */
export function unpinnedDeliveryProblem(answers: Answers | null | undefined, contact?: string | null): string | null {
  const data = answers ?? {}
  if (!hasText(data.delivery_address)) return UNPINNED_NEEDS_ADDRESS_MESSAGE
  const canReach =
    hasText(contact) ||
    hasText(data.messenger_psid) ||
    Object.entries(data).some(([key, value]) => isPhoneFieldKey(key) && hasText(value))
  return canReach ? null : UNPINNED_NEEDS_CONTACT_MESSAGE
}
