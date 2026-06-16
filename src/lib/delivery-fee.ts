/**
 * Distance-based delivery fee.
 *
 * Pure, dependency-free, deterministic — same constraints as `operating-hours.ts`,
 * so the computation is identical on server and client and is fully unit-testable.
 *
 * This is the NON-Lalamove delivery pricing path. A tenant configures a store location
 * (`restaurant_latitude/longitude`), a delivery `radiusKm`, a `perKm` rate, and a
 * `minFee` floor. The fee for a destination is:
 *
 *     fee = max(minFee, distanceKm × perKm)        (rounded to 2 decimals)
 *
 * and the order is only deliverable when `distanceKm <= radiusKm`.
 *
 * Distance is straight-line (Haversine). It under-counts real road distance; merchants
 * tune `perKm`/`minFee` accordingly. Lalamove always takes precedence when enabled — this
 * path is only used when a tenant opts out of Lalamove.
 */

/** Mean Earth radius in kilometers (WGS-84 mean radius). */
const EARTH_RADIUS_KM = 6371

/** Validated, ready-to-use distance-delivery pricing config. */
export interface DistanceDeliveryConfig {
  /** Charge per kilometer (>= 0). */
  perKm: number
  /** Minimum fee floor, applied even for very nearby destinations (>= 0). */
  minFee: number
  /** Maximum deliverable straight-line distance in km (> 0). */
  radiusKm: number
}

/** Raw, possibly-incomplete config as stored on the tenant row. */
export interface RawDistanceDeliveryConfig {
  enabled?: boolean | null
  perKm?: number | null
  minFee?: number | null
  radiusKm?: number | null
}

/** Result of pricing a single destination. */
export interface DeliveryFeeQuote {
  /** Straight-line distance from store to destination, in km. */
  distanceKm: number
  /** True when `distanceKm <= radiusKm` (i.e. the order is deliverable). */
  withinRadius: boolean
  /**
   * Computed fee, rounded to 2 decimals. Always populated, even when out of range —
   * the caller decides whether to block the order based on `withinRadius`.
   */
  fee: number
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

const isNonNegativeFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/** Round a currency amount to 2 decimal places, avoiding binary float drift. */
const roundCurrency = (amount: number): number => Math.round(amount * 100) / 100

/**
 * Great-circle distance between two lat/lng points, in kilometers (Haversine formula).
 * Returns 0 for identical points and is symmetric in its arguments.
 */
export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

/**
 * Validate and normalize the raw tenant config into a usable `DistanceDeliveryConfig`,
 * or null when the feature is disabled or any field is missing/invalid. A `perKm` of 0
 * is valid (flat fee equal to `minFee`); `radiusKm` must be strictly positive.
 */
export function resolveDistanceDeliveryConfig(raw: RawDistanceDeliveryConfig): DistanceDeliveryConfig | null {
  if (raw.enabled !== true) return null
  if (!isPositiveFinite(raw.radiusKm)) return null
  if (!isNonNegativeFinite(raw.perKm)) return null
  if (!isNonNegativeFinite(raw.minFee)) return null
  return { perKm: raw.perKm, minFee: raw.minFee, radiusKm: raw.radiusKm }
}

/**
 * Price a known distance against a validated config.
 * `fee = max(minFee, distanceKm × perKm)`, rounded to 2 decimals.
 */
export function calculateDistanceDeliveryFee(
  distanceKm: number,
  config: DistanceDeliveryConfig
): DeliveryFeeQuote {
  const raw = distanceKm * config.perKm
  const fee = roundCurrency(Math.max(config.minFee, raw))
  return {
    distanceKm,
    withinRadius: distanceKm <= config.radiusKm,
    fee,
  }
}

/** Coordinate pair. */
export interface LatLng {
  lat: number
  lng: number
}

/**
 * Convenience: compute the straight-line distance between a store and a destination,
 * then price it. Used by the checkout fee action and the server-side order recompute.
 */
export function quoteDistanceDelivery(
  store: LatLng,
  destination: LatLng,
  config: DistanceDeliveryConfig
): DeliveryFeeQuote {
  const distanceKm = haversineDistanceKm(store.lat, store.lng, destination.lat, destination.lng)
  return calculateDistanceDeliveryFee(distanceKm, config)
}
