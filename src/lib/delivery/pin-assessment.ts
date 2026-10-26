/**
 * "Is this the right spot?" — the checks a delivery pin gets before the order.
 *
 * The 2026-10 audit found 14% of pinned deliveries more than 30 km from their
 * store (a Davao customer picked "Manila 1003"), and some pins equal to the
 * store's own. Those are WARNINGS the customer taps through: a long delivery
 * can be real. Only a pin outside the country blocks, because no PH rider can
 * reach it.
 *
 * Distances are straight-line on purpose: this runs on every pin move in the
 * browser, with no road-distance call.
 */

import { haversineDistanceKm, type LatLng } from '@/lib/delivery-fee'
import { isPhilippineDeliveryMarket } from '@/lib/delivery/delivery-market'

/** Past this (when the store sets no radius) a pin is worth a second look. */
export const DEFAULT_FAR_PIN_KM = 30
/** A pin this close to the pickup is almost certainly the map's default, not the customer's door. */
export const AT_STORE_PIN_KM = 0.03

/** Generous box around the Philippines, Kalayaan islands included. */
const PH_BOUNDS = { minLat: 4.0, maxLat: 21.5, minLng: 114.0, maxLng: 127.5 }

export type PinWarningKind = 'at-store' | 'far'

export interface PinWarning {
  kind: PinWarningKind
  distanceKm: number
}

export interface PinAssessment {
  isBlocked: boolean
  warning: PinWarning | null
}

export interface PinAssessmentInput {
  pin: LatLng | null
  origin: LatLng | null
  /** `tenants.lalamove_market`; only read while `lalamoveEnabled` (see `delivery-market.ts`). */
  market?: string | null
  lalamoveEnabled?: boolean | null
  radiusKm?: number | null
}

export function isInsidePhilippines(point: LatLng): boolean {
  return (
    point.lat >= PH_BOUNDS.minLat &&
    point.lat <= PH_BOUNDS.maxLat &&
    point.lng >= PH_BOUNDS.minLng &&
    point.lng <= PH_BOUNDS.maxLng
  )
}

export function assessDeliveryPin({ pin, origin, market, lalamoveEnabled, radiusKm }: PinAssessmentInput): PinAssessment {
  if (!pin) return { isBlocked: false, warning: null }
  if (isPhilippineDeliveryMarket({ lalamoveEnabled, market }) && !isInsidePhilippines(pin)) return { isBlocked: true, warning: null }
  if (!origin) return { isBlocked: false, warning: null }

  const distanceKm = haversineDistanceKm(origin.lat, origin.lng, pin.lat, pin.lng)
  if (distanceKm <= AT_STORE_PIN_KM) return { isBlocked: false, warning: { kind: 'at-store', distanceKm } }
  const farKm = radiusKm && radiusKm > 0 ? radiusKm : DEFAULT_FAR_PIN_KM
  if (distanceKm > farKm) return { isBlocked: false, warning: { kind: 'far', distanceKm } }
  return { isBlocked: false, warning: null }
}
