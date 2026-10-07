/**
 * @jest-environment node
 */
/**
 * The merchant app has no cookies: it calls the Owl routes with its own
 * Supabase access token. Inside `withRequestBearer`, the server client must
 * act as that token's user, so every existing reader and writer (which all
 * build their client with `createClient()`) runs exactly as it does for a
 * browser session. Outside it, nothing changes.
 */
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'

jest.mock('@supabase/supabase-js', () => ({
  ...jest.requireActual('@supabase/supabase-js'),
  createClient: jest.fn(() => ({ kind: 'bearer-client' })),
}))

const mockedCreateServerClient = jest.mocked(createServerClient)
const mockedCreateJsClient = jest.mocked(createSupabaseJsClient)

function requestWith(authorization?: string): Request {
  return new Request('https://www.example.com/api/assistant/chat', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  mockedCreateServerClient.mockClear()
  mockedCreateJsClient.mockClear()
})

describe('readBearerToken', () => {
  it('returns the token of a well-formed Bearer header', async () => {
    const { readBearerToken } = await import('@/lib/supabase/bearer-session')
    expect(readBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(readBearerToken('bearer abc')).toBe('abc')
  })

  it('ignores missing, empty, non-Bearer and oversized headers', async () => {
    const { readBearerToken } = await import('@/lib/supabase/bearer-session')
    expect(readBearerToken(null)).toBeNull()
    expect(readBearerToken('')).toBeNull()
    expect(readBearerToken('Bearer ')).toBeNull()
    expect(readBearerToken('Basic dXNlcjpwYXNz')).toBeNull()
    expect(readBearerToken(`Bearer ${'x'.repeat(9000)}`)).toBeNull()
  })
})

describe('createClient inside withRequestBearer', () => {
  it('builds a token-bound client instead of the cookie client', async () => {
    const { withRequestBearer } = await import('@/lib/supabase/bearer-session')
    const { createClient } = await import('@/lib/supabase/server')

    const client = await withRequestBearer(requestWith('Bearer user-token'), () => createClient())

    expect(client).toEqual({ kind: 'bearer-client' })
    expect(mockedCreateServerClient).not.toHaveBeenCalled()
    const options = mockedCreateJsClient.mock.calls[0][2] as {
      global?: { headers?: Record<string, string>; fetch?: unknown }
      auth?: { persistSession?: boolean; autoRefreshToken?: boolean }
    }
    expect(options.global?.headers?.Authorization).toBe('Bearer user-token')
    expect(typeof options.global?.fetch).toBe('function')
    expect(options.auth?.persistSession).toBe(false)
    expect(options.auth?.autoRefreshToken).toBe(false)
  })

  it('keeps the token for work that finishes after the handler returned', async () => {
    const { withRequestBearer, getRequestBearerToken } = await import('@/lib/supabase/bearer-session')
    let later: Promise<string | null> = Promise.resolve(null)
    withRequestBearer(requestWith('Bearer streamed'), () => {
      later = new Promise((resolve) => setTimeout(() => resolve(getRequestBearerToken()), 5))
    })
    await expect(later).resolves.toBe('streamed')
    expect(getRequestBearerToken()).toBeNull()
  })

  it('uses the cookie client when the request carries no bearer token', async () => {
    const { withRequestBearer } = await import('@/lib/supabase/bearer-session')
    const { createClient } = await import('@/lib/supabase/server')

    await withRequestBearer(requestWith(), () => createClient())

    expect(mockedCreateServerClient).toHaveBeenCalledTimes(1)
    expect(mockedCreateJsClient).not.toHaveBeenCalled()
  })
})
