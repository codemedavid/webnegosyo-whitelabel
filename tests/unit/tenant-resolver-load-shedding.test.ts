/**
 * @jest-environment node
 */
/**
 * What the request-path resolver may cost. A platform subdomain costs
 * nothing (pure parsing — the page's cached tenant read decides whether the
 * shop exists); a custom domain costs one directory load per runtime, shared
 * by every host; a failed load is not retried for ten seconds.
 */
import type { NextRequest } from 'next/server'

const ROOT = 'webnegosyo.com'

let rows: Array<{ slug: string; domain: string | null }> | 'error' = []
const loads: number[] = []

const createClient = jest.fn<Record<string, unknown>, unknown[]>(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        not: async () => {
          loads.push(Date.now())
          if (rows === 'error') return { data: null, error: { message: 'statement timeout' } }
          return { data: rows, error: null }
        },
      }),
    }),
  }),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}))

function requestFor(host: string): NextRequest {
  return { headers: new Headers({ host }), cookies: { getAll: () => [] } } as unknown as NextRequest
}

async function loadResolver() {
  jest.resetModules()
  return import('@/lib/tenant')
}

beforeEach(() => {
  process.env.PLATFORM_ROOT_DOMAIN = ROOT
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  rows = [{ slug: 'alola', domain: 'alolascoop.com' }]
  loads.length = 0
  createClient.mockClear()
})

describe('resolveTenantSlugFromRequest', () => {
  it('resolves a platform subdomain without touching the database', async () => {
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await expect(resolveTenantSlugFromRequest(requestFor('shop.webnegosyo.com'))).resolves.toBe('shop')
    expect(loads).toEqual([])
  })

  it('still skips the database for a production tenant host when PLATFORM_ROOT_DOMAIN is missing', async () => {
    // Edge middleware inlines env at build time. If the var is absent from
    // the bundle, the previous resolver treated every *.webnegosyo.com hit
    // as a custom domain and waited on Postgres — the 25s 504 on
    // gungjeon-unlimited.webnegosyo.com.
    delete process.env.PLATFORM_ROOT_DOMAIN
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await expect(
      resolveTenantSlugFromRequest(requestFor('gungjeon-unlimited.webnegosyo.com'))
    ).resolves.toBe('gungjeon-unlimited')
    expect(loads).toEqual([])
  })

  it('resolves nothing for the platform root and reserved subdomains, still without I/O', async () => {
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await expect(resolveTenantSlugFromRequest(requestFor('www.webnegosyo.com'))).resolves.toBeNull()
    await expect(resolveTenantSlugFromRequest(requestFor('app.webnegosyo.com'))).resolves.toBeNull()
    expect(loads).toEqual([])
  })

  it('resolves a custom domain, www or not, from one shared directory load', async () => {
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await expect(resolveTenantSlugFromRequest(requestFor('www.alolascoop.com'))).resolves.toBe('alola')
    await expect(resolveTenantSlugFromRequest(requestFor('alolascoop.com:443'))).resolves.toBe('alola')
    await expect(resolveTenantSlugFromRequest(requestFor('the-gray-co.com'))).resolves.toBeNull()
    expect(loads).toHaveLength(1)
  })

  it('does not hammer a failing database: one load per ten seconds per runtime', async () => {
    jest.useFakeTimers()
    try {
      rows = 'error'
      const { resolveTenantSlugFromRequest } = await loadResolver()

      await expect(resolveTenantSlugFromRequest(requestFor('alolascoop.com'))).resolves.toBeNull()
      await resolveTenantSlugFromRequest(requestFor('ligna.cafe'))
      expect(loads).toHaveLength(1)

      jest.advanceTimersByTime(10_001)
      rows = [{ slug: 'alola', domain: 'alolascoop.com' }]
      await expect(resolveTenantSlugFromRequest(requestFor('alolascoop.com'))).resolves.toBe('alola')
      expect(loads).toHaveLength(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('reloads after clearDomainCache so a saved domain is picked up', async () => {
    const { resolveTenantSlugFromRequest, clearDomainCache } = await loadResolver()

    await resolveTenantSlugFromRequest(requestFor('ligna.cafe'))
    rows = [{ slug: 'ligna', domain: 'ligna.cafe' }]
    clearDomainCache('ligna.cafe')

    await expect(resolveTenantSlugFromRequest(requestFor('ligna.cafe'))).resolves.toBe('ligna')
    expect(loads).toHaveLength(2)
  })

  it('builds its Supabase client session-less with a bounded fetch', async () => {
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await resolveTenantSlugFromRequest(requestFor('alolascoop.com'))

    const options = createClient.mock.calls[0][2] as unknown as {
      auth?: { persistSession?: boolean }
      db?: { retry?: boolean }
      global?: { fetch?: unknown }
    }
    expect(options.auth?.persistSession).toBe(false)
    expect(options.db?.retry).toBe(false)
    expect(typeof options.global?.fetch).toBe('function')
  })
})

describe('getTenantSlugFromHeaders', () => {
  it('applies the same resolution to a Server Component request', async () => {
    const { getTenantSlugFromHeaders } = await loadResolver()
    const { headers } = jest.requireMock('next/headers') as { headers: jest.Mock }
    headers.mockReturnValue(new Headers({ 'x-forwarded-host': 'www.alolascoop.com', host: 'internal' }))

    await expect(getTenantSlugFromHeaders()).resolves.toBe('alola')
    headers.mockReturnValue(new Headers())
  })
})
