/**
 * @jest-environment node
 */
import {
  createRoadDistanceMeter,
  mapboxDirectionsProvider,
  parseMapboxRouteMeters,
  roadDistanceCacheKey,
  ROAD_DISTANCE_FALLBACK_FACTOR,
  ROAD_DISTANCE_CACHE_SECONDS,
  FALLBACK_DISTANCE_CACHE_SECONDS,
  type DistanceCache,
  type RoadDistanceProvider,
} from '@/lib/maps/road-distance'
import { haversineDistanceKm } from '@/lib/delivery-fee'

// Ate Lolet's store and a real order: 4.0 km straight, 8.16 km by road.
const store = { lat: 15.44454447, lng: 120.77120664 }
const home = { lat: 15.4804001, lng: 120.77600268 }
const straightKm = haversineDistanceKm(store.lat, store.lng, home.lat, home.lng)

function provider(name: string, result: number | Error): RoadDistanceProvider & { measureMeters: jest.Mock } {
  return {
    name,
    measureMeters: jest.fn(async () => {
      if (result instanceof Error) throw result
      return result
    }),
  }
}

function memoryCache(seed: Record<string, number> = {}): DistanceCache & { entries: Map<string, { km: number; ttl: number }> } {
  const entries = new Map(Object.entries(seed).map(([key, km]) => [key, { km, ttl: 0 }]))
  return {
    entries,
    get: jest.fn(async (key: string) => entries.get(key)?.km ?? null),
    set: jest.fn(async (key: string, km: number, ttl: number) => {
      entries.set(key, { km, ttl })
    }),
  }
}

describe('createRoadDistanceMeter', () => {
  it('measures by road with the first provider', async () => {
    const apple = provider('apple', 8160)
    const mapbox = provider('mapbox', 8159)
    const measure = createRoadDistanceMeter({ providers: [apple, mapbox] })

    await expect(measure(store, home)).resolves.toBe(8.16)
    expect(mapbox.measureMeters).not.toHaveBeenCalled()
  })

  it('falls through to the next provider when one fails', async () => {
    const measure = createRoadDistanceMeter({
      providers: [provider('apple', new Error('quota')), provider('mapbox', 8159.829)],
    })

    await expect(measure(store, home)).resolves.toBeCloseTo(8.16, 2)
  })

  it('skips a provider that answers with an impossible distance', async () => {
    const measure = createRoadDistanceMeter({
      providers: [provider('apple', Number.NaN), provider('mapbox', 8160)],
    })

    await expect(measure(store, home)).resolves.toBe(8.16)
  })

  it('estimates from the straight line when every provider fails, and says so', async () => {
    const onFallback = jest.fn()
    const measure = createRoadDistanceMeter({ providers: [provider('apple', new Error('down'))], onFallback })

    await expect(measure(store, home)).resolves.toBeCloseTo(straightKm * ROAD_DISTANCE_FALLBACK_FACTOR, 6)
    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it('caches a road distance so the order is billed what the checkout showed', async () => {
    const cache = memoryCache()
    const apple = provider('apple', 8160)
    const measure = createRoadDistanceMeter({ providers: [apple], cache })

    await measure(store, home)
    await measure(store, home)

    expect(apple.measureMeters).toHaveBeenCalledTimes(1)
    expect(cache.entries.get(roadDistanceCacheKey(store, home))).toEqual({ km: 8.16, ttl: ROAD_DISTANCE_CACHE_SECONDS })
  })

  it('caches an estimate only briefly, so a recovered provider is used soon', async () => {
    const cache = memoryCache()
    const measure = createRoadDistanceMeter({ providers: [provider('apple', new Error('down'))], cache })

    await measure(store, home)

    expect(cache.entries.get(roadDistanceCacheKey(store, home))?.ttl).toBe(FALLBACK_DISTANCE_CACHE_SECONDS)
  })

  it('a cache failure never fails the measurement', async () => {
    const cache: DistanceCache = {
      get: jest.fn(async () => {
        throw new Error('redis down')
      }),
      set: jest.fn(async () => {
        throw new Error('redis down')
      }),
    }
    const measure = createRoadDistanceMeter({ providers: [provider('apple', 8160)], cache })

    await expect(measure(store, home)).resolves.toBe(8.16)
  })
})

describe('roadDistanceCacheKey', () => {
  it('ignores sub-metre jitter in the pin', () => {
    expect(roadDistanceCacheKey(store, home)).toBe(
      roadDistanceCacheKey(store, { lat: home.lat + 0.0000001, lng: home.lng - 0.0000001 })
    )
  })

  it('is directional (one-way streets)', () => {
    expect(roadDistanceCacheKey(store, home)).not.toBe(roadDistanceCacheKey(home, store))
  })
})

describe('mapbox directions provider', () => {
  it('reads the first route distance', () => {
    expect(parseMapboxRouteMeters({ code: 'Ok', routes: [{ distance: 8159.829, duration: 1474 }] })).toBe(8159.829)
  })

  it.each([{ code: 'NoRoute', routes: [] }, null, { routes: [{ distance: 'far' }] }])('finds no route in %p', (payload) => {
    expect(parseMapboxRouteMeters(payload)).toBeNull()
  })

  it('asks for a driving route as lng,lat pairs', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ routes: [{ distance: 8160 }] }) }))
    const mapbox = mapboxDirectionsProvider('pk.test', fetchImpl)

    await expect(mapbox.measureMeters(store, home)).resolves.toBe(8160)
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(url).toContain('/directions/v5/mapbox/driving/120.77120664,15.44454447;120.77600268,15.4804001?')
    expect(url).toContain('access_token=pk.test')
  })

  it('throws on an error status so the next provider runs', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))

    await expect(mapboxDirectionsProvider('pk.bad', fetchImpl).measureMeters(store, home)).rejects.toThrow('401')
  })
})
