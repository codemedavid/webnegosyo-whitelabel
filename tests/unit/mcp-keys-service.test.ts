import { describe, it, expect } from '@jest/globals'
import { hashApiKey, MCP_KEY_PREFIX } from '@/lib/mcp-auth'
import { listMcpKeys, createMcpKey, revokeMcpKey } from '@/lib/mcp-keys-service'

/**
 * Chainable Supabase-query stub tailored to mcp-keys-service. Records the
 * columns selected, the insert/update payloads, and the tables touched, and
 * resolves terminal reads from a queue. Awaiting the builder directly (as a
 * `.select().order()` list read does) resolves to the queued list result.
 */
function makeClient() {
  const selectColumns: string[] = []
  const insertPayloads: Record<string, unknown>[] = []
  const updatePayloads: Record<string, unknown>[] = []
  const tables: string[] = []
  const listQueue: Array<{ data: unknown; error: unknown }> = []
  const singleQueue: Array<{ data: unknown; error: unknown }> = []

  const builder: Record<string, unknown> = {}
  builder.select = jest.fn((cols?: string) => { if (cols) selectColumns.push(cols); return builder })
  builder.eq = jest.fn(() => builder)
  builder.order = jest.fn(() => builder)
  builder.insert = jest.fn((p: Record<string, unknown>) => { insertPayloads.push(p); return builder })
  builder.update = jest.fn((p: Record<string, unknown>) => { updatePayloads.push(p); return builder })
  builder.single = jest.fn(async () => singleQueue.shift() ?? { data: null, error: null })
  builder.maybeSingle = jest.fn(async () => singleQueue.shift() ?? { data: null, error: null })
  // Awaiting the builder directly → list read.
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve(listQueue.shift() ?? { data: [], error: null })

  const from = jest.fn((t: string) => { tables.push(t); return builder })
  const client = { from } as never
  return { client, from, builder, selectColumns, insertPayloads, updatePayloads, tables, listQueue, singleQueue }
}

const ROW = {
  id: 'key_1',
  label: "Angelo's laptop",
  key_prefix: MCP_KEY_PREFIX,
  scopes: ['superadmin'],
  created_at: '2026-07-21T00:00:00Z',
  last_used_at: null,
  revoked_at: null,
}

describe('listMcpKeys', () => {
  it('maps rows to summaries and never selects or returns the key_hash', async () => {
    const stub = makeClient()
    stub.listQueue.push({ data: [ROW], error: null })

    const keys = await listMcpKeys(stub.client)

    expect(stub.from).toHaveBeenCalledWith('mcp_api_keys')
    // key_hash must never be part of the projection
    expect(stub.selectColumns.join(',')).not.toContain('key_hash')
    expect(keys).toEqual([
      {
        id: 'key_1',
        label: "Angelo's laptop",
        keyPrefix: MCP_KEY_PREFIX,
        scopes: ['superadmin'],
        createdAt: '2026-07-21T00:00:00Z',
        lastUsedAt: null,
        revokedAt: null,
      },
    ])
    // ensure the mapped object carries no hash under any key
    expect(JSON.stringify(keys)).not.toContain('hash')
  })

  it('returns an empty array when there are no keys', async () => {
    const stub = makeClient()
    stub.listQueue.push({ data: [], error: null })
    expect(await listMcpKeys(stub.client)).toEqual([])
  })

  it('throws when the list query errors', async () => {
    const stub = makeClient()
    stub.listQueue.push({ data: null, error: { message: 'boom' } })
    await expect(listMcpKeys(stub.client)).rejects.toThrow(/boom/)
  })
})

describe('createMcpKey', () => {
  it('stores only the hash of a fresh key and returns the plaintext exactly once', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: { ...ROW }, error: null })

    const result = await createMcpKey(stub.client, "Angelo's laptop")

    expect(stub.from).toHaveBeenCalledWith('mcp_api_keys')
    const inserted = stub.insertPayloads[0]
    // plaintext is returned to the caller but NEVER placed in the insert payload
    expect(result.plaintext.startsWith(MCP_KEY_PREFIX)).toBe(true)
    expect(JSON.stringify(inserted)).not.toContain(result.plaintext)
    // what is persisted is the sha-256 hash of the returned plaintext
    expect(inserted.key_hash).toBe(hashApiKey(result.plaintext))
    expect(inserted).toMatchObject({ key_prefix: MCP_KEY_PREFIX, label: "Angelo's laptop", scopes: ['superadmin'] })
    expect(result.key).toMatchObject({ id: 'key_1', label: "Angelo's laptop" })
  })

  it('records the creator when provided', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: { ...ROW }, error: null })
    await createMcpKey(stub.client, 'CI key', 'user_9')
    expect(stub.insertPayloads[0]).toMatchObject({ created_by: 'user_9' })
  })

  it('rejects an empty label without touching the database', async () => {
    const stub = makeClient()
    await expect(createMcpKey(stub.client, '   ')).rejects.toThrow(/label/i)
    expect(stub.from).not.toHaveBeenCalled()
  })

  it('throws when the insert errors', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: null, error: { message: 'insert failed' } })
    await expect(createMcpKey(stub.client, 'x')).rejects.toThrow(/insert failed/)
  })
})

describe('revokeMcpKey', () => {
  it('sets revoked_at on the target key and returns the updated summary', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: { ...ROW, revoked_at: '2026-07-21T10:00:00Z' }, error: null })

    const summary = await revokeMcpKey(stub.client, 'key_1')

    expect(stub.from).toHaveBeenCalledWith('mcp_api_keys')
    expect(stub.updatePayloads[0].revoked_at).toEqual(expect.any(String))
    expect(stub.builder.eq).toHaveBeenCalledWith('id', 'key_1')
    expect(summary.revokedAt).toBe('2026-07-21T10:00:00Z')
  })

  it('throws when the update errors', async () => {
    const stub = makeClient()
    stub.singleQueue.push({ data: null, error: { message: 'nope' } })
    await expect(revokeMcpKey(stub.client, 'key_1')).rejects.toThrow(/nope/)
  })
})
