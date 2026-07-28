/**
 * Nearest-branch detection.
 *
 * The rule that shapes this whole module: auto-detection is a convenience,
 * never a gate. Geolocation gets denied, times out, or returns nothing; a
 * merchant leaves coordinates blank. In every one of those cases the customer
 * must still receive a complete, ordered, choosable list — so this function
 * always returns every eligible outlet, and `preselectedId` is the only thing
 * that degrades to null.
 *
 * Pure and deterministic (same constraints as `delivery-fee.ts`, whose
 * `haversineDistanceKm` it reuses rather than reimplementing) so the server
 * render and the client re-rank after a geolocation callback cannot disagree.
 */

import { haversineDistanceKm } from '@/lib/delivery-fee'

/**
 * How the customer wants to receive the order — decided before outlet choice.
 *
 * `dine_in` is a third mode rather than a flavour of pickup: a branch with
 * table service and no takeaway counter supports one and not the other, and a
 * delivery radius must never disqualify a customer already standing in the shop.
 */
export type OutletOrderMode = 'dine_in' | 'pickup' | 'delivery'

/** The subset of an outlet row this module ranks on. */
export interface OutletLocation {
  id: string
  slug: string
  name: string
  latitude?: number | null
  longitude?: number | null
  delivery_radius_km?: number | null
  supports_pickup: boolean
  supports_delivery: boolean
  supports_dine_in?: boolean
  is_active: boolean
  sort_order: number
}

/** A customer position, as reported by the browser. */
export interface GeoOrigin {
  latitude: number
  longitude: number
}

/** One outlet, with whatever the customer's location let us work out about it. */
export interface RankedOutlet<T extends OutletLocation = OutletLocation> {
  outlet: T
  /** Straight-line km, or null when either side has no usable coordinates. */
  distanceKm: number | null
  /**
   * Whether this outlet delivers to the customer. False when the location is
   * unknown — absence of proof, not proof of coverage; the caller must not turn
   * this into a "we deliver here" promise.
   */
  withinDeliveryRadius: boolean
}

export interface OutletRankingOptions {
  mode: OutletOrderMode
  /** Null/undefined when permission was denied, timed out, or never asked. */
  origin?: GeoOrigin | null
}

export interface OutletRankingResult<T extends OutletLocation = OutletLocation> {
  /** Every eligible outlet, best first. Never truncated. */
  outlets: RankedOutlet<T>[]
  /** The outlet to pre-tick, or null when the customer must choose. */
  preselectedId: string | null
  /** Drives the "delivery may not reach your area" message. */
  anyWithinDeliveryRadius: boolean
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isValidLatitude = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= -90 && value <= 90

const isValidLongitude = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= -180 && value <= 180

/** A usable origin, or null. Bad coordinates degrade to "unknown location". */
function normalizeOrigin(origin: GeoOrigin | null | undefined): GeoOrigin | null {
  if (!origin) return null
  if (!isValidLatitude(origin.latitude) || !isValidLongitude(origin.longitude)) return null
  return { latitude: origin.latitude, longitude: origin.longitude }
}

function outletCoordinates(outlet: OutletLocation): GeoOrigin | null {
  if (!isValidLatitude(outlet.latitude) || !isValidLongitude(outlet.longitude)) return null
  return { latitude: outlet.latitude, longitude: outlet.longitude }
}

function supportsMode(outlet: OutletLocation, mode: OutletOrderMode): boolean {
  if (mode === 'dine_in') return outlet.supports_dine_in === true
  if (mode === 'pickup') return outlet.supports_pickup
  return outlet.supports_delivery
}

/**
 * Whether an outlet's delivery radius covers a measured distance.
 *
 * A blank, zero, or negative radius means "unrestricted", matching how
 * distance-based delivery is opt-in at the tenant level: a merchant who never
 * filled the field has not thereby declared they deliver nowhere. Out-of-range
 * orders are still caught at checkout by the existing delivery-fee quote.
 */
function coversDistance(radiusKm: number | null | undefined, distanceKm: number): boolean {
  if (!isFiniteNumber(radiusKm) || radiusKm <= 0) return true
  return distanceKm <= radiusKm
}

/**
 * Coverage as the UI should read it.
 *
 * Pickup and dine-in never consult a delivery radius — a branch you walk into
 * is not "out of range" — so they always report covered. Delivery reports
 * covered only when a real distance was measured and the radius reaches it.
 */
function resolveCoverage(
  mode: OutletOrderMode,
  radiusKm: number | null | undefined,
  distanceKm: number | null
): boolean {
  if (mode !== 'delivery') return true
  if (distanceKm === null) return false
  return coversDistance(radiusKm, distanceKm)
}

/** Stable fallback order for outlets we cannot rank by distance. */
export function byManualOrder(a: OutletLocation, b: OutletLocation): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  return a.id.localeCompare(b.id)
}

/**
 * Rank the outlets a customer may choose from, best first.
 *
 * Ordering:
 *  - no usable location → manual `sort_order` (then id, for determinism)
 *  - with a location    → distance ascending; outlets with unknown coordinates
 *                         sink below every located one, in manual order
 *
 * Pre-selection:
 *  - exactly one eligible outlet → that one, always (one choice is not a choice)
 *  - pickup with a location      → the nearest
 *  - delivery with a location    → the nearest outlet that actually covers the
 *                                  customer; null when none do, so the customer
 *                                  chooses deliberately and sees the warning
 *  - otherwise                   → null
 */
export function rankOutlets<T extends OutletLocation>(
  outlets: readonly T[],
  options: OutletRankingOptions
): OutletRankingResult<T> {
  const { mode } = options
  const origin = normalizeOrigin(options.origin)

  const eligible = outlets.filter((outlet) => outlet.is_active && supportsMode(outlet, mode))

  const ranked: RankedOutlet<T>[] = eligible.map((outlet) => {
    const coordinates = outletCoordinates(outlet)
    const distanceKm =
      origin && coordinates
        ? haversineDistanceKm(
            origin.latitude,
            origin.longitude,
            coordinates.latitude,
            coordinates.longitude
          )
        : null

    return {
      outlet,
      distanceKm,
      withinDeliveryRadius: resolveCoverage(mode, outlet.delivery_radius_km, distanceKm),
    }
  })

  // Sort a copy: the caller's array is theirs.
  const sorted = [...ranked].sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) {
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
      return byManualOrder(a.outlet, b.outlet)
    }
    // Located outlets always outrank unlocatable ones.
    if (a.distanceKm !== null) return -1
    if (b.distanceKm !== null) return 1
    return byManualOrder(a.outlet, b.outlet)
  })

  const anyWithinDeliveryRadius =
    mode === 'delivery' && sorted.some((entry) => entry.withinDeliveryRadius)

  return {
    outlets: sorted,
    preselectedId: choosePreselection(sorted, mode),
    anyWithinDeliveryRadius,
  }
}

function choosePreselection<T extends OutletLocation>(
  sorted: readonly RankedOutlet<T>[],
  mode: OutletOrderMode
): string | null {
  if (sorted.length === 0) return null
  // A single option is preselected whatever we know about it — including an
  // out-of-range delivery outlet, where the address form is what tells the
  // customer it does not reach them.
  if (sorted.length === 1) return sorted[0].outlet.id

  const located = sorted.filter((entry) => entry.distanceKm !== null)
  if (located.length === 0) return null

  if (mode === 'delivery') {
    return located.find((entry) => entry.withinDeliveryRadius)?.outlet.id ?? null
  }

  return located[0].outlet.id
}
