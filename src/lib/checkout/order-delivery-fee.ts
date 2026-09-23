/**
 * Which delivery fee an order is billed — decided on the server.
 *
 * The checkout has exactly two fee sources (see `resolveDeliveryQuotePlan`):
 *  - a Lalamove quotation, when the tenant has Lalamove on;
 *  - the tenant's distance formula, otherwise, when that is on.
 * Anything else carries no fee. The distance fee is recomputed here from the
 * store and destination coordinates; the browser's number is ignored.
 *
 * RESIDUAL RISK: a Lalamove fee cannot be recomputed without re-quoting
 * Lalamove (and a failed re-quote after the optimistic confirmation screen
 * would be an invisible refusal), so it is range-checked only. A forged
 * request can still under-state a Lalamove fee within [0, MAX_DELIVERY_FEE].
 *
 * Pure: the caller supplies config and coordinates.
 */

import { quoteDistanceDelivery, type DistanceDeliveryConfig, type LatLng } from '@/lib/delivery-fee'

/** No delivery in any market this platform serves costs more than this. */
export const MAX_DELIVERY_FEE = 100_000

/** A fee the browser may send: absent, or a finite amount in range. */
export function isValidClientDeliveryFee(fee: unknown): boolean {
  if (fee === undefined || fee === null) return true
  return typeof fee === 'number' && Number.isFinite(fee) && fee >= 0 && fee <= MAX_DELIVERY_FEE
}

export interface OrderDeliveryFeeInput {
  /** Already checked with `isValidClientDeliveryFee`. */
  clientFee: number | null | undefined
  isDeliveryOrder: boolean
  lalamoveEnabled: boolean
  /** Non-null only when distance delivery is on and Lalamove is off. */
  distanceConfig: DistanceDeliveryConfig | null
  store: LatLng
  destination: LatLng
}

export type OrderDeliveryFeeResolution =
  | { kind: 'fee'; fee: number | undefined }
  /** A store-side "no" the customer can act on. */
  | { kind: 'refuse'; error: string }
  /** The store is misconfigured — not the customer's doing. */
  | { kind: 'abort'; error: string }

const isFiniteLatLng = (point: LatLng): boolean =>
  Number.isFinite(point.lat) && Number.isFinite(point.lng)

export function resolveOrderDeliveryFee(input: OrderDeliveryFeeInput): OrderDeliveryFeeResolution {
  if (!input.isDeliveryOrder) return { kind: 'fee', fee: undefined }

  if (input.lalamoveEnabled) {
    return { kind: 'fee', fee: input.clientFee ?? undefined }
  }

  const config = input.distanceConfig
  if (!config) return { kind: 'fee', fee: undefined }

  if (!isFiniteLatLng(input.store)) {
    return { kind: 'abort', error: 'Delivery is unavailable: the store location has not been configured.' }
  }
  if (!isFiniteLatLng(input.destination)) {
    return {
      kind: 'refuse',
      error: 'Please select your delivery address from the suggestions so we can calculate the delivery fee.',
    }
  }

  const quote = quoteDistanceDelivery(input.store, input.destination, config)
  if (!quote.withinRadius) {
    return { kind: 'refuse', error: `Sorry, this address is outside our delivery area (${config.radiusKm} km).` }
  }
  return { kind: 'fee', fee: quote.fee }
}
