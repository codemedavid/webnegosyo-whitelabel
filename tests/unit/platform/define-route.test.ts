/**
 * @jest-environment node
 *
 * `defineRoute` is the one way into an API route: the declaration says who may
 * call, how often and what the input looks like, and the handler runs only
 * after all three held. The checks are the app's existing helpers, so those
 * are the seams mocked here; everything between them and the handler is real.
 */

import { NextRequest, NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SUBSCRIPTION_PAUSED_MESSAGE, SubscriptionPausedError } from '@/lib/billing/subscription-gate'
import { PlatformAccessError } from '@/lib/platform-staff/guard'
import { ORDER_READ_KEYS } from '@/lib/staff-permissions'
import { getRequestBearerToken } from '@/lib/supabase/bearer-session'
import { defineRoute } from '@/platform/http/define-route'
import { describeEntry } from '@/platform/http/entry'

const mockBearerStore = jest.fn()
const mockAuthenticate = jest.fn()
const mockVerifyAdmin = jest.fn()
const mockVerifyPermission = jest.fn()
const mockRequestCaller = jest.fn()
const mockPlatformPermission = jest.fn()
const mockFullSuperadmin = jest.fn()
const mockRateLimit = jest.fn()
const mockOutletRow = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@/lib/auth/bearer-caller', () => ({
  requireBearerStoreCaller: (...args: unknown[]) => mockBearerStore(...args),
  authenticateBearer: (...args: unknown[]) => mockAuthenticate(...args),
}))
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: (...args: unknown[]) => mockVerifyAdmin(...args),
  verifyTenantPermission: (...args: unknown[]) => mockVerifyPermission(...args),
}))
jest.mock('@/lib/auth/request-caller', () => ({ getRequestCaller: () => mockRequestCaller() }))
jest.mock('@/lib/platform-staff/guard', () => ({
  ...jest.requireActual<typeof import('@/lib/platform-staff/guard')>('@/lib/platform-staff/guard'),
  requirePlatformPermission: (...args: unknown[]) => mockPlatformPermission(...args),
  requireFullSuperadmin: () => mockFullSuperadmin(),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))
jest.mock('@/lib/supabase/server', () => ({ createClient: async () => outletClient() }))
jest.mock('@sentry/nextjs', () => ({ captureException: (...args: unknown[]) => mockCaptureException(...args) }))

const TENANT = 'store-1'
const OTHER_TENANT = 'store-2'
const NORTH = 'branch-north'
const SOUTH = 'branch-south'
const USER = { id: 'user-1', email: 'ana@example.com' }

/** A client whose `outlets` lookup answers with `mockOutletRow()`. */
function outletClient() {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mockOutletRow(), error: null }) }
  return { from: () => query }
}

function account(overrides: Record<string, unknown> = {}) {
  return { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['pos'], outlet_id: null, ...overrides }
}

function bearerCaller(appUser: Record<string, unknown> | null = account()) {
  return { ok: true, user: USER, supabase: outletClient(), appUser }
}

function helperRefusal(status: 401 | 403) {
  return { ok: false, response: NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status }) }
}

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/thing', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function get(path = '/api/thing', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, { headers })
}

const handler = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  handler.mockImplementation(() => NextResponse.json({ ok: true }))
  mockBearerStore.mockResolvedValue(bearerCaller())
  mockAuthenticate.mockResolvedValue(bearerCaller())
  mockVerifyAdmin.mockResolvedValue({ user: USER, userRole: account() })
  mockVerifyPermission.mockResolvedValue({ user: USER, userRole: account() })
  mockRequestCaller.mockResolvedValue({ user: USER, appUser: account(), roleError: null })
  mockPlatformPermission.mockResolvedValue({ user: USER, appUser: { role: 'superadmin', tenant_id: null } })
  mockFullSuperadmin.mockResolvedValue({ user: USER, appUser: { role: 'superadmin', tenant_id: null } })
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSec: 1 })
  mockOutletRow.mockReturnValue({ id: SOUTH })
})

afterEach(() => jest.restoreAllMocks())

const tenantBody = z.object({ tenantId: z.string().min(1), note: z.string().optional() })

