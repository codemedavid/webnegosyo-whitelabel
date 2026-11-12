/** @jest-environment node */
import { NextRequest } from 'next/server'

jest.mock('server-only', () => ({}))

const getTenantApp = jest.fn()
jest.mock('@/lib/app-api/tenant-app', () => ({ getTenantApp: (...a: unknown[]) => getTenantApp(...a) }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }) }))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

const rpc = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }), ADMIN_QUERY_TIMEOUT_MS: 8000 }))

const resolveCustomerSession = jest.fn()
const revokeSession = jest.fn()
jest.mock('@/lib/customer-auth/account', () => ({
  resolveCustomerSession: (...a: unknown[]) => resolveCustomerSession(...a),
  revokeSession: (...a: unknown[]) => revokeSession(...a),
  readProfile: jest.fn(),
  updateProfileName: jest.fn(),
  deleteAccount: jest.fn(),
  readReviewPhone: jest.fn(),
}))

const TENANT = '00000000-0000-4000-8000-000000000001'
const CUSTOMER = '77777777-7777-4777-8777-777777777777'
const RELEASE = { minimumVersion: null, latestVersion: null, storeUrl: null }
const APP = { tenantId: TENANT, slug: 'kape', status: 'live', ios: RELEASE, android: RELEASE }
const TOKEN = `cs1.${'A'.repeat(43)}`
const TOKEN_HASH = 'a'.repeat(64)
const bearer = { authorization: `Bearer ${TOKEN}` }
const EXPO = 'ExponentPushToken[abcdefgh1234]'

const call = (path: string, method: string, headers: Record<string, string> = {}, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'x-app-id': 'com.webnegosyo.kape', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })

const routes = async () => ({
  pushToken: await import('@/app/api/app/v1/me/push-token/route'),
  signOut: (await import('@/app/api/app/v1/auth/session/route')).DELETE,
})

beforeEach(() => {
  jest.clearAllMocks()
  getTenantApp.mockResolvedValue({ app: APP, error: null })
  resolveCustomerSession.mockResolvedValue({ customerId: CUSTOMER, tokenHash: TOKEN_HASH })
  rpc.mockResolvedValue({ data: { ok: true }, error: null })
})

describe('/api/app/v1/me/push-token', () => {
  it('files the token under the SESSION of the build’s store, never under anything the body names', async () => {
    const { pushToken } = await routes()
    const response = await pushToken.POST(call('/api/app/v1/me/push-token', 'POST', bearer, { token: EXPO, platform: 'ios', appVersion: '1.0.0' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { registered: true }, error: null })
    expect(resolveCustomerSession).toHaveBeenCalledWith(expect.anything(), TENANT)
    expect(rpc).toHaveBeenCalledWith('register_customer_app_push_token', {
      p_tenant_id: TENANT, p_session_token_hash: TOKEN_HASH, p_expo_token: EXPO, p_platform: 'ios', p_app_version: '1.0.0',
    })
  })

  it('refuses a signed-out phone, a bad token and extra fields', async () => {
    const { pushToken } = await routes()
    resolveCustomerSession.mockResolvedValueOnce(null)
    expect((await pushToken.POST(call('/api/app/v1/me/push-token', 'POST', {}, { token: EXPO, platform: 'ios' }))).status).toBe(401)
    expect((await pushToken.POST(call('/api/app/v1/me/push-token', 'POST', bearer, { token: 'nope', platform: 'ios' }))).status).toBe(400)
    expect((await pushToken.POST(call('/api/app/v1/me/push-token', 'POST', bearer, { token: EXPO, platform: 'ios', customerId: CUSTOMER }))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers signed out when the session ended between the check and the write', async () => {
    const { pushToken } = await routes()
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'signed_out' }, error: null })
    expect((await pushToken.POST(call('/api/app/v1/me/push-token', 'POST', bearer, { token: EXPO, platform: 'android' }))).status).toBe(401)
  })

  it('DELETE turns notifications off for this session only', async () => {
    const { pushToken } = await routes()
    const response = await pushToken.DELETE(call('/api/app/v1/me/push-token', 'DELETE', bearer))
    expect(await response.json()).toEqual({ success: true, data: { registered: false }, error: null })
    expect(rpc).toHaveBeenCalledWith('remove_customer_app_push_tokens', { p_tenant_id: TENANT, p_session_token_hash: TOKEN_HASH })
  })
})

describe('sign-out', () => {
  it('removes this phone’s push tokens, then revokes the session', async () => {
    const { signOut } = await routes()
    expect((await signOut(call('/api/app/v1/auth/session', 'DELETE', bearer))).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('remove_customer_app_push_tokens', { p_tenant_id: TENANT, p_session_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(revokeSession).toHaveBeenCalledTimes(1)
  })

  it('still signs out when the token removal fails', async () => {
    const { signOut } = await routes()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await signOut(call('/api/app/v1/auth/session', 'DELETE', bearer))).status).toBe(200)
    expect(revokeSession).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
