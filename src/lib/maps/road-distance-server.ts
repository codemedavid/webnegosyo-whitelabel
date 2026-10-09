/**
 * The production road-distance meter: Apple Maps ETA (when the APPLE_MAPKIT_*
 * key is set), then Mapbox Directions (when a Mapbox token is set), cached in
 * Upstash Redis. Built once per runtime so Apple's 30-minute access token is
 * reused across requests. Server only.
 */

import 'server-only'
import { createAppleMapsClient } from '@/lib/maps/apple/maps-server-api'
import { readMapKitConfig } from '@/lib/maps/apple/mapkit-token'
import { getRedisClient } from '@/lib/redis-cache'
import type { MeasureDistanceKm } from '@/lib/delivery-fee'
import {
  createRoadDistanceMeter,
  mapboxDirectionsProvider,
  type DistanceCache,
  type RoadDistanceProvider,
} from '@/lib/maps/road-distance'

/** Checkout waits on this; two slow providers must still answer well inside a request. */
const PROVIDER_TIMEOUT_MS = 4_000

function buildProviders(): RoadDistanceProvider[] {
  const providers: RoadDistanceProvider[] = []
  const appleConfig = readMapKitConfig()
  if (appleConfig) {
    const apple = createAppleMapsClient(appleConfig, undefined, { timeoutMs: PROVIDER_TIMEOUT_MS })
    providers.push({ name: 'apple', measureMeters: (from, to) => apple.drivingDistanceMeters(from, to) })
  }
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim()
  if (mapboxToken) providers.push(mapboxDirectionsProvider(mapboxToken, undefined, PROVIDER_TIMEOUT_MS))
  return providers
}

const redisDistanceCache: DistanceCache = {
  async get(key) {
    const redis = getRedisClient()
    return redis ? redis.get<number>(key) : null
  },
  async set(key, km, ttlSeconds) {
    const redis = getRedisClient()
    if (redis) await redis.set(key, km, { ex: ttlSeconds })
  },
}

let meter: MeasureDistanceKm | null = null

/** Driving distance in km; never throws for a provider outage (it estimates). */
export const measureRoadDistanceKm: MeasureDistanceKm = (from, to) => {
  meter ??= createRoadDistanceMeter({
    providers: buildProviders(),
    cache: redisDistanceCache,
    onFallback: (failures) =>
      console.warn('[road-distance] no provider answered; using the straight-line estimate', {
        failures: failures.map(({ provider, error }) => ({
          provider,
          error: error instanceof Error ? error.message : String(error),
        })),
      }),
  })
  return meter(from, to)
}