describe('staff, Bearer-only (the merchant app)', () => {
  const route = (permission: 'pos' | 'any-staff' | typeof ORDER_READ_KEYS = 'pos') =>
    defineRoute({
      auth: { kind: 'staff', session: 'bearer', permission, branch: 'any', access: 'view', storeClaim: ({ body }) => body.tenantId },
      body: tenantBody,
      handler,
    })

  it('runs the handler for a member holding the feature, through requireBearerStoreCaller', async () => {
    const request = post({ tenantId: TENANT, note: 'hi' })
    const response = await route()(request)

    expect(response.status).toBe(200)
    expect(mockBearerStore).toHaveBeenCalledWith(request, TENANT, 'view')
    expect(handler.mock.calls[0][0]).toMatchObject({ tenant: TENANT, user: USER, body: { tenantId: TENANT, note: 'hi' } })
  })

  it('hands back the helper’s own 401 when there is no valid token', async () => {
    const refusal = helperRefusal(401)
    mockBearerStore.mockResolvedValue(refusal)

    const response = await route()(post({ tenantId: TENANT }))

    expect(response).toBe(refusal.response)
    expect(handler).not.toHaveBeenCalled()
  })

  it('hands back the helper’s own 403 when the caller is not a member of the named store', async () => {
    mockBearerStore.mockResolvedValue(helperRefusal(403))

    const response = await route()(post({ tenantId: OTHER_TENANT }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses a member who lacks the permission key', async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ permissions: ['kitchen'] })))

    const response = await route()(post({ tenantId: TENANT }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('takes a list of keys as "any one of them"', async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ permissions: ['kitchen'] })))
    expect((await route(ORDER_READ_KEYS)(post({ tenantId: TENANT }))).status).toBe(200)

    mockBearerStore.mockResolvedValue(bearerCaller(account({ permissions: ['menu'] })))
    expect((await route(ORDER_READ_KEYS)(post({ tenantId: TENANT }))).status).toBe(403)
  })

  it("lets any member through only when the entry says 'any-staff'", async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ permissions: [] })))

    expect((await route('any-staff')(post({ tenantId: TENANT }))).status).toBe(200)
    expect((await route('pos')(post({ tenantId: TENANT }))).status).toBe(403)
  })

  it('validates the body before the access check, with a message that names nothing', async () => {
    const response = await route()(post({ note: 5 }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid request' })
    expect(mockBearerStore).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it('treats a body that is not JSON as invalid', async () => {
    expect((await route()(post('not json'))).status).toBe(400)
  })

  it('refuses when the access check itself fails, without leaking why', async () => {
    mockBearerStore.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'))

    const response = await route()(post({ tenantId: TENANT }))

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('ECONNREFUSED')
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('the store is never taken from the request on trust', () => {
  it('uses the caller’s own store when the entry names no claim, whatever the body says', async () => {
    const route = defineRoute({
      auth: { kind: 'staff', session: 'bearer', permission: 'pos', branch: 'any' },
      body: z.object({ tenantId: z.string() }),
      handler,
    })

    const response = await route(post({ tenantId: OTHER_TENANT }))

    expect(response.status).toBe(200)
    expect(handler.mock.calls[0][0].tenant).toBe(TENANT)
    expect(mockBearerStore).not.toHaveBeenCalled()
  })

  it('refuses an account with no store of its own when no store is named', async () => {
    mockAuthenticate.mockResolvedValue(bearerCaller({ role: 'superadmin', tenant_id: null }))
    const route = defineRoute({ auth: { kind: 'staff', session: 'bearer', permission: 'any-staff', branch: 'any' }, handler })

    const response = await route(post({}))

    expect(response.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('treats a named store as a claim the access check decides', async () => {
    mockVerifyPermission.mockRejectedValue(new Error('Unauthorized: Not admin of this tenant'))
    const route = defineRoute({
      auth: { kind: 'staff', permission: 'menu', branch: 'any', storeClaim: ({ body }) => body.tenantId },
      body: tenantBody,
      handler,
    })

    const response = await route(post({ tenantId: OTHER_TENANT }))

    expect(mockVerifyPermission).toHaveBeenCalledWith(OTHER_TENANT, 'menu', 'edit')
    expect(response.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('uses the session account’s store for a cookie caller that names none', async () => {
    const route = defineRoute({
      auth: { kind: 'staff', permission: 'any-staff', branch: 'any', access: 'view' },
      body: z.object({ tenantId: z.string() }),
      handler,
    })

    await route(post({ tenantId: OTHER_TENANT }))

    expect(mockVerifyAdmin).toHaveBeenCalledWith(TENANT, 'view')
    expect(handler.mock.calls[0][0].tenant).toBe(TENANT)
  })
})

describe('staff, cookie session or Bearer (the web admin and the app)', () => {
  const route = defineRoute({
    auth: { kind: 'staff', permission: 'inventory', branch: 'any', storeClaim: ({ body }) => body.tenantId },
    body: tenantBody,
    handler,
  })

  it('checks the key through verifyTenantPermission, on the default verb', async () => {
    const response = await route(post({ tenantId: TENANT }))

    expect(response.status).toBe(200)
    expect(mockVerifyPermission).toHaveBeenCalledWith(TENANT, 'inventory', 'edit')
    expect(handler.mock.calls[0][0]).toMatchObject({ tenant: TENANT, user: USER })
  })

  it('runs as the Bearer user when the request carries a token', async () => {
    handler.mockImplementation(() => NextResponse.json({ token: getRequestBearerToken() }))

    const withToken = await route(post({ tenantId: TENANT }, { authorization: 'Bearer app-token' }))
    const withCookie = await route(post({ tenantId: TENANT }))

    expect(await withToken.json()).toEqual({ token: 'app-token' })
    expect(await withCookie.json()).toEqual({ token: null })
  })

  it.each([
    ['Unauthorized: Not authenticated', 401, 'Unauthorized'],
    ['Unauthorized: User role not found', 403, 'Forbidden'],
    ['Unauthorized: Not admin of this tenant', 403, 'Forbidden'],
    ['Unauthorized: Missing permission for this feature', 403, 'Forbidden'],
  ])('maps "%s" to %i', async (message, status, error) => {
    mockVerifyPermission.mockRejectedValue(new Error(message))

    const response = await route(post({ tenantId: TENANT }))

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses a paused store with the sentence written for the merchant', async () => {
    mockVerifyPermission.mockRejectedValue(new SubscriptionPausedError())

    const response = await route(post({ tenantId: TENANT }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: SUBSCRIPTION_PAUSED_MESSAGE })
  })

  it('fails closed when the check throws something it does not recognise', async () => {
    mockVerifyPermission.mockRejectedValue(new Error('relation "app_users" does not exist'))

    const response = await route(post({ tenantId: TENANT }))

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('app_users')
    expect(handler).not.toHaveBeenCalled()
  })

  it('checks a key list as any-of, after membership', async () => {
    const listed = defineRoute({
      auth: { kind: 'staff', permission: ORDER_READ_KEYS, branch: 'any', access: 'view', storeClaim: ({ body }) => body.tenantId },
      body: tenantBody,
      handler,
    })
    mockVerifyAdmin.mockResolvedValue({ user: USER, userRole: account({ permissions: ['menu'] }) })

    const response = await listed(post({ tenantId: TENANT }))

    expect(mockVerifyAdmin).toHaveBeenCalledWith(TENANT, 'view')
    expect(response.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('branch rules', () => {
  const route = (branch: 'own' | 'store-wide' | 'any', withClaim = false) =>
    defineRoute({
      auth: {
        kind: 'staff',
        session: 'bearer',
        permission: 'pos',
        branch,
        storeClaim: ({ body }) => body.tenantId,
        ...(withClaim ? { branchClaim: ({ body }: { body: { outletId?: string | null } }) => body.outletId } : {}),
      },
      body: z.object({ tenantId: z.string(), outletId: z.string().nullable().optional() }),
      handler,
    })

  it("'store-wide' refuses a branch-locked account", async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ outlet_id: NORTH })))

    const response = await route('store-wide')(post({ tenantId: TENANT }))

    expect(response.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it("'store-wide' admits an owner even with a branch on the account", async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ outlet_id: NORTH, is_owner: true })))

    expect((await route('store-wide')(post({ tenantId: TENANT }))).status).toBe(200)
  })

  it("'own' acts for a branch account’s own branch", async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ outlet_id: NORTH })))

    await route('own')(post({ tenantId: TENANT }))

    const context = handler.mock.calls[0][0]
    expect(context.outletId).toBe(NORTH)
    expect(context.branch).toEqual({ kind: 'branch', outletId: NORTH })
  })

  it("'own' refuses a branch account naming another branch", async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ outlet_id: NORTH })))

    const response = await route('own', true)(post({ tenantId: TENANT, outletId: SOUTH }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'You can only act for your own branch.' })
    expect(handler).not.toHaveBeenCalled()
  })

  it("'own' lets a store-wide account name one of the store’s branches", async () => {
    await route('own', true)(post({ tenantId: TENANT, outletId: SOUTH }))

    expect(handler.mock.calls[0][0].outletId).toBe(SOUTH)
  })

  it("'own' refuses a branch that is not the store’s", async () => {
    mockOutletRow.mockReturnValue(null)

    const response = await route('own', true)(post({ tenantId: TENANT, outletId: 'elsewhere' }))

    expect(response.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it("'any' leaves the branch to the handler, which can still read the caller’s scope", async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ outlet_id: NORTH })))

    await route('any')(post({ tenantId: TENANT }))

    expect(handler.mock.calls[0][0].branch).toEqual({ kind: 'branch', outletId: NORTH })
  })
})

