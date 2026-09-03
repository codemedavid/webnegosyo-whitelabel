import { describe, expect, it, jest } from '@jest/globals'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createSuperadminTokenVerifier } from '@/lib/mcp/superadmin-auth'
import { SUPERADMIN_INTERNAL_SCOPE } from '@/lib/mcp/supabase-oauth-config'

function makeRequest(requestId = 'request-1'): Request {
  return {
    url: 'https://www.webnegosyo.com/api/mcp/mcp',
    headers: new Headers({ 'x-request-id': requestId }),
  } as unknown as Request
}

interface SupabaseStubOptions {
  claims?: Record<string, unknown> | null
  claimsError?: unknown
  role?: string | null
  roleError?: unknown
}

function makeSupabaseStub({
  claims = {
    sub: 'user-1',
    client_id: 'oauth-client-1',
    aud: 'https://www.webnegosyo.com/api/mcp/mcp',
  },
  claimsError = null,
  role = 'superadmin',
  roleError = null,
}: SupabaseStubOptions = {}) {
  const getClaims = jest.fn<(token: string) => Promise<unknown>>(async () => ({
    data: { claims },
    error: claimsError,
  }))
  const maybeSingle = jest.fn<() => Promise<unknown>>(async () => ({
    data: role === null ? null : { role },
    error: roleError,
  }))
  const eq = jest.fn<(column: string, value: string) => { maybeSingle: typeof maybeSingle }>(() => ({
    maybeSingle,
  }))
  const select = jest.fn<(columns: string) => { eq: typeof eq }>(() => ({ eq }))
  const from = jest.fn<(table: string) => { select: typeof select }>(() => ({ select }))
  const client = { auth: { getClaims }, from } as unknown as SupabaseClient<Database>

  return { client, getClaims, from, select, eq, maybeSingle }
}

describe('createSuperadminTokenVerifier', () => {
  it('authorizes a valid audience-bound OAuth token for a current superadmin', async () => {
    const { client, getClaims, select, eq } = makeSupabaseStub()
    const verify = createSuperadminTokenVerifier(client)

    await expect(verify(makeRequest(), 'test-bearer-token')).resolves.toEqual({
      token: 'test-bearer-token',
      clientId: 'oauth-client-1',
      scopes: [SUPERADMIN_INTERNAL_SCOPE],
      extra: { userId: 'user-1', role: 'superadmin' },
    })

    expect(getClaims).toHaveBeenCalledWith('test-bearer-token')
    expect(select).toHaveBeenCalledWith('role')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('short-circuits missing tokens before JWT validation or role lookup', async () => {
    const { client, getClaims, from } = makeSupabaseStub()

    await expect(createSuperadminTokenVerifier(client)(makeRequest())).resolves.toBeUndefined()

    expect(getClaims).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects an ordinary browser token without an OAuth client_id before role lookup', async () => {
    const { client, getClaims, from } = makeSupabaseStub({
      claims: { sub: 'user-1', aud: 'https://www.webnegosyo.com/api/mcp/mcp' },
    })

    await expect(createSuperadminTokenVerifier(client)(makeRequest(), 'test-browser-token')).resolves.toBeUndefined()

    expect(getClaims).toHaveBeenCalledWith('test-browser-token')
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a token for another audience before role lookup', async () => {
    const { client, from } = makeSupabaseStub({
      claims: { sub: 'user-1', client_id: 'oauth-client-1', aud: 'authenticated' },
    })

    await expect(createSuperadminTokenVerifier(client)(makeRequest(), 'test-wrong-audience')).resolves.toBeUndefined()

    expect(from).not.toHaveBeenCalled()
  })

  it('rejects invalid or expired getClaims responses before role lookup', async () => {
    const { client, from } = makeSupabaseStub({ claimsError: new Error('expired') })

    await expect(createSuperadminTokenVerifier(client)(makeRequest(), 'test-expired-token')).resolves.toBeUndefined()

    expect(from).not.toHaveBeenCalled()
  })

  it('rejects claims missing sub before role lookup', async () => {
    const { client, from } = makeSupabaseStub({
      claims: { client_id: 'oauth-client-1', aud: 'https://www.webnegosyo.com/api/mcp/mcp' },
    })

    await expect(createSuperadminTokenVerifier(client)(makeRequest(), 'test-no-sub')).resolves.toBeUndefined()

    expect(from).not.toHaveBeenCalled()
  })

  it('rejects missing claims before role lookup', async () => {
    const { client, from } = makeSupabaseStub({ claims: null })

    await expect(createSuperadminTokenVerifier(client)(makeRequest(), 'test-no-claims')).resolves.toBeUndefined()

    expect(from).not.toHaveBeenCalled()
  })

  it('accepts an audience array containing the exact MCP resource', async () => {
    const { client } = makeSupabaseStub({
      claims: {
        sub: 'user-1',
        client_id: 'oauth-client-1',
        aud: ['authenticated', 'https://www.webnegosyo.com/api/mcp/mcp'],
      },
    })

    await expect(createSuperadminTokenVerifier(client)(makeRequest(), 'test-array-audience')).resolves.toMatchObject({
      scopes: [SUPERADMIN_INTERNAL_SCOPE],
    })
  })

  it.each([
    ['a non-superadmin role', 'manager'],
    ['a missing role row', null],
  ])('returns authenticated empty scopes for %s', async (_case, role) => {
    const { client } = makeSupabaseStub({ role })

    await expect(createSuperadminTokenVerifier(client)(makeRequest(), 'test-non-superadmin')).resolves.toEqual({
      token: 'test-non-superadmin',
      clientId: 'oauth-client-1',
      scopes: [],
      extra: { userId: 'user-1', role },
    })
  })

  it('fails closed when the current role lookup errors', async () => {
    const { client } = makeSupabaseStub({ roleError: new Error('database unavailable') })

    await expect(createSuperadminTokenVerifier(client)(makeRequest(), 'test-db-error')).resolves.toBeUndefined()
  })

  it('logs rejection metadata without the bearer token', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const token = 'test-bearer-token-that-must-not-appear-in-logs'
    const { client } = makeSupabaseStub({ claimsError: new Error(token) })

    await expect(createSuperadminTokenVerifier(client)(makeRequest('request-log'), token)).resolves.toBeUndefined()

    expect(error).toHaveBeenCalledWith('[SmartMenu MCP superadmin auth rejected]', {
      requestId: 'request-log',
      reason: 'invalid_oauth_claims',
    })
    expect(JSON.stringify(error.mock.calls)).not.toContain(token)
    error.mockRestore()
  })
})
