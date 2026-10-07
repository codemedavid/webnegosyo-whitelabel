/** @jest-environment node */

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/facebook/pages/route'
import { createClient } from '@/lib/supabase/server'
import { getTenantUserAccessToken } from '@/lib/facebook/page-tokens'
import { getUserPages } from '@/lib/facebook-api'
import { GET as initiate } from '@/app/api/auth/facebook/route'
import { GET as callback } from '@/app/api/auth/facebook/callback/route'
import { POST as connect } from '@/app/api/auth/facebook/connect/route'
import { POST as disconnect } from '@/app/api/auth/facebook/disconnect/route'
import { createHmac } from 'node:crypto'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/facebook/page-tokens', () => ({
  getTenantUserAccessToken: jest.fn(),
  getTenantPageByPageId: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/facebook-api', () => ({
  getUserPages: jest.fn(),
  exchangeCodeForToken: jest.fn().mockResolvedValue('short-token'),
  getLongLivedToken: jest.fn().mockResolvedValue({ access_token: 'long-token' }),
  subscribePageToWebhook: jest.fn(),
  unsubscribePageFromWebhook: jest.fn(),
}))

function mockCaller(appUser: unknown, signedIn = true) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: appUser }),
    single: jest.fn().mockResolvedValue({ data: null }),
  }
  jest.mocked(createClient).mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: signedIn ? { id: 'staff-1' } : null } }) },
    from: jest.fn().mockReturnValue(query),
  } as never)
}

function postRequest(path: string) {
  return new NextRequest(`https://example.test${path}`, {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: 'store-1', page_id: 'page-1', page_name: 'Page',
      page_access_token: 'page-token', user_access_token: 'user-token', temp_id: 'temp-1',
    }),
  })
}

function callbackRequest() {
  const payload = Buffer.from(JSON.stringify({ tenant_id: 'store-1', timestamp: Date.now(), nonce: 'nonce' })).toString('base64url')
  const signature = createHmac('sha256', 'test-state-secret').update(payload).digest('base64url')
  return new NextRequest(`https://example.test/api/auth/facebook/callback?code=code&state=${payload}.${signature}`)
}

describe('Facebook management authorization', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, FACEBOOK_APP_ID: 'test-app', FACEBOOK_STATE_SECRET: 'test-state-secret' }
    mockCaller({ role: 'admin', tenant_id: 'store-1', is_owner: false, permissions: ['orders'] })
    jest.mocked(getTenantUserAccessToken).mockResolvedValue('user-access-token')
    jest.mocked(getUserPages).mockResolvedValue([
      { id: 'page-1', name: 'Merchant page', access_token: 'page-access-token' },
    ])
  })

  afterEach(() => { process.env = originalEnv })

  it('refuses page token enumeration by staff without Settings permission', async () => {
    const response = await GET(new NextRequest(
      'https://example.test/api/facebook/pages?tenant_id=store-1&temp_id=temp-1',
    ))

    expect(response.status).toBe(403)
    expect(getTenantUserAccessToken).not.toHaveBeenCalled()
    expect(getUserPages).not.toHaveBeenCalled()
  })

  it('refuses OAuth initiation by staff without Settings permission', async () => {
    const response = await initiate(new NextRequest('https://example.test/api/auth/facebook?tenant_id=store-1'))
    expect(response.status).toBe(403)
  })

  it('rechecks Settings permission at the OAuth callback', async () => {
    const response = await callback(callbackRequest())
    expect(new URL(response.headers.get('location')!).searchParams.get('message')).toBe('Forbidden')
  })

  it.each([
    ['connect', connect], ['disconnect', disconnect],
  ] as const)('refuses %s by staff without Settings permission', async (name, handler) => {
    expect((await handler(postRequest(`/api/auth/facebook/${name}`))).status).toBe(403)
  })

  it.each([
    ['a customer with a tenant assignment', { role: 'customer', tenant_id: 'store-1', permissions: null }],
    ['another store administrator', { role: 'admin', tenant_id: 'store-2', is_owner: true }],
    ['a missing application user', null],
  ])('refuses page access for %s', async (_name, user) => {
    mockCaller(user)
    expect((await GET(new NextRequest('https://example.test/api/facebook/pages?tenant_id=store-1&temp_id=temp-1'))).status).toBe(403)
    expect(getTenantUserAccessToken).not.toHaveBeenCalled()
  })

  it.each([
    ['settings staff', { role: 'admin', tenant_id: 'store-1', permissions: ['settings'] }],
    ['owner', { role: 'admin', tenant_id: 'store-1', is_owner: true, permissions: [] }],
    ['legacy administrator', { role: 'admin', tenant_id: 'store-1', permissions: null }],
    ['superadmin', { role: 'superadmin', tenant_id: null, permissions: [] }],
  ])('allows page access for %s', async (_name, user) => {
    mockCaller(user)
    const response = await GET(new NextRequest('https://example.test/api/facebook/pages?tenant_id=store-1&temp_id=temp-1'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: [
      { id: 'page-1', name: 'Merchant page', access_token: 'page-access-token' },
    ] })
  })

  it('requires a signed-in session', async () => {
    mockCaller(null, false)
    expect((await GET(new NextRequest('https://example.test/api/facebook/pages?tenant_id=store-1&temp_id=temp-1'))).status).toBe(401)
    expect(getTenantUserAccessToken).not.toHaveBeenCalled()
  })
})
