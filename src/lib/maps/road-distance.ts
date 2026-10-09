/**
 * Driving distance between two points, for distance-based delivery pricing.
 *
 * Providers are tried in order (Apple Maps ETA, then Mapbox Directions); the
 * first finite answer wins. When every provider fails, the straight line ×
 * `ROAD_DISTANCE_FALLBACK_FACTOR` stands in, so checkout never stops on a maps
 * outage.
 *
 * Results are cached per route: the checkout quote and the order recompute ask
 * for the same trip seconds apart, so the order is billed exactly what the
 * customer was shown, and a route is only paid for once. An estimate is cached
 * briefly (same quote → same bill), a real road distance for days.
 *
 * Wiring with real providers lives in `road-distance-server.ts`; this module
 * is dependency-injected so it is unit-tested without the network.
 */

import { haversineDistanceKm, type LatLng, type MeasureDistanceKm } from '@/lib/delivery-fee'

/**
 * Road ÷ straight-line distance used only when no provider answers. Typical
 * city grids run 1.2–1.4; provincial PH roads can run 2 (Ate Lolet's real
 * 4.0 km → 8.16 km), so this deliberately errs low rather than overcharge.
 */
export const ROAD_DISTANCE_FALLBACK_FACTOR = 1.3
export const ROAD_DISTANCE_CACHE_SECONDS = 7 * 24 * 60 * 60
export const FALLBACK_DISTANCE_CACHE_SECONDS = 15 * 60
/** 5 decimals ≈ 1 m: a re-dropped pin on the same spot shares one entry. */
const CACHE_KEY_DECIMALS = 5
const CACHE_KEY_VERSION = 'v1'
const METERS_PER_KM = 1000

export interface RoadDistanceProvider {
  name: string
  /** Driving distance in meters; throws (or answers non-finite) when it has none. */
  measureMeters(from: LatLng, to: LatLng): Promise<number>
}

export interface DistanceCache {
  get(key: string): Promise<number | null>
  set(key: string, km: number, ttlSeconds: number): Promise<void>
}

export interface RoadDistanceMeterDeps {
  providers: RoadDistanceProvider[]
  cache?: DistanceCache
  /** Told when every provider failed and the estimate was used. */
  onFallback?: (failures: ReadonlyArray<{ provider: string; error: unknown }>) => void
}

const roundKm = (km: number): number => Math.round(km * 100) / 100

const keyPart = (point: LatLng): string =>
  `${point.lat.toFixed(CACHE_KEY_DECIMALS)},${point.lng.toFixed(CACHE_KEY_DECIMALS)}`

/** Directional: one-way streets make A→B and B→A different trips. */
export function roadDistanceCacheKey(from: LatLng, to: LatLng): string {
  return `road-km:${CACHE_KEY_VERSION}:${keyPart(from)}>${keyPart(to)}`
}

async function readCache(cache: DistanceCache | undefined, key: string): Promise<number | null> {
  if (!cache) return null
  try {
    const km = await cache.get(key)
    return typeof km === 'number' && Number.isFinite(km) && km >= 0 ? km : null
  } catch (error) {
    console.error('[road-distance] cache read failed:', error)
    return null
  }
}

async function writeCache(cache: DistanceCache | undefined, key: string, km: number, ttlSeconds: number): Promise<void> {
  if (!cache) return
  try {
    await cache.set(key, km, ttlSeconds)
  } catch (error) {
    console.error('[road-distance] cache write failed:', error)
  }
}

export function createRoadDistanceMeter({ providers, cache, onFallback }: RoadDistanceMeterDeps): MeasureDistanceKm {
  return async (from, to) => {
    const key = roadDistanceCacheKey(from, to)
    const cached = await readCache(cache, key)
    if (cached !== null) return cached

    const failures: Array<{ provider: string; error: unknown }> = []
    for (const provider of providers) {
      try {
        const meters = await provider.measureMeters(from, to)
        if (!Number.isFinite(meters) || meters < 0) throw new Error(`answered ${meters}`)
        const km = roundKm(meters / METERS_PER_KM)
        await writeCache(cache, key, km, ROAD_DISTANCE_CACHE_SECONDS)
        return km
      } catch (error) {
        failures.push({ provider: provider.name, error })
      }
    }

    onFallback?.(failures)
    const estimateKm = haversineDistanceKm(from.lat, from.lng, to.lat, to.lng) * ROAD_DISTANCE_FALLBACK_FACTOR
    await writeCache(cache, key, estimateKm, FALLBACK_DISTANCE_CACHE_SECONDS)
    return estimateKm
  }
}

// ── Mapbox Directions ──

const MAPBOX_DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving'

export type DirectionsFetch = (
  url: string,
  init: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/** Distance of the first route, or null when Mapbox found none. */
export function parseMapboxRouteMeters(payload: unknown): number | null {
  const routes = (payload as { routes?: unknown } | null)?.routes
  if (!Array.isArray(routes) || routes.length === 0) return null
  const meters = (routes[0] as { distance?: unknown } | null)?.distance
  return typeof meters === 'number' && Number.isFinite(meters) && meters >= 0 ? meters : null
}

export function mapboxDirectionsProvider(
  accessToken: string,
  fetchImpl: DirectionsFetch = fetch as unknown as DirectionsFetch,
  timeoutMs?: number,
): RoadDistanceProvider {
  return {
    name: 'mapbox',
    async measureMeters(from, to) {
      const params = new URLSearchParams({ overview: 'false', alternatives: 'false', access_token: accessToken })
      const url = `${MAPBOX_DIRECTIONS_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?${params.toString()}`
      const signal = timeoutMs && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined
      const response = await fetchImpl(url, { signal })
      if (!response.ok) throw new Error(`Mapbox directions failed with status ${response.status}`)
      const meters = parseMapboxRouteMeters(await response.json())
      if (meters === null) throw new Error('Mapbox found no driving route')
      return meters
    },
  }
}
