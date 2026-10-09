/**
 * @jest-environment node
 */
/**
 * The merchant app's map routes: address search and the map-preview image.
 *
 * Both spend the shared Apple Maps quota, so both refuse anyone who is not a
 * member of the store, honour per-person limits, and fail closed (503) on a
 * deploy without Apple keys — the app then falls back to a typed address.
 */

import { NextRequest, NextResponse } from 'next/server'

const requireBearerStoreCaller = jest.fn()
jest.mock('@/lib/auth/bearer-caller', () => ({
  requireBearerStoreCaller: (...a: unknown[]) => requireBearerStoreCaller(...a),
}))

const checkRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}))

const readMapKitConfig = jest.fn()
jest.mock('@/lib/maps/apple/mapkit-token', () => ({
  readMapKitConfig: () => readMapKitConfig(),
}))

const search = jest.fn()
const reverseGeocode = jest.fn()
jest.mock('@/lib/maps/apple/maps-server-api', () => ({
  createAppleMapsClient: () => ({ search, reverseGeocode, geocode: jest.fn() }),
}))

const signSnapshotUrl = jest.fn()
jest.mock('@/lib/maps/apple/snapshot-url', () => ({
  SNAPSHOT_MIN_SIZE: 50,
  SNAPSHOT_MAX_SIZE: 640,
  signSnapshotUrl: (...a: unknown[]) => signSnapshotUrl(...a),
}))

const measureRoadDistanceKm = jest.fn()
jest.mock('@/lib/maps/road-distance-server', () => ({
  measureRoadDistanceKm: (...a: unknown[]) => measureRoadDistanceKm(...a),
}))

/** The tenant row the caller's own (RLS-bound) client reads. */
let tenantRow: Record<string, unknown> | null = null
const callerSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: tenantRow, error: null }) }),
    }),
  }),
}

const TENANT = '11111111-1111-4111-8111-111111111111'
const CONFIG = { teamId: 'T', keyId: 'K', privateKey: 'pem' }

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

async function loadRoutes() {
  const places = await import('@/app/api/maps/places/route')
  const snapshot = await import('@/app/api/maps/snapshot/route')
  const quote = await import('@/app/api/maps/delivery-quote/route')
  return { places: places.POST, snapshot: snapshot.POST, quote: quote.POST }
}

const SM_NORTH = {
  name: 'SM North EDSA',
  address: 'North Ave, Quezon City, Metro Manila',
  coordinates: { lat: 14.6566, lng: 121.0298 },
  countryCode: 'PH',
  towns: ['Quezon City'],
}

beforeEach(() => {
  jest.clearAllMocks()
  requireBearerStoreCaller.mockResolvedValue({ ok: true, user: { id: 'user-1' }, supabase: callerSupabase })
  measureRoadDistanceKm.mockResolvedValue(6)
  tenantRow = {
    lalamove_enabled: false,
    distance_delivery_enabled: true,
    delivery_price_per_km: '15',
    delivery_min_fee: 50,
    delivery_radius_km: 10,
    restaurant_latitude: 14.6,
    restaurant_longitude: 121.0,
  }
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
  readMapKitConfig.mockReturnValue(CONFIG)
  search.mockResolvedValue([SM_NORTH])
  reverseGeocode.mockResolvedValue([SM_NORTH])
  signSnapshotUrl.mockReturnValue('https://snapshot.apple-mapkit.com/api/v1/snapshot?x&signature=s')
})

