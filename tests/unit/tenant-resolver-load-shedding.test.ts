/**
 * @jest-environment node
 */
/**
 * On 2026-09-20 the middleware's `tenants WHERE domain = $host` lookup was the
 * single largest statement-timeout victim in Postgres (513 kills). Two things
 * made it that hot: it ran for every `<slug>.webnegosyo.com` host even though
 * a subdomain can never be a custom domain, and a miss was never cached, so
 * every request paid the two queries again. These tests pin the fix.
 */
import type { NextRequest } from 'next/server'

const ROOT = 'webnegosyo.com'

type Row = { slug: string; domain?: string | null; id?: string; is_active?: boolean }

const domainQueries: string[] = []
const slugQueries: string[] = []
let domainRows: Record<string, Row | 'error'> = {}
let slugRows: Record<string, Row | 'error'> = {}

function fakeBuilder(table: string) {
  const filters: Record<string, string> = {}
  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      filters[column] = value
      return builder
    },
    maybeSingle: async () => {
      if (filters.domain !== undefined) {
        domainQueries.push(filters.domain)
        const row = domainRows[filters.domain]
        if (row === 'error') return { data: null, error: { message: 'statement timeout' } }
        return { data: row ?? null, error: null }
      }
      slugQueries.push(filters.slug)
      const row = slugRows[filters.slug]
      if (row === 'error') return { data: null, error: { message: 'statement timeout' } }
      return { data: row ?? null, error: null }
    },
  }
  return { table, ...builder }
}

const createServerClient = jest.fn<Record<string, unknown>, unknown[]>(() => ({ from: (table: string) => fakeBuilder(table) }))

jest.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}))

function requestFor(host: string): NextRequest {
  return {
    headers: new Headers({ host }),
    cookies: { getAll: () => [] },
  } as unknown as NextRequest
}

async function loadResolver() {
  jest.resetModules()
  return import('@/lib/tenant')
}

beforeEach(() => {
  process.env.PLATFORM_ROOT_DOMAIN = ROOT
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  domainQueries.length = 0
  slugQueries.length = 0
  domainRows = {}
  slugRows = { shop: { slug: 'shop', id: 't1', is_active: true } }
  createServerClient.mockClear()
})

describe('isPlatformHost', () => {
  it('recognises the root, its subdomains, previews and local hosts', async () => {
    const { isPlatformHost } = await loadResolver()

    expect(isPlatformHost('webnegosyo.com', ROOT)).toBe(true)
    expect(isPlatformHost('www.webnegosyo.com', ROOT)).toBe(true)
    expect(isPlatformHost('shop.webnegosyo.com', ROOT)).toBe(true)
    expect(isPlatformHost('whitelabel-git-main.vercel.app', ROOT)).toBe(true)
    expect(isPlatformHost('shop.localhost', ROOT)).toBe(true)
    expect(isPlatformHost('localhost', ROOT)).toBe(true)
  })

  it('treats anything else as a possible custom domain', async () => {
    const { isPlatformHost } = await loadResolver()

    expect(isPlatformHost('alolascoop.com', ROOT)).toBe(false)
    expect(isPlatformHost('www.ligna.cafe', ROOT)).toBe(false)
    expect(isPlatformHost('shop.webnegosyo.com', null)).toBe(false)
  })
})

describe('resolveTenantSlugFromRequest', () => {
  it('never queries the domain column for a platform subdomain', async () => {
    const { resolveTenantSlugFromRequest } = await loadResolver()

    const slug = await resolveTenantSlugFromRequest(requestFor('shop.webnegosyo.com'))

    expect(slug).toBe('shop')
    expect(domainQueries).toEqual([])
    expect(slugQueries).toEqual(['shop'])
  })

  it('does nothing at all for the platform root', async () => {
    const { resolveTenantSlugFromRequest } = await loadResolver()

    const slug = await resolveTenantSlugFromRequest(requestFor('www.webnegosyo.com'))

    expect(slug).toBeNull()
    expect(domainQueries).toEqual([])
    expect(slugQueries).toEqual([])
  })

  it('still resolves a real custom domain', async () => {
    domainRows = { 'alolascoop.com': { slug: 'alola', domain: 'alolascoop.com' } }
    const { resolveTenantSlugFromRequest } = await loadResolver()

    const slug = await resolveTenantSlugFromRequest(requestFor('www.alolascoop.com'))

    expect(slug).toBe('alola')
  })

  it('caches a custom-domain miss so the next request pays nothing', async () => {
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await resolveTenantSlugFromRequest(requestFor('the-gray-co.com'))
    const before = domainQueries.length
    await resolveTenantSlugFromRequest(requestFor('the-gray-co.com'))

    expect(before).toBe(2) // exact + www variant, once
    expect(domainQueries.length).toBe(before)
  })

  it('caches a failed lookup briefly instead of hammering a struggling database', async () => {
    domainRows = { 'the-gray-co.com': 'error' }
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await resolveTenantSlugFromRequest(requestFor('the-gray-co.com'))
    const before = domainQueries.length
    await resolveTenantSlugFromRequest(requestFor('the-gray-co.com'))

    expect(domainQueries.length).toBe(before)
  })

  it('forgets a miss after a minute and an error after ten seconds', async () => {
    jest.useFakeTimers()
    try {
      const { resolveTenantSlugFromRequest } = await loadResolver()

      await resolveTenantSlugFromRequest(requestFor('the-gray-co.com'))
      jest.advanceTimersByTime(59_000)
      await resolveTenantSlugFromRequest(requestFor('the-gray-co.com'))
      expect(domainQueries.length).toBe(2)
      jest.advanceTimersByTime(2_000)
      await resolveTenantSlugFromRequest(requestFor('the-gray-co.com'))
      expect(domainQueries.length).toBe(4)

      domainRows = { 'ligna.cafe': 'error' }
      await resolveTenantSlugFromRequest(requestFor('ligna.cafe'))
      jest.advanceTimersByTime(9_000)
      await resolveTenantSlugFromRequest(requestFor('ligna.cafe'))
      expect(domainQueries.length).toBe(5)
      jest.advanceTimersByTime(2_000)
      await resolveTenantSlugFromRequest(requestFor('ligna.cafe'))
      expect(domainQueries.length).toBe(6)
    } finally {
      jest.useRealTimers()
    }
  })

  it('caches a failed slug validation the same way', async () => {
    slugRows = { shop: 'error' }
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await resolveTenantSlugFromRequest(requestFor('shop.webnegosyo.com'))
    await resolveTenantSlugFromRequest(requestFor('shop.webnegosyo.com'))

    expect(slugQueries).toEqual(['shop'])
  })

  it('builds its Supabase client with a bounded fetch', async () => {
    const { resolveTenantSlugFromRequest } = await loadResolver()

    await resolveTenantSlugFromRequest(requestFor('shop.webnegosyo.com'))

    const options = createServerClient.mock.calls[0][2] as unknown as { global?: { fetch?: unknown } }
    expect(typeof options.global?.fetch).toBe('function')
  })
})
