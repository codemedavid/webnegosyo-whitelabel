/** @jest-environment node */
import { NextRequest } from 'next/server'
import { appDeliveryQuoteSchema, appPlacesResultSchema } from '@/lib/app-contract'

jest.mock('server-only', () => ({}))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

const getTenantApp = jest.fn()
jest.mock('@/lib/app-api/tenant-app', () => ({ getTenantApp: (...a: unknown[]) => getTenantApp(...a) }))

const checkRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }))

const resolveCustomerSession = jest.fn()
jest.mock('@/lib/customer-auth/account', () => ({ resolveCustomerSession: (...a: unknown[]) => resolveCustomerSession(...a) }))

const readAppOrderTypes = jest.fn()
const readActiveOutlets = jest.fn()
jest.mock('@/lib/app-api/store-reads', () => ({
  AppReadError: class AppReadError extends Error {},
  readAppOrderTypes: (...a: unknown[]) => readAppOrderTypes(...a),
  readActiveOutlets: (...a: unknown[]) => readActiveOutlets(...a),
}))

const getStorefrontTenant = jest.fn()
jest.mock('@/lib/storefront/storefront-tenant', () => ({ getStorefrontTenant: (...a: unknown[]) => getStorefrontTenant(...a) }))

const readMapKitConfig = jest.fn()
jest.mock('@/lib/maps/apple/mapkit-token', () => ({ readMapKitConfig: () => readMapKitConfig() }))
const search = jest.fn()
jest.mock('@/lib/maps/apple/server-client', () => ({ appleMapsClientFor: () => ({ search: (...a: unknown[]) => search(...a) }) }))

const measureRoadDistanceKm = jest.fn()
jest.mock('@/lib/maps/road-distance-server', () => ({ measureRoadDistanceKm: (...a: unknown[]) => measureRoadDistanceKm(...a) }))

const createLalamoveQuotation = jest.fn()
jest.mock('@/lib/lalamove-service', () => ({ createLalamoveQuotation: (...a: unknown[]) => createLalamoveQuotation(...a) }))
jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => ({ lalamove_api_key: 'k', lalamove_secret_key: 's' }),
  mergeTenantSecrets: (tenant: object, secrets: object) => ({ ...tenant, ...secrets }),
}))

/** Rows per table; `select` columns recorded so the test can pin "never *". */
let tables: Record<string, unknown[]> = {}
const selects: Array<[string, string]> = []
jest.mock('@/lib/supabase/admin', () => ({
  ADMIN_QUERY_TIMEOUT_MS: 8000,
  createAdminClient: () => ({
    from: (table: string) => {
      const builder = {
        select: (columns: string) => {
          selects.push([table, columns])
          return builder
        },
        eq: () => builder,
        limit: async () => ({ data: tables[table] ?? [], error: null }),
        maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      }
      return builder
    },
  }),
}))

const TENANT = '00000000-0000-4000-8000-000000000001'
const CUSTOMER = '77777777-7777-4777-8777-777777777777'
const RELEASE = { minimumVersion: null, latestVersion: null, storeUrl: null }
const APP = { tenantId: TENANT, slug: 'beracah-cafe', status: 'live', ios: RELEASE, android: RELEASE }
const AUTH = { authorization: `Bearer cs1.${'A'.repeat(43)}` }
const PRICING = {
  id: TENANT,
  name: 'Beracah',
  lalamove_enabled: false,
  distance_delivery_enabled: true,
  delivery_price_per_km: 10,
  delivery_min_fee: 50,
  delivery_radius_km: 10,
  free_delivery_min_order: null,
  restaurant_address: '1 Store St, QC',
  restaurant_latitude: 14.6,
  restaurant_longitude: 121.0,
}
const DESTINATION = { address: '12 Mabini St, Quezon City', lat: 14.62, lng: 121.01 }

const placesRequest = (query: string, headers: Record<string, string> = AUTH) =>
  new NextRequest(`http://localhost/api/app/v1/places${query}`, { headers: { 'x-app-id': 'com.webnegosyo.beracah', ...headers } })
