/** @jest-environment node */
import { NextRequest } from 'next/server'
import { appCatalogSchema, appConfigSchema, appResolveSchema } from '@/lib/app-contract'
import { createTestMenuItem } from '../../fixtures/menu-item.fixture'

jest.mock('server-only', () => ({}))

const getTenantApp = jest.fn()
jest.mock('@/lib/app-api/tenant-app', () => ({ getTenantApp: (...a: unknown[]) => getTenantApp(...a) }))

const checkRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }))

const captureException = jest.fn()
jest.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

const getStorefrontTenant = jest.fn()
jest.mock('@/lib/storefront/storefront-tenant', () => ({ getStorefrontTenant: (...a: unknown[]) => getStorefrontTenant(...a) }))

const getStorefrontMenu = jest.fn()
jest.mock('@/lib/storefront/storefront-menu', () => ({ getStorefrontMenu: (...a: unknown[]) => getStorefrontMenu(...a) }))

const readOrderTypes = jest.fn()
const readPaymentMethods = jest.fn()
jest.mock('@/lib/checkout/load-checkout-config', () => ({
  readOrderTypes: (...a: unknown[]) => readOrderTypes(...a),
  readPaymentMethods: (...a: unknown[]) => readPaymentMethods(...a),
}))

const readPublishedAppConfig = jest.fn()
const readLoyaltyFlags = jest.fn()
const readComplementaryPairs = jest.fn()
jest.mock('@/lib/app-api/store-reads', () => {
  const actual = jest.requireActual('@/lib/app-api/store-reads')
  return {
    AppReadError: actual.AppReadError,
    readPublishedAppConfig: (...a: unknown[]) => readPublishedAppConfig(...a),
    readLoyaltyFlags: (...a: unknown[]) => readLoyaltyFlags(...a),
    readComplementaryPairs: (...a: unknown[]) => readComplementaryPairs(...a),
    readAppOrderTypes: (tenantId: string) => readOrderTypes({}, tenantId),
    readAppPaymentMethods: (tenantId: string) => readPaymentMethods({}, tenantId),
    readActiveOutlets: async () => [],
  }
})

jest.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({}) }))

const APP_ID = 'com.webnegosyo.kapedemo'
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const RELEASE = { minimumVersion: null, latestVersion: '1.0.0', storeUrl: null }
const APP = { tenantId: TENANT_ID, slug: 'kape', status: 'live', ios: RELEASE, android: RELEASE }
const TENANT = { id: TENANT_ID, slug: 'kape', name: 'Kape Demo' }

const request = (path: string, headers: Record<string, string> = { 'x-app-id': APP_ID, 'x-vercel-forwarded-for': '203.0.113.7' }) =>
  new NextRequest(`http://localhost${path}`, { headers })

beforeEach(() => {
  jest.clearAllMocks()
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 1 })
  getTenantApp.mockResolvedValue({ app: APP, error: null })
  getStorefrontTenant.mockResolvedValue({ tenant: TENANT, error: null })
  readPublishedAppConfig.mockResolvedValue({ published: null, version: 0 })
  readLoyaltyFlags.mockResolvedValue({ loyalty_enabled: false, loyalty_shadow: true })
  readOrderTypes.mockResolvedValue([{ id: 'ot-1', type: 'pickup', name: 'Pick Up', is_enabled: true, available_on_web: true }])
  readPaymentMethods.mockResolvedValue([{ id: 'pm-1', name: 'Cash', skip_payment_details: true, payment_method_order_types: [] }])
  readComplementaryPairs.mockResolvedValue([])
  getStorefrontMenu.mockResolvedValue({
    status: 'ready',
    tenant: TENANT,
    error: null,
    categories: [{ id: 'cat-1', name: 'Coffee', is_active: true, order: 0 }],
    menuItems: [createTestMenuItem({ id: 'latte', category_id: 'cat-1' })],
    bundles: [],
    outlets: [],
    outletsFailed: false,
    menuOverrides: [],
    overridesFailed: false,
  })
})

const routes = async () => ({
  resolve: (await import('@/app/api/app/v1/resolve/route')).GET,
  config: (await import('@/app/api/app/v1/config/route')).GET,
  catalog: (await import('@/app/api/app/v1/catalog/route')).GET,
})

