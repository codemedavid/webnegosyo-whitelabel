/**
 * @jest-environment node
 *
 * The wrappers stand on the access helpers the app already has, and word
 * their refusals the way the hand-written routes do. These run the REAL
 * helpers (only the session beneath them is stubbed) so a helper that changes
 * a message, or a wrapper that drifts from a dialect, fails here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SUBSCRIPTION_PAUSED_MESSAGE } from '@/lib/billing/subscription-gate'
import { respond } from '@/lib/loyalty/merchant-http'
import { platformPermissionResponse } from '@/lib/platform-staff/guard'
import { defineAction } from '@/platform/http/define-action'
import { defineRoute } from '@/platform/http/define-route'

const mockCaller = jest.fn()
const mockSubscription = jest.fn()
const mockSessionUser = jest.fn()
const mockAppUserRow = jest.fn()

jest.mock('@/lib/auth/request-caller', () => ({
  getRequestCaller: () => mockCaller(),
  getRequestSubscription: () => mockSubscription(),
}))
// Beneath the console guard and the Bearer prologue: the session and the app_users read.
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockSessionUser() }, error: null }) } }),
}))
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: mockSessionUser() }, error: null }) } }),
}))
jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: async () => ({ appUser: mockAppUserRow(), error: null }),
}))

const TENANT = 'store-1'
const USER = { id: 'user-1', email: 'ana@example.com' }
const handler = jest.fn()

function account(overrides: Record<string, unknown> = {}) {
  return { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['menu'], outlet_id: null, ...overrides }
}

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/thing', { method: 'POST', headers, body: JSON.stringify(body) })
}

async function snapshot(response: Response) {
  return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  handler.mockImplementation(() => NextResponse.json({ ok: true }))
  mockCaller.mockResolvedValue({ user: USER, appUser: account(), roleError: null })
  mockSubscription.mockResolvedValue(null)
  mockSessionUser.mockReturnValue(USER)
  mockAppUserRow.mockReturnValue(account())
})

describe('staff over a cookie session: the real verifyTenantAdmin / verifyTenantPermission', () => {
  const route = defineRoute({
    auth: { kind: 'staff', permission: 'menu', branch: 'any', storeClaim: ({ body }) => body.tenantId },
    body: z.object({ tenantId: z.string() }),
    handler,
  })
  const action = defineAction({
    auth: { kind: 'staff', permission: 'menu', branch: 'any', storeClaim: ([tenantId]) => tenantId },
    args: [z.string()],
    handler: async ({ tenant, user }) => ({ success: true as const, tenant, userId: user.id }),
  })

  it('admits a member holding the key and hands the handler the helper’s own answer', async () => {
    expect((await route(post({ tenantId: TENANT }))).status).toBe(200)
    expect(handler.mock.calls[0][0]).toMatchObject({ tenant: TENANT, user: USER, appUser: account() })
    expect(await action(TENANT)).toEqual({ success: true, tenant: TENANT, userId: 'user-1' })
  })

  it.each([
    ['nobody signed in', { user: null, appUser: null, roleError: null }, 401, 'Please sign in again.'],
    ['a session with no admin record', { user: USER, appUser: null, roleError: null }, 403, 'You do not have access to this store.'],
    ['an app_users read that failed', { user: USER, appUser: null, roleError: 'timeout' }, 403, 'You do not have access to this store.'],
    ['an admin of another store', { user: USER, appUser: account({ tenant_id: 'store-2' }), roleError: null }, 403, 'You do not have access to this store.'],
    ['a member without the key', { user: USER, appUser: account({ permissions: ['orders'] }), roleError: null }, 403, 'You do not have permission for this.'],
  ])('refuses %s', async (_name, caller, status, sentence) => {
    mockCaller.mockResolvedValue(caller)

    expect((await route(post({ tenantId: TENANT }))).status).toBe(status)
    expect(await action(TENANT)).toEqual({ success: false, error: sentence })
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses a paused store, and still admits the superadmin who can unpause it', async () => {
    mockSubscription.mockResolvedValue({ status: 'paused', paid_through: null, grace_days: null })

    const paused = await route(post({ tenantId: TENANT }))
    expect(await snapshot(paused)).toEqual({ status: 403, body: { error: SUBSCRIPTION_PAUSED_MESSAGE }, cacheControl: null })

    mockCaller.mockResolvedValue({ user: USER, appUser: { role: 'superadmin', tenant_id: null }, roleError: null })
    expect((await route(post({ tenantId: TENANT }))).status).toBe(200)
  })

  it('holds platform staff to the verb the entry names', async () => {
    const viewer = { role: 'platform_staff', tenant_id: null, platform_permissions: ['stores.view'] }
    mockCaller.mockResolvedValue({ user: USER, appUser: viewer, roleError: null })
    const read = defineRoute({
      auth: { kind: 'staff', permission: 'any-staff', branch: 'any', access: 'view', storeClaim: ({ body }) => body.tenantId },
      body: z.object({ tenantId: z.string() }),
      handler,
    })
    const write = defineRoute({
      auth: { kind: 'staff', permission: 'any-staff', branch: 'any', storeClaim: ({ body }) => body.tenantId },
      body: z.object({ tenantId: z.string() }),
      handler,
    })

    expect((await read(post({ tenantId: TENANT }))).status).toBe(200)
    expect((await write(post({ tenantId: TENANT }))).status).toBe(403)
  })
})

describe('staff over a Bearer token: the real requireBearerStoreCaller', () => {
  const route = defineRoute({
    auth: { kind: 'staff', session: 'bearer', permission: 'menu', branch: 'any', access: 'view', storeClaim: ({ body }) => body.tenantId },
    body: z.object({ tenantId: z.string() }),
    handler,
  })

  it('answers exactly what the hand-written Bearer routes answer', async () => {
    const noToken = await route(post({ tenantId: TENANT }))
    expect(await snapshot(noToken)).toEqual({ status: 401, body: { error: 'Unauthorized' }, cacheControl: null })

    mockSessionUser.mockReturnValue(null)
    const staleToken = await route(post({ tenantId: TENANT }, { authorization: 'Bearer stale' }))
    expect(await snapshot(staleToken)).toEqual({ status: 401, body: { error: 'Unauthorized' }, cacheControl: null })

    mockSessionUser.mockReturnValue(USER)
    const otherStore = await route(post({ tenantId: 'store-2' }, { authorization: 'Bearer t' }))
    expect(await snapshot(otherStore)).toEqual({ status: 403, body: { error: 'Forbidden' }, cacheControl: null })

    mockAppUserRow.mockReturnValue(account({ permissions: ['orders'] }))
    const noKey = await route(post({ tenantId: TENANT }, { authorization: 'Bearer t' }))
    expect(await snapshot(noKey)).toEqual({ status: 403, body: { error: 'Forbidden' }, cacheControl: null })
    expect(handler).not.toHaveBeenCalled()

    mockAppUserRow.mockReturnValue(account())
    expect((await route(post({ tenantId: TENANT }, { authorization: 'Bearer t' }))).status).toBe(200)
  })

  it('admits a superadmin for the store it names, as the app-facing routes do', async () => {
    mockAppUserRow.mockReturnValue({ role: 'superadmin', tenant_id: null })

    expect((await route(post({ tenantId: 'any-store' }, { authorization: 'Bearer t' }))).status).toBe(200)
    expect(handler.mock.calls[0][0].tenant).toBe('any-store')
  })
})

describe('superadmin: the real console guard', () => {
  const route = defineRoute({ auth: { kind: 'superadmin', permission: 'tenants.view' }, handler })
  const request = () => new NextRequest('http://localhost/api/superadmin/thing')

  it.each([
    ['a signed-out caller', null, null],
    ['a store admin', USER, { role: 'admin', tenant_id: TENANT }],
    ['platform staff without the grant', USER, { role: 'platform_staff', platform_permissions: ['leads.view'] }],
  ])('answers %s exactly as platformPermissionResponse does', async (_name, user, appUser) => {
    mockSessionUser.mockReturnValue(user)
    mockAppUserRow.mockReturnValue(appUser)

    const expected = await platformPermissionResponse('tenants.view')
    const actual = await route(request())

    expect(expected).not.toBeNull()
    expect(await snapshot(actual)).toEqual(await snapshot(expected as Response))
    expect(handler).not.toHaveBeenCalled()
  })

  it('admits platform staff holding the grant', async () => {
    mockAppUserRow.mockReturnValue({ role: 'platform_staff', platform_permissions: ['tenants.view'] })

    expect((await route(request())).status).toBe(200)
  })
})

describe('cron: the dialect of the hand-written cron routes', () => {
  it('refuses exactly as respond({ error: "Unauthorized" }, 401) does', async () => {
    process.env.CRON_SECRET = 'cron-secret'
    const route = defineRoute({ auth: { kind: 'cron' }, handler })

    const actual = await route(new NextRequest('http://localhost/api/tick', { headers: { authorization: 'Bearer wrong' } }))

    expect(await snapshot(actual)).toEqual(await snapshot(respond({ error: 'Unauthorized' }, 401)))
    expect([...actual.headers.keys()].sort()).toEqual([...respond({ error: 'Unauthorized' }, 401).headers.keys()].sort())
  })
})
