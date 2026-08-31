import { describe, it, expect, jest } from '@jest/globals'
import { createHash } from 'crypto'
import {
  issueAuthorizationCode,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from '@/lib/mcp/oauth-service'

/**
 * Merchant-side MCP — Phase 2: OAuth issuance bound to a tenant.
 *
 * A merchant authorization is minted with scope `tenant_admin` and the
 * merchant's tenant. That binding must survive the entire chain: the
 * authorization code row, the access-token `mcp_api_keys` row (where phase 1's
 * verifier reads it), and the refresh-token row so refreshed access tokens stay
 * pinned.
 */

const NOW = 1_700_000_000_000
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const TOKEN_OPTS = {
  now: NOW,
  accessTtlSeconds: 3600,
  refreshTtlSeconds: 86_400,
  audience: 'https://example.com/api/mcp/merchant/mcp',
  issuer: 'https://example.com',
} as const

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

const VERIFIER = 'v'.repeat(64)

function merchantCodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'code_1',
    client_id: 'client_1',
    redirect_uri: 'https://claude.ai/callback',
    code_challenge: s256(VERIFIER),
    code_challenge_method: 'S256',
    scope: 'tenant_admin offline_access',
    created_by: 'user_1',
    consumed_at: null,
    expires_at: new Date(NOW + 60_000).toISOString(),
    tenant_id: TENANT_ID,
    ...overrides,
  }
}

describe('issueAuthorizationCode — tenant binding', () => {
  it('persists the tenant_id on a merchant authorization code', async () => {
    const { client, inserts } = makeClient()

    await issueAuthorizationCode(
      client,
      {
        clientId: 'client_1',
        redirectUri: 'https://claude.ai/callback',
        codeChallenge: s256(VERIFIER),
        codeChallengeMethod: 'S256',
        scope: 'tenant_admin offline_access',
        userId: 'user_1',
        tenantId: TENANT_ID,
      },
      { now: NOW, ttlSeconds: 600 },
    )

    const codeInsert = inserts.find((i) => i.table === 'mcp_oauth_codes')!
    expect(codeInsert.payload.tenant_id).toBe(TENANT_ID)
  })
})

describe('exchangeAuthorizationCode — tenant binding', () => {
  it.each(['tenant_admin', 'tenant_admin offline_access'])(
    'stamps the code-bound tenant through a valid %s grant',
    async (scope) => {
      const { client, inserts, singleQueue } = makeClient()
      singleQueue.push({ data: merchantCodeRow({ scope }), error: null }) // code lookup
      singleQueue.push({ data: { id: 'code_1' }, error: null }) // consume

      await exchangeAuthorizationCode(
        client,
        {
          code: 'the-code',
          clientId: 'client_1',
          redirectUri: 'https://claude.ai/callback',
          codeVerifier: VERIFIER,
        },
        TOKEN_OPTS,
      )

      const keyInsert = inserts.find((i) => i.table === 'mcp_api_keys')!
      expect(keyInsert.payload.tenant_id).toBe(TENANT_ID)
      expect(keyInsert.payload.scopes).toEqual(['tenant_admin'])

      const refreshInsert = inserts.find((i) => i.table === 'mcp_oauth_tokens')!
      expect(refreshInsert.payload.tenant_id).toBe(TENANT_ID)
      expect(refreshInsert.payload.scope).toBe(scope)
    },
  )

  it.each([
    ['a legacy superadmin code', { scope: 'superadmin', tenant_id: null }],
    ['a code without merchant authority', { scope: 'offline_access' }],
    ['a code without a tenant binding', { scope: 'tenant_admin offline_access', tenant_id: null }],
    ['a code with an unsupported scope', { scope: 'tenant_admin offline_access profile' }],
  ])('rejects %s before consuming it', async (_label, overrides) => {
    const { client, inserts, singleQueue, updates } = makeClient()
    singleQueue.push({ data: merchantCodeRow(overrides), error: null })

    await expect(exchangeAuthorizationCode(
      client,
      {
        code: 'the-code',
        clientId: 'client_1',
        redirectUri: 'https://claude.ai/callback',
        codeVerifier: VERIFIER,
      },
      TOKEN_OPTS,
    )).rejects.toThrow(/invalid_grant/i)

    expect(updates).toEqual([])
    expect(inserts).toEqual([])
  })
})

describe('refreshAccessToken — tenant binding', () => {
  it.each(['tenant_admin', 'tenant_admin offline_access'])(
    'carries the tenant pin through a valid %s refresh',
    async (scope) => {
      const { client, inserts, singleQueue } = makeClient()
      singleQueue.push({
        data: {
          id: 'token_1',
          client_id: 'client_1',
          subject: 'user_1',
          scope,
          revoked_at: null,
          expires_at: new Date(NOW + 60_000).toISOString(),
          tenant_id: TENANT_ID,
        },
        error: null,
      })

      await refreshAccessToken(
        client,
        { refreshToken: 'refresh-1', clientId: 'client_1' },
        TOKEN_OPTS,
      )

      const keyInsert = inserts.find((i) => i.table === 'mcp_api_keys')!
      expect(keyInsert.payload.tenant_id).toBe(TENANT_ID)
      const refreshInsert = inserts.find((i) => i.table === 'mcp_oauth_tokens')!
      expect(refreshInsert.payload.tenant_id).toBe(TENANT_ID)
      expect(refreshInsert.payload.scope).toBe(scope)
    },
  )

  it.each([
    ['a legacy superadmin token', 'superadmin', null],
    ['a token without merchant authority', 'offline_access', TENANT_ID],
    ['a token without a tenant binding', 'tenant_admin offline_access', null],
    ['a token with an unsupported scope', 'tenant_admin offline_access profile', TENANT_ID],
  ])('rejects %s without rotating or issuing tokens', async (_label, scope, tenantId) => {
    const { client, inserts, singleQueue, updates } = makeClient()
    singleQueue.push({
      data: {
        id: 'token_1',
        client_id: 'client_1',
        subject: 'user_1',
        scope,
        revoked_at: null,
        expires_at: new Date(NOW + 60_000).toISOString(),
        tenant_id: tenantId,
      },
      error: null,
    })

    await expect(refreshAccessToken(
      client,
      { refreshToken: 'refresh-1', clientId: 'client_1' },
      TOKEN_OPTS,
    )).rejects.toThrow(/invalid_grant/i)

    expect(updates).toEqual([])
    expect(inserts).toEqual([])
  })
})