describe('customer app API', () => {
  it('resolves the build to its store and release gate', async () => {
    const { resolve } = await routes()
    const response = await resolve(request('/api/app/v1/resolve'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(appResolveSchema.parse(body.data)).toEqual(APP)
    expect(getTenantApp).toHaveBeenCalledWith(APP_ID)
  })

  it('refuses a request without a valid app id before any lookup', async () => {
    const { config } = await routes()
    const response = await config(request('/api/app/v1/config', { 'x-app-id': 'not an id' }))
    expect(response.status).toBe(400)
    expect(getTenantApp).not.toHaveBeenCalled()
  })

  it('answers not_found for a build no store owns', async () => {
    getTenantApp.mockResolvedValue({ app: null, error: null })
    const { config } = await routes()
    const response = await config(request('/api/app/v1/config'))
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('not_found')
  })

  it('lets a paused store resolve but not load data', async () => {
    getTenantApp.mockResolvedValue({ app: { ...APP, status: 'paused' }, error: null })
    const { resolve, catalog } = await routes()
    expect((await resolve(request('/api/app/v1/resolve'))).status).toBe(200)
    expect((await catalog(request('/api/app/v1/catalog'))).status).toBe(503)
  })

  it('rate limits per IP and tells the app when to retry', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })
    const { config } = await routes()
    const response = await config(request('/api/app/v1/config'))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('30')
    expect(checkRateLimit.mock.calls[0][0]).toBe('app:config:203.0.113.7')
    expect(checkRateLimit.mock.calls[0][1]).toMatchObject({ onRedisFailure: 'instance' })
  })

  it('counts callers without an address in one shared bucket instead of skipping the limit', async () => {
    const { config } = await routes()
    await config(request('/api/app/v1/config', { 'x-app-id': APP_ID }))
    expect(checkRateLimit.mock.calls[0][0]).toBe('app:config:unknown')
  })

  it('honours a weak or listed ETag (compression rewrites strong ones)', async () => {
    const { config } = await routes()
    const etag = (await config(request('/api/app/v1/config'))).headers.get('etag') as string
    const weak = await config(request('/api/app/v1/config', { 'x-app-id': APP_ID, 'if-none-match': `"other", W/${etag}` }))
    expect(weak.status).toBe(304)
    expect(weak.headers.get('vary')).toBe('X-App-Id')
  })

  it('serves a contract-valid config with an ETag, and 304 when the phone has it', async () => {
    const { config } = await routes()
    const first = await config(request('/api/app/v1/config'))
    expect(first.status).toBe(200)
    expect(appConfigSchema.safeParse((await first.json()).data).success).toBe(true)
    const etag = first.headers.get('etag') as string
    const second = await config(request('/api/app/v1/config', { 'x-app-id': APP_ID, 'if-none-match': etag }))
    expect(second.status).toBe(304)
  })

  it('reads the store from the build, never from the request', async () => {
    const { config } = await routes()
    await config(request('/api/app/v1/config?slug=someone-else'))
    expect(getStorefrontTenant).toHaveBeenCalledWith('kape')
  })

  it('serves a contract-valid catalog', async () => {
    const { catalog } = await routes()
    const response = await catalog(request('/api/app/v1/catalog'))
    expect(response.status).toBe(200)
    const parsed = appCatalogSchema.safeParse((await response.json()).data)
    expect(parsed.success ? null : parsed.error.issues).toBeNull()
  })

  it('refuses a branch that is not one of the store’s', async () => {
    const { catalog } = await routes()
    const response = await catalog(request(`/api/app/v1/catalog?outletId=00000000-0000-4000-8000-0000000000ff`))
    expect(response.status).toBe(400)
  })

  it('says unavailable rather than serving a store-wide menu when the branch read failed', async () => {
    getStorefrontMenu.mockResolvedValue({ ...(await getStorefrontMenu()), outletsFailed: true })
    const { catalog } = await routes()
    const response = await catalog(request('/api/app/v1/catalog'))
    expect(response.status).toBe(503)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports an unexpected failure to Sentry and answers internal', async () => {
    readOrderTypes.mockImplementation(() => {
      throw new TypeError('boom')
    })
    const { config } = await routes()
    const response = await config(request('/api/app/v1/config'))
    expect(response.status).toBe(500)
    expect(captureException).toHaveBeenCalled()
  })
})
