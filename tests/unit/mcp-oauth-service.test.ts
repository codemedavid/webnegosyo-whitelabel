import { describe, it, expect } from '@jest/globals'
import { createHash } from 'crypto'
import { verifyAccessToken } from '@/lib/mcp/oauth-jwt'
import {
  verifyPkce,
  registerClient,
  issueAuthorizationCode,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from '@/lib/mcp/oauth-service'

const SECRET = 'oauth-test-secret-0123456789abcdef'
const NOW = 1_700_000_000_000
const RESOURCE = 'https://www.webnegosyo.com/api/mcp/mcp'

/** Chainable Supabase stub with per-table terminal queues keyed by call order. */
function makeClient() {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = []
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = []
  const singleQueue: Array<{ data: unknown; error: unknown }> = []
  const tables: string[] = []
  let currentTable = ''

  const builder: Record<string, unknown> = {}
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.insert = jest.fn((p: Record<string, unknown>) => { inserts.push({ table: currentTable, payload: p }); return builder })
  builder.update = jest.fn((p: Record<string, unknown>) => { updates.push({ table: currentTable, payload: p }); return builder })
  builder.single = jest.fn(async () => singleQueue.shift() ?? { data: null, error: null })
  builder.maybeSingle = jest.fn(async () => singleQueue.shift() ?? { data: null, error: null })
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })

  const from = jest.fn((t: string) => { currentTable = t; tables.push(t); return builder })
  const client = { from } as never
  return { client, from, inserts, updates, singleQueue, tables }
}

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

describe('verifyPkce', () => {
  it('accepts a correct S256 verifier for its challenge', () => {
    const verifier = 'a'.repeat(64)
    expect(verifyPkce(verifier, s256(verifier), 'S256')).toBe(true)
  })

  it('rejects a wrong S256 verifier', () => {
    const verifier = 'a'.repeat(64)
    expect(verifyPkce('b'.repeat(64), s256(verifier), 'S256')).toBe(false)
  })

  it('supports the plain method', () => {
    expect(verifyPkce('xyz', 'xyz', 'plain')).toBe(true)
    expect(verifyPkce('xyz', 'abc', 'plain')).toBe(false)
  })
})

describe('registerClient (Dynamic Client Registration)', () => {
  it('inserts a public client with a generated id and echoes redirect uris', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: { client_id: 'generated', client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] }, error: null })

    const result = await registerClient(stub.client, {
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/cb'],
    })

    expect(stub.from).toHaveBeenCalledWith('mcp_oauth_clients')
    expect(stub.inserts[0].payload).toMatchObject({ client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] })
    expect(typeof stub.inserts[0].payload.client_id).toBe('string')
    expect(result.client_id).toBeTruthy()
    // public client → no secret issued
    expect(result).not.toHaveProperty('client_secret')
  })

  it('rejects registration with no redirect uris', async () => {
    const stub = makeClient()
    await expect(registerClient(stub.client, { client_name: 'x', redirect_uris: [] })).rejects.toThrow(/redirect/i)
    expect(stub.from).not.toHaveBeenCalled()
  })
})

describe('issueAuthorizationCode', () => {
  it('stores only the hash of the code plus PKCE + subject metadata and returns the plaintext code', async () => {
    const stub = makeClient()
    const code = await issueAuthorizationCode(
      stub.client,
      {
        clientId: 'client_1',
        redirectUri: 'https://claude.ai/cb',
        codeChallenge: 'chal',
        codeChallengeMethod: 'S256',
        scope: 'superadmin',
        userId: 'user_1',
      },
      { now: NOW, ttlSeconds: 600 },
    )

    expect(stub.from).toHaveBeenCalledWith('mcp_oauth_codes')
    const payload = stub.inserts[0].payload
    expect(payload.code_hash).toBe(createHash('sha256').update(code).digest('hex'))
    expect(JSON.stringify(payload)).not.toContain(code)
    expect(payload).toMatchObject({
      client_id: 'client_1',
      redirect_uri: 'https://claude.ai/cb',
      code_challenge: 'chal',
      code_challenge_method: 'S256',
      scope: 'superadmin',
      created_by: 'user_1',
    })
    expect(typeof payload.expires_at).toBe('string')
  })
})

