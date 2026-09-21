/**
 * @jest-environment node
 */
/**
 * The cookie-bound server client had no fetch timeout. During a database
 * stall, the storefront's admin-shortcut check (`resolveIsBrandAdmin`) and
 * every admin page held their lambda open until the platform killed it. The
 * anonymous, middleware and resolver clients are already bounded; this one
 * must be too.
 */
import { createServerClient } from '@supabase/ssr'

const mockedCreateServerClient = jest.mocked(createServerClient)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  mockedCreateServerClient.mockClear()
})

describe('createClient (server)', () => {
  it('passes a fetch that carries an abort signal', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    await createClient()

    const options = mockedCreateServerClient.mock.calls[0][2] as {
      global?: { fetch?: typeof fetch }
      db?: { retry?: boolean }
    }
    expect(options.db?.retry).toBe(false)
    const boundedFetch = options.global?.fetch
    expect(typeof boundedFetch).toBe('function')

    const baseFetch = jest.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return new Response('{}')
    })
    const original = globalThis.fetch
    globalThis.fetch = baseFetch as unknown as typeof fetch
    try {
      await boundedFetch!('https://x.supabase.co/rest/v1/tenants')
    } finally {
      globalThis.fetch = original
    }
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })
})
