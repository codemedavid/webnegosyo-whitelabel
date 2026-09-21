/**
 * @jest-environment node
 */
/**
 * The loyalty maintenance cron (and every other service-role path) used
 * `createAdminClient()` with the default fetch, which never gives up. When
 * PostgREST stalled, `/api/loyalty/maintenance` held the isolate open until
 * Vercel stopped it at 25s — a 503/504 every minute, on top of the statement
 * timeouts already saturating the database.
 *
 * A caller that knows it must answer before that cap (the every-minute cron)
 * opts into a bounded fetch. Long jobs such as Loyverse reconcile keep the
 * unbounded default so a single catalog pull is not killed at 8s.
 */
const createClientSpy = jest.fn(() => ({ tag: 'admin' }))

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientSpy(...(args as [])),
}))

describe('createAdminClient', () => {
  const env = process.env

  beforeEach(() => {
    jest.resetModules()
    createClientSpy.mockClear()
    process.env = {
      ...env,
      NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    }
  })

  afterAll(() => {
    process.env = env
  })

  it('throws a clear error when the environment is incomplete', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { createAdminClient } = await import('@/lib/supabase/admin')
    expect(() => createAdminClient()).toThrow('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('leaves long-running admin jobs unbounded by default', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    createAdminClient()

    const [, , options] = createClientSpy.mock.calls[0] as unknown as [
      string,
      string,
      { global?: { fetch?: unknown }; db?: { retry?: boolean } },
    ]
    expect(options.global?.fetch).toBeUndefined()
  })

  it('opts a caller into a bounded fetch that aborts', async () => {
    const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import(
      '@/lib/supabase/admin'
    )
    createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })

    const [, , options] = createClientSpy.mock.calls[0] as unknown as [
      string,
      string,
      { global?: { fetch?: typeof fetch }; db?: { retry?: boolean } },
    ]
    expect(options.db?.retry).toBe(false)
    expect(typeof options.global?.fetch).toBe('function')
    expect(ADMIN_QUERY_TIMEOUT_MS).toBeGreaterThan(0)
    expect(ADMIN_QUERY_TIMEOUT_MS).toBeLessThan(25_000)

    const baseFetch = jest.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return new Response('{}')
    })
    const original = globalThis.fetch
    globalThis.fetch = baseFetch as unknown as typeof fetch
    try {
      await options.global!.fetch!('https://x.supabase.co/rest/v1/rpc/cleanup_loyalty_data')
    } finally {
      globalThis.fetch = original
    }
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })
})

// This file has no imports; without an export it is a global script and its
// top-level names collide with the sibling client suites.
export {}
