/**
 * The public client is what makes the storefront cacheable: it must not touch
 * cookies or sessions, and it must give up on a stalled database.
 */
const createClientSpy = jest.fn(() => ({ tag: 'client' }))

jest.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => createClientSpy(...(args as [])) }))

describe('createPublicClient', () => {
  const env = process.env

  beforeEach(() => {
    jest.resetModules()
    createClientSpy.mockClear()
    process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }
  })

  afterAll(() => { process.env = env })

  test('throws a clear error when the environment is incomplete', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const { createPublicClient } = await import('@/lib/supabase/public')
    expect(() => createPublicClient()).toThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })

  test('builds a session-less client with a bounded fetch, once', async () => {
    const { createPublicClient, PUBLIC_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/public')
    const first = createPublicClient()
    const second = createPublicClient()

    expect(first).toBe(second)
    expect(createClientSpy).toHaveBeenCalledTimes(1)
    const [, , options] = createClientSpy.mock.calls[0] as unknown as [string, string, { auth: Record<string, boolean>; db?: { retry?: boolean }; global: { fetch: unknown } }]
    expect(options.auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false })
    expect(options.db?.retry).toBe(false)
    expect(typeof options.global.fetch).toBe('function')
    expect(PUBLIC_QUERY_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('describePublicQueryError', () => {
  test('names the bounded fetch as a database timeout', async () => {
    const { describePublicQueryError } = await import('@/lib/supabase/public')
    expect(describePublicQueryError('AbortError: This operation was aborted')).toMatch(/did not answer within \d+s/)
  })

  test('passes other messages through', async () => {
    const { describePublicQueryError } = await import('@/lib/supabase/public')
    expect(describePublicQueryError('canceling statement due to statement timeout')).toBe('canceling statement due to statement timeout')
  })
})

// This file has no imports; without an export it is a global script and its
// top-level names collide with the sibling client suites.
export {}