const quoteRequest = (body: unknown, headers: Record<string, string> = AUTH) =>
  new NextRequest('http://localhost/api/app/v1/delivery/quote', {
    method: 'POST',
    headers: { 'x-app-id': 'com.webnegosyo.beracah', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const routes = async () => ({
  places: (await import('@/app/api/app/v1/places/route')).GET,
  quote: (await import('@/app/api/app/v1/delivery/quote/route')).POST,
})

const previousSecret = process.env.API_SECRET
beforeEach(() => {
  jest.clearAllMocks()
  selects.length = 0
  process.env.API_SECRET = 'delivery-route-test-secret'
  tables = { tenants: [PRICING], outlets: [] }
  getTenantApp.mockResolvedValue({ app: APP, error: null })
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 })
  resolveCustomerSession.mockResolvedValue({ customerId: CUSTOMER, tokenHash: 'h' })
  readAppOrderTypes.mockResolvedValue([{ type: 'pickup' }, { type: 'delivery' }])
  readActiveOutlets.mockResolvedValue([])
  getStorefrontTenant.mockResolvedValue({ tenant: { id: TENANT, restaurant_latitude: 14.6, restaurant_longitude: 121.0 }, error: null })
  readMapKitConfig.mockReturnValue({ teamId: 't', keyId: 'k', privateKey: 'p' })
  measureRoadDistanceKm.mockResolvedValue(6)
})
afterAll(() => {
  if (previousSecret === undefined) delete process.env.API_SECRET
  else process.env.API_SECRET = previousSecret
})

describe('GET /api/app/v1/places', () => {
  it('needs a signed-in customer of this store', async () => {
    resolveCustomerSession.mockResolvedValue(null)
    const { places } = await routes()
    const response = await places(placesRequest('?q=mabini', {}))
    expect(response.status).toBe(401)
    expect(search).not.toHaveBeenCalled()
    expect(resolveCustomerSession.mock.calls[0][1]).toBe(TENANT)
  })

  it.each([['', 'missing'], ['?q=ab', 'too short'], ['?q=%20%20ab%20', 'short once trimmed'], [`?q=${'a'.repeat(121)}`, 'too long']])(
    'refuses a query that is %s (%s)',
    async (query) => {
      const { places } = await routes()
      const response = await places(placesRequest(query))
      expect(response.status).toBe(400)
      expect(search).not.toHaveBeenCalled()
    },
  )

  it('searches the trimmed query near the store pin and maps to app places (≤ 8)', async () => {
    const raw = Array.from({ length: 10 }, (_, index) => ({
      name: index === 0 ? 'SM North EDSA' : `${index} Mabini St`,
      address: `${index} Mabini St, Quezon City`,
      coordinates: { lat: 14.6 + index / 1000, lng: 121 },
      countryCode: 'PH',
      towns: [],
    }))
    search.mockResolvedValue([{ ...raw[0], address: '' }, ...raw])
    const { places } = await routes()
    const response = await places(placesRequest('?q=%20mabini%20'))
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(appPlacesResultSchema.parse(data)).toEqual(data)
    expect(data.places).toHaveLength(8)
    expect(data.places[0]).toEqual({ name: 'SM North EDSA', address: '0 Mabini St, Quezon City', lat: 14.6, lng: 121 })
    expect(data.places[1].name).toBeNull()
    expect(search).toHaveBeenCalledWith('mabini', { lat: 14.6, lng: 121.0 })
  })

  it('biases to the chosen branch’s pin on a multi-branch store', async () => {
    getStorefrontTenant.mockResolvedValue({ tenant: { id: TENANT, multi_branch_enabled: true, restaurant_latitude: 14.6, restaurant_longitude: 121.0 }, error: null })
    readActiveOutlets.mockResolvedValue([{ id: 'b1', latitude: 14.55, longitude: 121.05 }])
    search.mockResolvedValue([])
    const { places } = await routes()
    await places(placesRequest('?q=mabini&outletId=b1'))
    expect(search).toHaveBeenCalledWith('mabini', { lat: 14.55, lng: 121.05 })
  })

  it('holds each customer to their own burst limit', async () => {
    checkRateLimit.mockImplementation(async (key: string) =>
      key.startsWith('app-places:') ? { allowed: false, remaining: 0, retryAfterSec: 42 } : { allowed: true, remaining: 9, retryAfterSec: 0 },
    )
    const { places } = await routes()
    const response = await places(placesRequest('?q=mabini'))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    expect(checkRateLimit.mock.calls.map(([key]) => key)).toContain(`app-places:${TENANT}:${CUSTOMER}`)
    expect(search).not.toHaveBeenCalled()
  })

  it('answers unavailable (never a crash) when Apple is not configured or fails', async () => {
    const { places } = await routes()
    readMapKitConfig.mockReturnValue(null)
    expect((await places(placesRequest('?q=mabini'))).status).toBe(503)
    readMapKitConfig.mockReturnValue({ teamId: 't', keyId: 'k', privateKey: 'p' })
    search.mockRejectedValue(new Error('quota'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await places(placesRequest('?q=mabini'))).status).toBe(503)
    errorSpy.mockRestore()
  })
})

describe('POST /api/app/v1/delivery/quote', () => {
  it('needs a signed-in customer', async () => {
    resolveCustomerSession.mockResolvedValue(null)
    const { quote } = await routes()
    const response = await quote(quoteRequest({ outletId: null, ...DESTINATION }, {}))
    expect(response.status).toBe(401)
    expect(measureRoadDistanceKm).not.toHaveBeenCalled()
  })

  it('refuses a body without a usable address', async () => {
    const { quote } = await routes()
    expect((await quote(quoteRequest({ outletId: null, address: '', lat: 14.6, lng: 121 }))).status).toBe(400)
    expect((await quote(quoteRequest({ outletId: null, address: 'x', lat: 91, lng: 121 }))).status).toBe(400)
  })

  it('prices a distance store from the build’s tenant, whatever the body says', async () => {
    const { quote } = await routes()
    const response = await quote(quoteRequest({ outletId: null, ...DESTINATION, tenantId: 'someone-else' }))
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(appDeliveryQuoteSchema.parse(data)).toEqual({
      fee: 60, freeDeliveryMinimum: null, etaMinutes: null, quoteToken: null, expiresAt: null, distanceKm: 6,
    })
    expect(readAppOrderTypes).toHaveBeenCalledWith(TENANT)
    const tenantSelect = selects.find(([table]) => table === 'tenants')
    expect(tenantSelect?.[1]).not.toMatch(/\*|lalamove_api_key|lalamove_secret_key/)
  })

  it('refuses an out-of-area address with the store’s words', async () => {
    measureRoadDistanceKm.mockResolvedValue(25)
    const { quote } = await routes()
    const response = await quote(quoteRequest({ outletId: null, ...DESTINATION }))
    expect(response.status).toBe(422)
    expect((await response.json()).error).toEqual({ code: 'refused', message: 'Sorry, this address is outside our delivery area (10 km by road).' })
  })

  it('refuses a branch that is not the tenant’s', async () => {
    tables = { tenants: [{ ...PRICING, multi_branch_enabled: true }], outlets: [{ id: 'b1', name: 'Cubao', is_active: true, supports_delivery: true }] }
    const { quote } = await routes()
    const response = await quote(quoteRequest({ outletId: 'other-store-branch', ...DESTINATION }))
    expect(response.status).toBe(422)
    expect(measureRoadDistanceKm).not.toHaveBeenCalled()
  })

  it('quotes a Lalamove store from its own pin and returns a token the order can verify', async () => {
    tables = { tenants: [{ ...PRICING, lalamove_enabled: true, free_delivery_min_order: 800 }] }
    createLalamoveQuotation.mockResolvedValue({
      quotationId: 'Q-77', price: 149, currency: 'PHP', expiresAt: new Date(Date.now() + 240_000), distance: '0 km', duration: '0 min',
    })
    const { quote } = await routes()
    const response = await quote(quoteRequest({ outletId: null, ...DESTINATION, address: `  ${DESTINATION.address} ` }))
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(appDeliveryQuoteSchema.parse(data)).toMatchObject({ fee: 149, freeDeliveryMinimum: 800, distanceKm: null })
    expect(Date.parse(data.expiresAt)).toBeLessThanOrEqual(Date.now() + 240_000)

    const [, pickupAddress, pickup, dropAddress, drop] = createLalamoveQuotation.mock.calls[0]
    expect([pickupAddress, pickup]).toEqual(['1 Store St, QC', { lat: 14.6, lng: 121.0 }])
    expect([dropAddress, drop]).toEqual([DESTINATION.address, { lat: DESTINATION.lat, lng: DESTINATION.lng }])
    expect(checkRateLimit.mock.calls.map(([key]) => key)).toContain(`lalamove-quote:${TENANT}`)
    expect(measureRoadDistanceKm).not.toHaveBeenCalled()

    // What the orders route will do with `delivery.quoteToken`.
    const { decodeAppQuoteToken } = await import('@/lib/app-api/delivery/quote-token')
    const { verifyDeliveryQuote } = await import('@/lib/checkout/delivery-quote-signature')
    const parts = decodeAppQuoteToken(data.quoteToken)
    expect(verifyDeliveryQuote(parts?.signature, { tenantId: TENANT, quotationId: parts?.quotationId, destination: DESTINATION })).toEqual({ ok: true, fee: 149 })
  })

  it('refuses a store that does not deliver', async () => {
    readAppOrderTypes.mockResolvedValue([{ type: 'pickup' }])
    const { quote } = await routes()
    const response = await quote(quoteRequest({ outletId: null, ...DESTINATION }))
    expect(response.status).toBe(422)
    expect(createLalamoveQuotation).not.toHaveBeenCalled()
  })
})