describe('POST /api/maps/places', () => {
  it('returns places with coordinates for a typed search, biased near the store', async () => {
    const { places } = await loadRoutes()

    const response = await places(post('/api/maps/places', {
      tenantId: TENANT,
      query: 'SM North',
      near: { lat: 14.6, lng: 121 },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      places: [{ name: 'SM North EDSA', address: 'North Ave, Quezon City, Metro Manila', lat: 14.6566, lng: 121.0298 }],
    })
    expect(search).toHaveBeenCalledWith('SM North', { lat: 14.6, lng: 121 })
    expect(requireBearerStoreCaller).toHaveBeenCalledWith(expect.anything(), TENANT, 'view')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('names a point when given coordinates instead of a query', async () => {
    const { places } = await loadRoutes()

    const response = await places(post('/api/maps/places', { tenantId: TENANT, at: { lat: 14.65, lng: 121.03 } }))

    expect(response.status).toBe(200)
    expect(reverseGeocode).toHaveBeenCalledWith({ lat: 14.65, lng: 121.03 })
  })

  it('rejects a one-letter query before spending any quota', async () => {
    const { places } = await loadRoutes()

    const response = await places(post('/api/maps/places', { tenantId: TENANT, query: 'S' }))

    expect(response.status).toBe(400)
    expect(requireBearerStoreCaller).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it('refuses a caller who is not a member of the store', async () => {
    requireBearerStoreCaller.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    const { places } = await loadRoutes()

    const response = await places(post('/api/maps/places', { tenantId: TENANT, query: 'SM North' }))

    expect(response.status).toBe(403)
    expect(search).not.toHaveBeenCalled()
  })

  it('answers 429 with Retry-After once the person is over their limit', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 12 })
    const { places } = await loadRoutes()

    const response = await places(post('/api/maps/places', { tenantId: TENANT, query: 'SM North' }))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
    expect(search).not.toHaveBeenCalled()
  })

  it('fails closed with 503 on a deploy without Apple Maps keys', async () => {
    readMapKitConfig.mockReturnValue(null)
    const { places } = await loadRoutes()

    const response = await places(post('/api/maps/places', { tenantId: TENANT, query: 'SM North' }))

    expect(response.status).toBe(503)
  })

  it('answers 502, not a crash, when Apple is down', async () => {
    search.mockRejectedValue(new Error('Apple Maps search failed with status 500'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { places } = await loadRoutes()

    const response = await places(post('/api/maps/places', { tenantId: TENANT, query: 'SM North' }))

    expect(response.status).toBe(502)
    spy.mockRestore()
  })
})

describe('POST /api/maps/snapshot', () => {
  it('returns a signed image URL for the pinned spot', async () => {
    const { snapshot } = await loadRoutes()

    const response = await snapshot(post('/api/maps/snapshot', {
      tenantId: TENANT,
      at: { lat: 14.65, lng: 121.03 },
      width: 340,
      height: 150,
    }))

    expect(response.status).toBe(200)
    expect((await response.json()).url).toMatch(/^https:\/\/snapshot\.apple-mapkit\.com\//)
    expect(signSnapshotUrl).toHaveBeenCalledWith(CONFIG, {
      center: { lat: 14.65, lng: 121.03 },
      width: 340,
      height: 150,
    })
  })

  it('rejects out-of-range coordinates or sizes', async () => {
    const { snapshot } = await loadRoutes()

    const badPoint = await snapshot(post('/api/maps/snapshot', { tenantId: TENANT, at: { lat: 99, lng: 0 }, width: 300, height: 150 }))
    const badSize = await snapshot(post('/api/maps/snapshot', { tenantId: TENANT, at: { lat: 14, lng: 121 }, width: 4000, height: 150 }))

    expect(badPoint.status).toBe(400)
    expect(badSize.status).toBe(400)
    expect(signSnapshotUrl).not.toHaveBeenCalled()
  })
})

describe('POST /api/maps/delivery-quote', () => {
  const body = { tenantId: TENANT, at: { lat: 14.62, lng: 121.02 } }

  it('prices the pinned spot by ROAD distance, exactly like the storefront checkout', async () => {
    const { quote } = await loadRoutes()

    const response = await quote(post('/api/maps/delivery-quote', body))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ fee: 90, distanceKm: 6, withinRadius: true, radiusKm: 10 })
    expect(measureRoadDistanceKm).toHaveBeenCalledWith({ lat: 14.6, lng: 121 }, { lat: 14.62, lng: 121.02 })
  })

  it('still quotes on a deploy without Apple keys (road distance has its own fallbacks)', async () => {
    readMapKitConfig.mockReturnValue(null)
    const { quote } = await loadRoutes()

    expect((await quote(post('/api/maps/delivery-quote', body))).status).toBe(200)
  })

  it('answers 409 for a store that does not price by distance — Lalamove wins', async () => {
    tenantRow = { ...tenantRow, lalamove_enabled: true }
    const { quote } = await loadRoutes()

    const response = await quote(post('/api/maps/delivery-quote', body))

    expect(response.status).toBe(409)
    expect(measureRoadDistanceKm).not.toHaveBeenCalled()
  })

  it('answers 409 when the store has no pin of its own', async () => {
    tenantRow = { ...tenantRow, restaurant_latitude: null, restaurant_longitude: null }
    const { quote } = await loadRoutes()

    expect((await quote(post('/api/maps/delivery-quote', body))).status).toBe(409)
  })
})
