import { describe, it, expect, jest } from '@jest/globals'
import { MCP_KEY_PREFIX } from '@/lib/mcp-auth'
import {
  listMerchantMcpKeys,
  createMerchantMcpKey,
  revokeMerchantMcpKey,
} from '@/lib/mcp-keys-service'
import { resolveMerchantMcpConnectUrl } from '@/lib/mcp/connect-url'

/**
 * Merchant-side MCP — Phase 6: tenant-scoped key management.
 *
 * These back the tenant admin "Connect AI" page. Every operation is pinned to
 * ONE tenant at the service layer: a merchant key is minted with scope
 * `tenant_admin` + that tenant's id (the DB CHECK rejects anything else), and
 * revocation filters by tenant too — so even a buggy caller can never revoke
 * another store's credential by guessing its key id.
 */

/** Chainable Supabase stub (same shape as mcp-keys-service.test.ts). */
function makeClient() {
  const selectColumns: string[] = []
  const insertPayloads: Record<string, unknown>[] = []
  const updatePayloads: Record<string, unknown>[] = []
  const eqCalls: Array<[string, unknown]> = []
  const tables: string[] = []
  const listQueue: Array<{ data: unknown; error: unknown }> = []
  const singleQueue: Array<{ data: unknown; error: unknown }> = []

  const builder: Record<string, unknown> = {}
  builder.select = jest.fn((cols?: string) => { if (cols) selectColumns.push(cols); return builder })
  builder.eq = jest.fn((col: string, value: unknown) => { eqCalls.push([col, value]); return builder })
  builder.order = jest.fn(() => builder)
  builder.insert = jest.fn((p: Record<string, unknown>) => { insertPayloads.push(p); return builder })
  builder.update = jest.fn((p: Record<string, unknown>) => { updatePayloads.push(p); return builder })
  builder.single = jest.fn(async () => singleQueue.shift() ?? { data: null, error: null })
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve(listQueue.shift() ?? { data: [], error: null })

  const from = jest.fn((t: string) => { tables.push(t); return builder })
  const client = { from } as never
  return { client, from, selectColumns, insertPayloads, updatePayloads, eqCalls, tables, listQueue, singleQueue }
}

const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const ROW = {
  id: 'key_1',
  label: 'Owner laptop',
  key_prefix: MCP_KEY_PREFIX,
  scopes: ['tenant_admin'],
  created_at: '2026-08-20T00:00:00Z',
  last_used_at: null,
  revoked_at: null,
}

describe('createMerchantMcpKey', () => {
  it('mints a tenant_admin key pinned to the tenant, returning the plaintext once', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: ROW, error: null })

    const created = await createMerchantMcpKey(stub.client, TENANT, 'Owner laptop', 'user-1')

    expect(stub.from).toHaveBeenCalledWith('mcp_api_keys')
    expect(stub.insertPayloads[0]).toMatchObject({
      scopes: ['tenant_admin'],
      tenant_id: TENANT,
      label: 'Owner laptop',
      created_by: 'user-1',
    })
    expect(typeof stub.insertPayloads[0].key_hash).toBe('string')
    expect(created.plaintext.startsWith(MCP_KEY_PREFIX)).toBe(true)
    expect(created.key.scopes).toEqual(['tenant_admin'])
    // the stored summary never carries the hash
    expect(JSON.stringify(created.key)).not.toContain('hash')
  })

  it('rejects an empty label before touching the database', async () => {
    const stub = makeClient()
    await expect(createMerchantMcpKey(stub.client, TENANT, '   ')).rejects.toThrow(/label/i)
    expect(stub.insertPayloads).toHaveLength(0)
  })

  it('rejects a missing tenant id before touching the database', async () => {
    const stub = makeClient()
    await expect(createMerchantMcpKey(stub.client, '', 'Owner laptop')).rejects.toThrow(/tenant/i)
    expect(stub.insertPayloads).toHaveLength(0)
  })
})

describe('listMerchantMcpKeys', () => {
  it('lists only the tenant\'s own keys and never selects the key_hash', async () => {
    const stub = makeClient()
    stub.listQueue.push({ data: [ROW], error: null })

    const keys = await listMerchantMcpKeys(stub.client, TENANT)

    expect(stub.eqCalls).toContainEqual(['tenant_id', TENANT])
    expect(stub.selectColumns.join(',')).not.toContain('key_hash')
    expect(keys[0]).toMatchObject({ id: 'key_1', scopes: ['tenant_admin'] })
  })
})

describe('revokeMerchantMcpKey', () => {
  it('filters the revocation by BOTH key id and tenant id', async () => {
    // The tenant filter is the cross-store safety net: a guessed/leaked key id
    // from another tenant must not be revocable through this path.
    const stub = makeClient()
    stub.singleQueue.push({ data: { ...ROW, revoked_at: '2026-08-20T01:00:00Z' }, error: null })

    const summary = await revokeMerchantMcpKey(stub.client, TENANT, 'key_1')

    expect(stub.updatePayloads[0]).toHaveProperty('revoked_at')
    expect(stub.eqCalls).toContainEqual(['id', 'key_1'])
    expect(stub.eqCalls).toContainEqual(['tenant_id', TENANT])
    expect(summary.revokedAt).toBe('2026-08-20T01:00:00Z')
  })

  it('throws when the key does not belong to the tenant', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: null, error: { message: 'no rows returned' } })

    await expect(revokeMerchantMcpKey(stub.client, TENANT, 'someone-elses-key')).rejects.toThrow(/revoke/i)
  })
})

describe('resolveMerchantMcpConnectUrl', () => {
  it('points at the merchant transport, on the terminal www origin', () => {
    const url = resolveMerchantMcpConnectUrl({ NEXT_PUBLIC_APP_URL: 'https://webnegosyo.com' })
    expect(url).toBe('https://www.webnegosyo.com/api/mcp/merchant/mcp')
  })

  it('falls back to the bare path when no base is configured', () => {
    expect(resolveMerchantMcpConnectUrl({})).toBe('/api/mcp/merchant/mcp')
  })
})
