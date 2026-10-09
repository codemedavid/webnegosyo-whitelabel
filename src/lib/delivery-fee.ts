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
 * Distance is the DRIVING distance, measured by the caller's `measureKm` (see
 * `src/lib/maps/road-distance.ts`). It used to be the straight line, which reads about
 * half the road distance in provincial towns: a ₱55-minimum, ₱7/km store charged ₱55 for
 * every trip a rider measured under ~15 km, and accepted trips far beyond its radius.
 * The straight line is still a lower bound — a road is never shorter — so it gates the
 * radius before any (paid) road lookup. Lalamove always takes precedence when enabled —
 * this path is only used when a tenant opts out of Lalamove.
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

const MAX_LATITUDE = 90
const MAX_LONGITUDE = 180

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * A coordinate pair from a tenant row or customer payload (numbers or numeric
 * strings), or null when either half is missing or impossible. `Number(null)` is 0,
 * so a bare `Number()` turned a store with no location into a point in the Gulf of
 * Guinea and every address then read "outside the delivery area".
 */
export function toLatLng(lat: unknown, lng: unknown): LatLng | null {
  const latitude = toFiniteNumber(lat)
  const longitude = toFiniteNumber(lng)
  if (latitude === null || longitude === null) return null
  if (Math.abs(latitude) > MAX_LATITUDE || Math.abs(longitude) > MAX_LONGITUDE) return null
  return { lat: latitude, lng: longitude }
}

/** The tenant columns distance pricing reads. */
export interface DistanceDeliveryTenantFields {
  lalamove_enabled?: boolean | null
  distance_delivery_enabled?: boolean | null
  delivery_price_per_km?: number | string | null
  delivery_min_fee?: number | string | null
  delivery_radius_km?: number | string | null
}

/**
 * The one reader of a tenant's distance pricing. Null while Lalamove is on (it
 * always wins) or the store has not set distance pricing up.
 */
export function distanceConfigFromTenant(tenant: DistanceDeliveryTenantFields): DistanceDeliveryConfig | null {
  if (tenant.lalamove_enabled === true) return null
  return resolveDistanceDeliveryConfig({
    enabled: tenant.distance_delivery_enabled,
    perKm: toFiniteNumber(tenant.delivery_price_per_km),
    minFee: toFiniteNumber(tenant.delivery_min_fee),
    radiusKm: toFiniteNumber(tenant.delivery_radius_km),
  })
}

/** Measures the trip from the store to a destination, in km. */
export type MeasureDistanceKm = (from: LatLng, to: LatLng) => Promise<number>

export interface DistanceQuoteInput {
  config: DistanceDeliveryConfig
  store: LatLng | null
  destination: LatLng | null
  measureKm: MeasureDistanceKm
}

export type DistanceQuoteOutcome =
  | { kind: 'store-unlocated' }
  | { kind: 'destination-unlocated' }
  | { kind: 'quote'; quote: DeliveryFeeQuote }

/**
 * Price a destination by its road distance. Used by the checkout fee action and
 * the server-side order recompute, so both bill the same number.
 */
export async function quoteDistanceDelivery({
  config,
  store,
  destination,
  measureKm,
}: DistanceQuoteInput): Promise<DistanceQuoteOutcome> {
  if (!store) return { kind: 'store-unlocated' }
  if (!destination) return { kind: 'destination-unlocated' }

  const straightKm = haversineDistanceKm(store.lat, store.lng, destination.lat, destination.lng)
  // A road is never shorter than the straight line: beyond the radius already,
  // so no road lookup is spent on it.
  if (straightKm > config.radiusKm) {
    return { kind: 'quote', quote: calculateDistanceDeliveryFee(straightKm, config) }
  }

  // Snapping an off-road pin to the nearest road can read a hair shorter than
  // the straight line; never bill below it.
  const distanceKm = Math.max(straightKm, await measureKm(store, destination))
  return { kind: 'quote', quote: calculateDistanceDeliveryFee(distanceKm, config) }
}

/**
 * Below this distance every order pays exactly the minimum fee. Infinity when
 * the per-km rate is 0 (a flat fee).
 */
export function feeStartsRisingAtKm(config: DistanceDeliveryConfig): number {
  return config.perKm > 0 ? config.minFee / config.perKm : Number.POSITIVE_INFINITY
}

/** True when no deliverable address can ever pay more than the minimum. */
export function isFlatFee(config: DistanceDeliveryConfig): boolean {
  return feeStartsRisingAtKm(config) >= config.radiusKm
}

export interface FeePreviewPoint {
  distanceKm: number
  fee: number
}

const PREVIEW_FRACTIONS = [0.25, 0.5, 0.75, 1] as const

/** What a merchant's settings charge at quarter points of the radius. */
export function feePreview(config: DistanceDeliveryConfig): FeePreviewPoint[] {
  const distances = PREVIEW_FRACTIONS.map((fraction) => Math.round(config.radiusKm * fraction * 10) / 10)
  return [...new Set(distances)]
    .filter((distanceKm) => distanceKm > 0)
    .map((distanceKm) => ({ distanceKm, fee: calculateDistanceDeliveryFee(distanceKm, config).fee }))
}