describe('superadmin', () => {
  const route = defineRoute({ auth: { kind: 'superadmin', permission: 'tenants.view' }, handler })

  it('admits a console account holding the grant', async () => {
    const response = await route(get())

    expect(response.status).toBe(200)
    expect(mockPlatformPermission).toHaveBeenCalledWith('tenants.view')
    expect(handler.mock.calls[0][0].user).toEqual(USER)
  })

  it.each([
    ['Unauthorized: Not authenticated', 401, 'Not authenticated'],
    ['Forbidden: You do not have access to do this', 403, 'You do not have access to do this'],
  ])('answers "%s" in the console envelope, uncached', async (message, status, error) => {
    mockPlatformPermission.mockRejectedValue(new PlatformAccessError(message))

    const response = await route(get())

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ success: false, data: null, error })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(handler).not.toHaveBeenCalled()
  })

  it("asks for a full superadmin when the entry says 'full-superadmin'", async () => {
    mockFullSuperadmin.mockRejectedValue(new PlatformAccessError('Forbidden: Superadmin access required'))
    const full = defineRoute({ auth: { kind: 'superadmin', permission: 'full-superadmin' }, handler })

    expect((await full(get())).status).toBe(403)
    expect(mockPlatformPermission).not.toHaveBeenCalled()
  })

  it('fails closed on an unexpected error', async () => {
    mockPlatformPermission.mockRejectedValue(new Error('fetch failed'))

    expect((await route(get())).status).toBe(500)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('cron', () => {
  const route = defineRoute({ auth: { kind: 'cron' }, handler })
  const original = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
  })
  afterAll(() => {
    process.env.CRON_SECRET = original
  })

  it('admits the cron bearer', async () => {
    expect((await route(get('/api/tick', { authorization: 'Bearer cron-secret' }))).status).toBe(200)
  })

  it.each([[undefined], ['Bearer nope'], ['cron-secret'], ['Bearer cron-secretx'], ['bearer cron-secret']])('refuses %p', async (authorization) => {
    const response = await route(get('/api/tick', authorization ? { authorization } : {}))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(handler).not.toHaveBeenCalled()
  })

  it('never authorizes while the secret is unset', async () => {
    delete process.env.CRON_SECRET

    expect((await route(get('/api/tick', { authorization: 'Bearer undefined' }))).status).toBe(401)
    expect((await route(get('/api/tick', { authorization: 'Bearer ' }))).status).toBe(401)
  })
})

