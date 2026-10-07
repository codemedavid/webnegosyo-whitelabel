/**
 * @jest-environment node
 *
 * The merchant app authenticates against API routes with the staff member's
 * own Supabase access token. Sixteen routes repeated the same prologue — read
 * the header, build a client, `getUser()`, read `app_users`, check the store —
 * and none of them bounded the client's fetch, so a stalled GoTrue/PostgREST
 * held every one of them open. These pin the shared helper's contract.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: jest.fn(),
}))

type UserResult = { data: { user: { id: string } | null }; error: unknown }

function request(authorization?: string): NextRequest {
  return new NextRequest('http://localhost/api/anything', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

describe('bearer caller', () => {
  let createClient: jest.Mock
  let getUser: jest.Mock<() => Promise<UserResult>>
  let fetchAppUserScope: jest.Mock<() => Promise<unknown>>

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    getUser = jest.fn<() => Promise<UserResult>>().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const supabaseJs = await import('@supabase/supabase-js')
    createClient = supabaseJs.createClient as unknown as jest.Mock
    createClient.mockReturnValue({ auth: { getUser } })

    const scope = await import('@/lib/queries/fetch-app-user-scope')
    fetchAppUserScope = scope.fetchAppUserScope as unknown as typeof fetchAppUserScope
    fetchAppUserScope.mockResolvedValue({
      appUser: { role: 'admin', tenant_id: 't1', is_owner: true, permissions: null },
      error: null,
    })
  })

  test('refuses a request with no Authorization header without building a client', async () => {
    const { requireBearerStoreCaller } = await import('@/lib/auth/bearer-caller')

    const result = await requireBearerStoreCaller(request(), 't1', 'view')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    expect(await result.response.json()).toEqual({ error: 'Unauthorized' })
    expect(createClient).not.toHaveBeenCalled()
  })

  test('refuses a token GoTrue does not recognise', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } })
    const { requireBearerStoreCaller } = await import('@/lib/auth/bearer-caller')

    const result = await requireBearerStoreCaller(request('Bearer junk'), 't1', 'view')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  test('refuses a caller who is not staff of the named store', async () => {
    const { requireBearerStoreCaller } = await import('@/lib/auth/bearer-caller')

    const result = await requireBearerStoreCaller(request('Bearer good'), 'other-tenant', 'view')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(403)
    expect(await result.response.json()).toEqual({ error: 'Forbidden' })
  })

  test('returns the caller, and a client that carries their token on a bounded fetch', async () => {
    const { requireBearerStoreCaller } = await import('@/lib/auth/bearer-caller')

    const result = await requireBearerStoreCaller(request('Bearer good'), 't1', 'edit')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user.id).toBe('u1')
    expect(result.appUser?.tenant_id).toBe('t1')
    const [, , options] = createClient.mock.calls[0] as [string, string, {
      global: { headers: Record<string, string>; fetch: unknown }
      auth: Record<string, boolean>
    }]
    expect(options.global.headers.Authorization).toBe('Bearer good')
    expect(typeof options.global.fetch).toBe('function')
    // A server-side client must never try to persist or refresh a session.
    expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false })
  })
})
