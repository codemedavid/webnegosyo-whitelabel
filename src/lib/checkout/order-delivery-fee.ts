/**
 * Which delivery fee an order is billed — decided on the server.
 *
 * The checkout has exactly two fee sources (see `resolveDeliveryQuotePlan`):
 *  - a Lalamove quotation, when the tenant has Lalamove on;
 *  - the tenant's distance formula, otherwise, when that is on.
 * Anything else carries no fee. The distance fee is recomputed here from the
 * road distance between the store and destination coordinates (the same
 * cached measurement the checkout quote used); the browser's number is ignored.
 *
 * A Lalamove fee cannot be recomputed without re-quoting Lalamove, so the
 * caller passes the price the quote action SIGNED (see
 * delivery-quote-signature.ts) as `clientFee` — never the browser's number.
 *
 * Pure: the caller supplies config, coordinates and the distance meter.
 */

import {
  quoteDistanceDelivery,
  type DistanceDeliveryConfig,
  type LatLng,
  type MeasureDistanceKm,
} from '@/lib/delivery-fee'

/** No delivery in any market this platform serves costs more than this. */
export const MAX_DELIVERY_FEE = 100_000

/** A fee the browser may send: absent, or a finite amount in range. */
export function isValidClientDeliveryFee(fee: unknown): boolean {
  if (fee === undefined || fee === null) return true
  return typeof fee === 'number' && Number.isFinite(fee) && fee >= 0 && fee <= MAX_DELIVERY_FEE
}

export interface OrderDeliveryFeeInput {
  /**
   * Already checked with `isValidClientDeliveryFee`. For a Lalamove order this
   * is the verified, signed quotation price.
   */
  clientFee: number | null | undefined
  isDeliveryOrder: boolean
  lalamoveEnabled: boolean
  /** Non-null only when distance delivery is on and Lalamove is off. */
  distanceConfig: DistanceDeliveryConfig | null
  /** Null when the store has no usable location (see `toLatLng`). */
  store: LatLng | null
  /** Null when the customer never picked an address from the suggestions. */
  destination: LatLng | null
  measureKm: MeasureDistanceKm
}

export type OrderDeliveryFeeResolution =
  | { kind: 'fee'; fee: number | undefined }
  /** A store-side "no" the customer can act on. */
  | { kind: 'refuse'; error: string }
  /** The store is misconfigured — not the customer's doing. */
  | { kind: 'abort'; error: string }

export async function resolveOrderDeliveryFee(input: OrderDeliveryFeeInput): Promise<OrderDeliveryFeeResolution> {
  if (!input.isDeliveryOrder) return { kind: 'fee', fee: undefined }

  if (input.lalamoveEnabled) {
    return { kind: 'fee', fee: input.clientFee ?? undefined }
  }

  const config = input.distanceConfig
  if (!config) return { kind: 'fee', fee: undefined }

  const outcome = await quoteDistanceDelivery({
    config,
    store: input.store,
    destination: input.destination,
    measureKm: input.measureKm,
  })
  if (outcome.kind === 'store-unlocated') {
    return { kind: 'abort', error: 'Delivery is unavailable: the store location has not been configured.' }
  }
  if (outcome.kind === 'destination-unlocated') {
    return {
      kind: 'refuse',
      error: 'Please select your delivery address from the suggestions so we can calculate the delivery fee.',
    }
  }
  if (!outcome.quote.withinRadius) {
    return { kind: 'refuse', error: `Sorry, this address is outside our delivery area (${config.radiusKm} km by road).` }
  }
  return { kind: 'fee', fee: outcome.quote.fee }
}