describe('device', () => {
  const verify = jest.fn()
  const route = defineRoute({ auth: { kind: 'device', scheme: 'test device', verify }, handler })

  it('hands the verified device to the handler', async () => {
    verify.mockResolvedValue({ deviceId: 'phone-1' })

    expect((await route(get())).status).toBe(200)
    expect(handler.mock.calls[0][0].device).toEqual({ deviceId: 'phone-1' })
  })

  it('refuses when the credential is not recognised', async () => {
    verify.mockResolvedValue(null)

    expect((await route(get())).status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses when the check throws', async () => {
    verify.mockRejectedValue(new Error('rpc down'))

    const response = await route(get())

    expect(response.status).toBe(401)
    expect(JSON.stringify(await response.json())).not.toContain('rpc down')
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('signature', () => {
  const verify = jest.fn()
  const route = defineRoute({
    auth: { kind: 'signature', scheme: 'test hmac', verify },
    body: z.object({ event: z.string() }),
    handler,
  })

  it('verifies over the raw body, then parses that same body', async () => {
    verify.mockResolvedValue(true)
    const raw = '{"event":"paid" }'

    const response = await route(post(raw))

    expect(response.status).toBe(200)
    expect(verify.mock.calls[0][1]).toBe(raw)
    expect(handler.mock.calls[0][0].body).toEqual({ event: 'paid' })
  })

  it.each([[false], [undefined], ['yes']])('refuses when verify answers %p', async (answer) => {
    verify.mockResolvedValue(answer)

    expect((await route(post({ event: 'paid' }))).status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses when verify throws', async () => {
    verify.mockRejectedValue(new Error('bad key'))

    expect((await route(post({ event: 'paid' }))).status).toBe(401)
  })
})

describe('public', () => {
  it('counts by address before reading anything, and answers 429 with Retry-After', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 42 })
    const route = defineRoute({
      auth: { kind: 'public' },
      rateLimit: { bucket: 'menu-peek', per: 'ip', max: 30, window: '1m', onRedisFailure: 'instance' },
      body: z.object({ slug: z.string() }),
      handler,
    })

    const response = await route(post('not even json', { 'x-real-ip': '203.0.113.9' }))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    expect(await response.json()).toEqual({ error: 'Too many requests' })
    expect(mockRateLimit).toHaveBeenCalledWith('menu-peek:203.0.113.9', { limit: 30, windowSec: 60, onRedisFailure: 'instance' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs unlimited only when the entry says so, with a reason', async () => {
    const route = defineRoute({ auth: { kind: 'public' }, rateLimit: { per: 'none', reason: 'static JSON, CDN cached' }, handler })

    expect((await route(get())).status).toBe(200)
    expect(mockRateLimit).not.toHaveBeenCalled()
  })
})

describe('rate limit for a signed-in caller', () => {
  const route = defineRoute({
    auth: { kind: 'staff', session: 'bearer', permission: 'pos', branch: 'any', storeClaim: ({ body }) => body.tenantId },
    rateLimit: { bucket: 'reprint', per: 'user', max: 60, window: '1m' },
    body: tenantBody,
    handler,
  })

  it('counts per person, after the caller is known', async () => {
    await route(post({ tenantId: TENANT }))

    expect(mockRateLimit).toHaveBeenCalledWith('reprint:user-1', { limit: 60, windowSec: 60, onRedisFailure: undefined })
  })

  it('answers 429 when the limit is hit', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 7 })

    const response = await route(post({ tenantId: TENANT }))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('7')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not count a caller who was refused', async () => {
    mockBearerStore.mockResolvedValue(helperRefusal(401))

    await route(post({ tenantId: TENANT }))

    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it('counts per store when asked', async () => {
    const perStore = defineRoute({
      auth: { kind: 'staff', session: 'bearer', permission: 'pos', branch: 'any', storeClaim: ({ body }) => body.tenantId },
      rateLimit: { bucket: 'export', per: 'store', max: 5, window: '1h' },
      body: tenantBody,
      handler,
    })

    await perStore(post({ tenantId: TENANT }))

    expect(mockRateLimit).toHaveBeenCalledWith(`export:${TENANT}`, { limit: 5, windowSec: 3600, onRedisFailure: undefined })
  })
})

describe('input', () => {
  it('reads the first value of each query key and dynamic params through their schemas', async () => {
    const route = defineRoute({
      auth: { kind: 'cron' },
      query: z.object({ day: z.string() }),
      params: z.object({ id: z.string().uuid() }),
      handler,
    })
    process.env.CRON_SECRET = 'cron-secret'
    const id = '11111111-1111-4111-8111-111111111111'

    const response = await route(
      get('/api/thing/x?day=mon&day=tue&extra=1', { authorization: 'Bearer cron-secret' }),
      { params: Promise.resolve({ id }) },
    )

    expect(response.status).toBe(200)
    expect(handler.mock.calls[0][0]).toMatchObject({ query: { day: 'mon' }, params: { id } })
  })

  it('answers 400 for params that fail their schema', async () => {
    const route = defineRoute({
      auth: { kind: 'public' },
      rateLimit: { per: 'none', reason: 'test' },
      params: z.object({ id: z.string().uuid() }),
      handler,
    })

    expect((await route(get(), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(400)
  })
})

describe('a handler that throws', () => {
  const route = defineRoute({ auth: { kind: 'public' }, rateLimit: { per: 'none', reason: 'test' }, handler })

  it('answers 500 with a fixed sentence and keeps the error for the log and Sentry', async () => {
    const failure = new Error('duplicate key value violates unique constraint "orders_pkey"')
    handler.mockRejectedValue(failure)

    const response = await route(get())
    const text = JSON.stringify(await response.json())

    expect(response.status).toBe(500)
    expect(text).toBe(JSON.stringify({ error: 'Something went wrong. Please try again.' }))
    expect(text).not.toContain('orders_pkey')
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).toContain('orders_pkey')
    await new Promise((resolve) => setImmediate(resolve))
    expect(mockCaptureException).toHaveBeenCalledWith(failure, expect.anything())
  })

  it('lets redirect() through instead of answering 500', async () => {
    handler.mockImplementation(() => redirect('/elsewhere'))

    await expect(route(get())).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
  })
})

describe('onRefusal', () => {
  it('lets a route keep the wording its callers already parse, code by code', async () => {
    mockBearerStore.mockResolvedValue(bearerCaller(account({ permissions: [] })))
    const route = defineRoute({
      auth: { kind: 'staff', session: 'bearer', permission: 'pos', branch: 'any', storeClaim: ({ body }) => body.tenantId },
      body: tenantBody,
      onRefusal: (refusal) =>
        refusal.code === 'permission'
          ? NextResponse.json({ error: 'You do not have permission for this.' }, { status: 403 })
          : undefined,
      handler,
    })

    const worded = await route(post({ tenantId: TENANT }))
    const defaulted = await route(post({}))

    expect(await worded.json()).toEqual({ error: 'You do not have permission for this.' })
    expect(defaulted.status).toBe(400)
    expect(await defaulted.json()).toEqual({ error: 'Invalid request' })
  })
})

describe('a declaration that says too little fails when the module loads', () => {
  const define = defineRoute as unknown as (declaration: Record<string, unknown>) => unknown

  it.each([
    ['staff without a permission', { auth: { kind: 'staff', branch: 'any' } }, /permission/],
    ['staff with an empty key list', { auth: { kind: 'staff', permission: [], branch: 'any' } }, /permission/],
    ['staff without a branch rule', { auth: { kind: 'staff', permission: 'pos' } }, /branch/],
    ['a branch claim outside branch: own', { auth: { kind: 'staff', permission: 'pos', branch: 'any', branchClaim: () => null } }, /branchClaim/],
    ['superadmin without a grant', { auth: { kind: 'superadmin' } }, /console grant/],
    ['public without a rate limit', { auth: { kind: 'public' } }, /rateLimit/],
    ['"none" without a reason', { auth: { kind: 'public' }, rateLimit: { per: 'none', reason: ' ' } }, /reason/],
    ['a per-person limit with nobody signed in', { auth: { kind: 'public' }, rateLimit: { bucket: 'b', per: 'user', max: 1, window: '1m' } }, /per must be 'ip'/],
    ['a window that is not a duration', { auth: { kind: 'cron' }, rateLimit: { bucket: 'b', per: 'ip', max: 1, window: 'soon' } }, /duration/],
    ['a limit of zero', { auth: { kind: 'cron' }, rateLimit: { bucket: 'b', per: 'ip', max: 0, window: '1m' } }, /max/],
    ['a signature without its verifier', { auth: { kind: 'signature', scheme: 'x' } }, /verify/],
  ])('%s', (_name, declaration, message) => {
    expect(() => define({ handler, ...declaration })).toThrow(message)
  })
})

describe('the declaration travels with the export', () => {
  it('describes who may call and the limit, as data', () => {
    const route = defineRoute({
      auth: { kind: 'staff', permission: 'inventory', branch: 'own', storeClaim: ({ body }) => body.tenantId },
      rateLimit: { bucket: 'count', per: 'user', max: 30, window: '1m' },
      body: tenantBody,
      handler,
    })

    expect(describeEntry(route)).toEqual({
      type: 'route',
      auth: { kind: 'staff', permission: 'inventory', branch: 'own', access: 'edit', session: 'cookie-or-bearer', namesStore: true },
      rateLimit: { bucket: 'count', per: 'user', max: 30, window: '1m' },
      validates: ['body'],
    })
    expect(Object.keys(route)).toEqual([])
    expect(describeEntry(() => undefined)).toBeNull()
  })
})

/** Compile-time half of the contract: checked by `tsc`, never run. */
export function typeContract() {
  const respond = () => NextResponse.json({})
  // @ts-expect-error a public route must state its rate limit
  defineRoute({ auth: { kind: 'public' }, handler: respond })
  // @ts-expect-error a staff route must name its permission
  defineRoute({ auth: { kind: 'staff', branch: 'any' }, handler: respond })
  // @ts-expect-error a staff route must state its branch rule
  defineRoute({ auth: { kind: 'staff', permission: 'pos' }, handler: respond })
  // @ts-expect-error a cron route is given no store
  defineRoute({ auth: { kind: 'cron' }, handler: ({ tenant }) => NextResponse.json({ tenant }) })
  defineRoute({
    auth: { kind: 'device', scheme: 'x', verify: async () => ({ deviceId: 'd' }) },
    handler: ({ device }) => NextResponse.json({ id: device.deviceId }),
  })
}
