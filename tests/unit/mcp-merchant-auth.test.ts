import { describe, it, expect, jest } from '@jest/globals'
import { hashApiKey, verifyMcpKey } from '@/lib/mcp-auth'
import { createMcpTokenVerifier } from '@/lib/mcp/auth-adapter'

/**
 * Merchant-side MCP — Phase 1: tenant-bound credentials.
 *
 * A merchant credential is an `mcp_api_keys` row carrying scope `tenant_admin`
 * and a non-null `tenant_id`. Verification must surface that tenant binding so
 * the transport can pin every tool call to the merchant's own tenant. Legacy
 * superadmin keys have no tenant binding and must keep resolving with
 * `tenantId: null`.
 */

function makeSupabaseStub(row: unknown, error: unknown = null) {
  const maybeSingle = jest.fn(async () => ({ data: row, error }))
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  return { client: { from } as never, from, select, eq, maybeSingle }
}

const TENANT_ID = '11111111-2222-3333-4444-555555555555'

describe('verifyMcpKey — tenant binding', () => {
  it('resolves the bound tenantId for a tenant_admin key', async () => {
    const { client } = makeSupabaseStub({
      id: 'key_m1',
      scopes: ['tenant_admin'],
      revoked_at: null,
      tenant_id: TENANT_ID,
    })

    const result = await verifyMcpKey('Bearer smk_live_merchant', client)

    expect(result).toEqual({
      keyId: 'key_m1',
      scopes: ['tenant_admin'],
      tenantId: TENANT_ID,
    })
  })

  it('resolves tenantId null for a legacy superadmin key row', async () => {
    const { client } = makeSupabaseStub({
      id: 'key_1',
      scopes: ['superadmin'],
      revoked_at: null,
      tenant_id: null,
    })

    const result = await verifyMcpKey('Bearer smk_live_valid', client)

    expect(result).toEqual({ keyId: 'key_1', scopes: ['superadmin'], tenantId: null })
  })

  it('selects tenant_id from the key row so the binding cannot be spoofed by the caller', async () => {
    const { client, select } = makeSupabaseStub({
      id: 'key_m1',
      scopes: ['tenant_admin'],
      revoked_at: null,
      tenant_id: TENANT_ID,
    })

    await verifyMcpKey('Bearer smk_live_merchant', client)

    expect(select).toHaveBeenCalledWith(expect.stringContaining('tenant_id'))
  })

  it('still rejects a revoked tenant_admin key', async () => {
    const { client } = makeSupabaseStub({
      id: 'key_m1',
      scopes: ['tenant_admin'],
      revoked_at: '2026-08-01T00:00:00Z',
      tenant_id: TENANT_ID,
    })

    await expect(verifyMcpKey('Bearer smk_live_merchant', client)).rejects.toThrow(/revoked/i)
  })
})

describe('createMcpTokenVerifier — tenant binding', () => {
  it('surfaces the bound tenantId on AuthInfo.extra for a merchant credential', async () => {
    const { client } = makeSupabaseStub({
      id: 'key_m1',
      scopes: ['tenant_admin'],
      revoked_at: null,
      tenant_id: TENANT_ID,
    })
    const verify = createMcpTokenVerifier(client as never)
    const req = new Request('https://www.webnegosyo.com/api/mcp/merchant/mcp')

    const authInfo = await verify(req, 'smk_live_merchant')

    expect(authInfo).toBeDefined()
    expect(authInfo?.scopes).toEqual(['tenant_admin'])
    expect(authInfo?.extra).toEqual({ tenantId: TENANT_ID })
  })

  it('surfaces tenantId null for a superadmin credential', async () => {
    const { client } = makeSupabaseStub({
      id: 'key_1',
      scopes: ['superadmin'],
      revoked_at: null,
      tenant_id: null,
    })
    const verify = createMcpTokenVerifier(client as never)
    const req = new Request('https://www.webnegosyo.com/api/mcp/mcp')

    const authInfo = await verify(req, 'smk_live_valid')

    expect(authInfo?.extra).toEqual({ tenantId: null })
  })

  it('never resolves AuthInfo for an unknown credential (unchanged behavior)', async () => {
    const { client } = makeSupabaseStub(null)
    const verify = createMcpTokenVerifier(client as never)
    const req = new Request('https://www.webnegosyo.com/api/mcp/merchant/mcp')

    await expect(verify(req, 'smk_live_unknown')).resolves.toBeUndefined()
  })

  it('lookups remain hash-based, never plaintext', async () => {
    const { client, eq } = makeSupabaseStub({
      id: 'key_m1',
      scopes: ['tenant_admin'],
      revoked_at: null,
      tenant_id: TENANT_ID,
    })
    const verify = createMcpTokenVerifier(client as never)
    const req = new Request('https://www.webnegosyo.com/api/mcp/merchant/mcp')

    await verify(req, 'smk_live_merchant')

    expect(eq).toHaveBeenCalledWith('key_hash', hashApiKey('smk_live_merchant'))
  })
})
