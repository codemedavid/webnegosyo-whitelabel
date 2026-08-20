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
 * pinned. A superadmin authorization keeps tenant_id NULL everywhere.
 */

const NOW = 1_700_000_000_000
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

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

  it('persists tenant_id null on a superadmin authorization code', async () => {
    const { client, inserts } = makeClient()

    await issueAuthorizationCode(
      client,
      {
        clientId: 'client_1',
        redirectUri: 'https://claude.ai/callback',
        codeChallenge: s256(VERIFIER),
        codeChallengeMethod: 'S256',
        scope: 'superadmin offline_access',
        userId: 'user_1',
      },
      { now: NOW, ttlSeconds: 600 },
    )

    const codeInsert = inserts.find((i) => i.table === 'mcp_oauth_codes')!
    expect(codeInsert.payload.tenant_id).toBeNull()
  })
})

describe('exchangeAuthorizationCode — tenant binding', () => {
  it('stamps the code-bound tenant onto the access-token key row and the refresh-token row', async () => {
    const { client, inserts, singleQueue } = makeClient()
    singleQueue.push({ data: merchantCodeRow(), error: null }) // code lookup
    singleQueue.push({ data: { id: 'code_1' }, error: null }) // consume

    await exchangeAuthorizationCode(
      client,
      {
        code: 'the-code',
        clientId: 'client_1',
        redirectUri: 'https://claude.ai/callback',
        codeVerifier: VERIFIER,
      },
      { now: NOW, accessTtlSeconds: 3600, refreshTtlSeconds: 86_400 },
    )

    const keyInsert = inserts.find((i) => i.table === 'mcp_api_keys')!
    expect(keyInsert.payload.tenant_id).toBe(TENANT_ID)
    expect(keyInsert.payload.scopes).toEqual(['tenant_admin'])

    const refreshInsert = inserts.find((i) => i.table === 'mcp_oauth_tokens')!
    expect(refreshInsert.payload.tenant_id).toBe(TENANT_ID)
  })

  it('keeps tenant_id null across superadmin token issuance', async () => {
    const { client, inserts, singleQueue } = makeClient()
    singleQueue.push({
      data: merchantCodeRow({ scope: 'superadmin offline_access', tenant_id: null }),
      error: null,
    })
    singleQueue.push({ data: { id: 'code_1' }, error: null })

    await exchangeAuthorizationCode(
      client,
      {
        code: 'the-code',
        clientId: 'client_1',
        redirectUri: 'https://claude.ai/callback',
        codeVerifier: VERIFIER,
      },
      { now: NOW, accessTtlSeconds: 3600, refreshTtlSeconds: 86_400 },
    )

    const keyInsert = inserts.find((i) => i.table === 'mcp_api_keys')!
    expect(keyInsert.payload.tenant_id).toBeNull()
    const refreshInsert = inserts.find((i) => i.table === 'mcp_oauth_tokens')!
    expect(refreshInsert.payload.tenant_id).toBeNull()
  })
})

describe('refreshAccessToken — tenant binding', () => {
  it('carries the tenant pin through refresh so rotated tokens stay bound', async () => {
    const { client, inserts, singleQueue } = makeClient()
    singleQueue.push({
      data: {
        id: 'token_1',
        client_id: 'client_1',
        subject: 'user_1',
        scope: 'tenant_admin offline_access',
        revoked_at: null,
        expires_at: new Date(NOW + 60_000).toISOString(),
        tenant_id: TENANT_ID,
      },
      error: null,
    })

    await refreshAccessToken(
      client,
      { refreshToken: 'refresh-1', clientId: 'client_1' },
      { now: NOW, accessTtlSeconds: 3600, refreshTtlSeconds: 86_400 },
    )

    const keyInsert = inserts.find((i) => i.table === 'mcp_api_keys')!
    expect(keyInsert.payload.tenant_id).toBe(TENANT_ID)
    const refreshInsert = inserts.find((i) => i.table === 'mcp_oauth_tokens')!
    expect(refreshInsert.payload.tenant_id).toBe(TENANT_ID)
  })
})