describe('exchangeAuthorizationCode', () => {
  const verifier = 'v'.repeat(64)
  const storedCodeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'code_row_1',
    client_id: 'client_1',
    redirect_uri: 'https://claude.ai/cb',
    code_challenge: s256(verifier),
    code_challenge_method: 'S256',
    scope: 'superadmin',
    created_by: 'user_1',
    consumed_at: null,
    expires_at: new Date(NOW + 60_000).toISOString(),
    ...overrides,
  })

  it('issues a signed access token + refresh token for a valid code and verifier', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: storedCodeRow(), error: null }) // code lookup
    stub.singleQueue.push({ data: { id: 'code_row_1', consumed_at: 'x' }, error: null }) // consume update
    stub.singleQueue.push({ data: { id: 'tok_1' }, error: null }) // refresh insert

    const result = await exchangeAuthorizationCode(
      stub.client,
      { code: 'plaintext-code', clientId: 'client_1', redirectUri: 'https://claude.ai/cb', codeVerifier: verifier },
      { now: NOW, secret: SECRET, accessTtlSeconds: 3600, refreshTtlSeconds: 2_592_000, audience: RESOURCE },
    )

    expect(result.token_type).toBe('Bearer')
    expect(result.expires_in).toBe(3600)
    expect(result.refresh_token).toBeTruthy()
    const decoded = verifyAccessToken(result.access_token, { secret: SECRET, now: NOW, audience: RESOURCE })
    expect(decoded).toMatchObject({ sub: 'user_1', scope: 'superadmin', client_id: 'client_1', aud: RESOURCE })
    // the code is marked consumed and only the refresh token HASH is stored
    expect(stub.updates.some((u) => u.table === 'mcp_oauth_codes' && 'consumed_at' in u.payload)).toBe(true)
    const refreshInsert = stub.inserts.find((i) => i.table === 'mcp_oauth_tokens')
    expect(refreshInsert?.payload.token_hash).toBe(createHash('sha256').update(result.refresh_token as string).digest('hex'))
    expect(JSON.stringify(refreshInsert?.payload)).not.toContain(result.refresh_token)
  })

  it('rejects an unknown code', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: null, error: null })
    await expect(
      exchangeAuthorizationCode(
        stub.client,
        { code: 'nope', clientId: 'client_1', redirectUri: 'https://claude.ai/cb', codeVerifier: verifier },
        { now: NOW, secret: SECRET, accessTtlSeconds: 3600, refreshTtlSeconds: 100, audience: RESOURCE },
      ),
    ).rejects.toThrow(/invalid_grant/i)
  })

  it('rejects an already-consumed code', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: storedCodeRow({ consumed_at: new Date(NOW).toISOString() }), error: null })
    await expect(
      exchangeAuthorizationCode(
        stub.client,
        { code: 'c', clientId: 'client_1', redirectUri: 'https://claude.ai/cb', codeVerifier: verifier },
        { now: NOW, secret: SECRET, accessTtlSeconds: 3600, refreshTtlSeconds: 100, audience: RESOURCE },
      ),
    ).rejects.toThrow(/invalid_grant/i)
  })

  it('rejects an expired code', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: storedCodeRow({ expires_at: new Date(NOW - 1000).toISOString() }), error: null })
    await expect(
      exchangeAuthorizationCode(
        stub.client,
        { code: 'c', clientId: 'client_1', redirectUri: 'https://claude.ai/cb', codeVerifier: verifier },
        { now: NOW, secret: SECRET, accessTtlSeconds: 3600, refreshTtlSeconds: 100, audience: RESOURCE },
      ),
    ).rejects.toThrow(/invalid_grant/i)
  })

  it('rejects a bad PKCE verifier', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: storedCodeRow(), error: null })
    await expect(
      exchangeAuthorizationCode(
        stub.client,
        { code: 'c', clientId: 'client_1', redirectUri: 'https://claude.ai/cb', codeVerifier: 'wrong'.repeat(16) },
        { now: NOW, secret: SECRET, accessTtlSeconds: 3600, refreshTtlSeconds: 100, audience: RESOURCE },
      ),
    ).rejects.toThrow(/invalid_grant|pkce/i)
  })

  it('rejects a redirect_uri mismatch', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: storedCodeRow(), error: null })
    await expect(
      exchangeAuthorizationCode(
        stub.client,
        { code: 'c', clientId: 'client_1', redirectUri: 'https://evil.example/cb', codeVerifier: verifier },
        { now: NOW, secret: SECRET, accessTtlSeconds: 3600, refreshTtlSeconds: 100, audience: RESOURCE },
      ),
    ).rejects.toThrow(/invalid_grant/i)
  })
})

describe('refreshAccessToken', () => {
  it('issues a new access token for a valid, non-revoked refresh token', async () => {
    const stub = makeClient()
    stub.singleQueue.push({
      data: {
        id: 'tok_1',
        client_id: 'client_1',
        subject: 'user_1',
        scope: 'superadmin',
        revoked_at: null,
        expires_at: new Date(NOW + 100_000).toISOString(),
      },
      error: null,
    })

    const result = await refreshAccessToken(
      stub.client,
      { refreshToken: 'refresh-plain', clientId: 'client_1' },
      { now: NOW, secret: SECRET, accessTtlSeconds: 3600, audience: RESOURCE },
    )

    const decoded = verifyAccessToken(result.access_token, { secret: SECRET, now: NOW, audience: RESOURCE })
    expect(decoded).toMatchObject({ sub: 'user_1', client_id: 'client_1', aud: RESOURCE })
    expect(result.expires_in).toBe(3600)
  })

  it('rejects a revoked refresh token', async () => {
    const stub = makeClient()
    stub.singleQueue.push({
      data: { id: 'tok_1', client_id: 'client_1', subject: 'user_1', scope: 'superadmin', revoked_at: new Date(NOW).toISOString(), expires_at: new Date(NOW + 100_000).toISOString() },
      error: null,
    })
    await expect(
      refreshAccessToken(stub.client, { refreshToken: 'r', clientId: 'client_1' }, { now: NOW, secret: SECRET, accessTtlSeconds: 3600, audience: RESOURCE }),
    ).rejects.toThrow(/invalid_grant/i)
  })
})
