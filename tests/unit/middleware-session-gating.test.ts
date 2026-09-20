/**
 * @jest-environment node
 */
/**
 * `auth.getUser()` is a round-trip to GoTrue, and the middleware made it on
 * every request — public menu pages, RSC prefetches, the every-minute loyalty
 * cron. During the 2026-09-20 outage GoTrue could not reach Postgres and the
 * refresh path retried for longer than Vercel's 25s cap. Only a visitor who
 * carries a Supabase cookie has a session to refresh, so only they pay for it.
 * They pay on every path, though: public pages read the session from Server
 * Components that cannot write cookies, so the middleware must keep it fresh.
 */
import { NextRequest } from 'next/server'

const getUser = jest.fn()
const createServerClient = jest.fn<Record<string, unknown>, unknown[]>(() => ({
  auth: { getUser },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  }),
}))
const resolveTenantSlugFromRequest = jest.fn()

jest.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}))
jest.mock('@/lib/tenant', () => ({
  resolveTenantSlugFromRequest: (...args: unknown[]) => resolveTenantSlugFromRequest(...args),
}))

const SESSION_COOKIE = 'sb-abc-auth-token=token'

function requestFor(path: string, cookie?: string) {
  return new NextRequest(`https://shop.webnegosyo.com${path}`, {
    headers: cookie ? { cookie } : {},
  })
}

async function run(path: string, cookie?: string) {
  jest.resetModules()
  const { middleware } = await import('@/middleware')
  return middleware(requestFor(path, cookie))
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null })
  createServerClient.mockClear()
  resolveTenantSlugFromRequest.mockReset().mockResolvedValue('shop')
})

describe('middleware session gating', () => {
  it('does not call GoTrue for an anonymous storefront visit', async () => {
    await run('/')

    expect(getUser).not.toHaveBeenCalled()
  })

  it('still refreshes a signed-in visitor on a public menu page', async () => {
    await run('/shop/menu', SESSION_COOKIE)

    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('does not call GoTrue for an anonymous hit on an admin path', async () => {
    const response = await run('/shop/admin')

    expect(getUser).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toContain('/shop/login')
  })

  it('calls GoTrue for a signed-in visitor on an admin path', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })

    await run('/shop/admin', SESSION_COOKIE)

    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('calls GoTrue for a signed-in visitor on the tenant login page', async () => {
    await run('/shop/login', SESSION_COOKIE)

    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('treats a GoTrue failure as signed out instead of hanging', async () => {
    getUser.mockRejectedValue(new DOMException('aborted', 'AbortError'))

    const response = await run('/shop/admin', SESSION_COOKIE)

    expect(response.headers.get('location')).toContain('/shop/login')
  })

  it('builds the auth client with a bounded fetch', async () => {
    await run('/shop/admin', SESSION_COOKIE)

    const options = createServerClient.mock.calls[0][2] as unknown as { global?: { fetch?: unknown } }
    expect(typeof options.global?.fetch).toBe('function')
  })
})

describe('middleware cron bypass', () => {
  it.each(['/api/loyalty/maintenance', '/api/loyverse/reconcile'])(
    'does no tenant or auth work for %s',
    async (path) => {
      await run(path)

      expect(resolveTenantSlugFromRequest).not.toHaveBeenCalled()
      expect(createServerClient).not.toHaveBeenCalled()
    }
  )
})
