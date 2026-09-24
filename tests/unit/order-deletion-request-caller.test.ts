/**
 * @jest-environment node
 */
/**
 * The gate in front of every order-deletion route.
 *
 * Imported lazily inside each test: next/jest leaves static imports ahead of
 * jest.mock (see web-jest-mock-not-hoisted), so a top-level import would load
 * the real Supabase clients.
 */
import { NextRequest } from 'next/server'

const TENANT = '576ae2fe-1d26-4759-8c5e-03525b206f43'

let cookieUser: { id: string; email: string } | null = null
let tokenUser: { id: string; email: string } | null = null
let appUserRow: Record<string, unknown> | null = null
let tenantRow: Record<string, unknown> | null = null

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cookieUser } }) } }),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: tokenUser } }) } }),
}))

jest.mock('@/lib/supabase/admin', () => ({
  ADMIN_QUERY_TIMEOUT_MS: 8000,
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'app_users' ? appUserRow : tenantRow,
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://shop.webnegosyo.com/api/order-deletion/confirm', {
    method: 'POST',
    headers: { host: 'shop.webnegosyo.com', ...headers },
  })
}

async function resolve(req: NextRequest, tenantId: unknown = TENANT, isWrite = true) {
  const { resolveOwnerCaller } = await import('@/lib/order-deletion/request-caller')
  return resolveOwnerCaller(req, tenantId, { isWrite })
}

beforeEach(() => {
  cookieUser = { id: 'owner-1', email: 'owner@example.com' }
  tokenUser = null
  appUserRow = { role: 'admin', tenant_id: TENANT, is_owner: true }
  tenantRow = { id: TENANT, name: 'Súkad', slug: 'sukad', order_backend: 'platform', convex_deployment_url: null }
})

describe('resolveOwnerCaller', () => {
  test('admits the owner from one of our own pages', async () => {
    const result = await resolve(request({ origin: 'https://shop.webnegosyo.com' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.caller).toEqual({ userId: 'owner-1', email: 'owner@example.com', tenantId: TENANT })
      expect(result.store).toEqual({ id: TENANT, name: 'Súkad', slug: 'sukad' })
    }
  })

  test('refuses a cookie write from another site, before reading the session', async () => {
    const result = await resolve(request({ origin: 'https://evil.example' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  test('admits the merchant app by bearer token, with no origin', async () => {
    cookieUser = null
    tokenUser = { id: 'owner-1', email: 'owner@example.com' }
    const result = await resolve(request({ authorization: 'Bearer app-token' }))
    expect(result.ok).toBe(true)
  })

  test('refuses staff', async () => {
    appUserRow = { role: 'admin', tenant_id: TENANT, is_owner: false }
    const result = await resolve(request({ origin: 'https://shop.webnegosyo.com' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  test("refuses an owner naming another store's id", async () => {
    appUserRow = { role: 'admin', tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', is_owner: true }
    const result = await resolve(request({ origin: 'https://shop.webnegosyo.com' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  test('refuses a store whose orders live in Convex', async () => {
    tenantRow = { ...tenantRow, order_backend: 'auto', convex_deployment_url: 'https://x.convex.cloud' }
    const result = await resolve(request({ origin: 'https://shop.webnegosyo.com' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(409)
  })

  test('refuses a malformed store id without any lookup', async () => {
    const result = await resolve(request({ origin: 'https://shop.webnegosyo.com' }), "x' or 1=1")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  test('refuses a signed-out caller', async () => {
    cookieUser = null
    const result = await resolve(request({ origin: 'https://shop.webnegosyo.com' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })
})
