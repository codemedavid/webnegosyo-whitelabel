import { describe, it, expect, jest } from '@jest/globals'
import {
  hashApiKey,
  extractBearerToken,
  generateApiKey,
  verifyMcpKey,
  MCP_KEY_PREFIX,
} from '@/lib/mcp-auth'

/**
 * Builds a minimal fake of the service-role Supabase client used by verifyMcpKey.
 * verifyMcpKey should query: from('mcp_api_keys').select(...).eq('key_hash', hash).maybeSingle()
 */
function makeSupabaseStub(row: unknown, error: unknown = null) {
  const maybeSingle = jest.fn(async () => ({ data: row, error }))
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  return { client: { from } as never, from, select, eq, maybeSingle }
}

describe('hashApiKey', () => {
  it('produces a stable 64-char hex sha-256 digest', () => {
    const hash = hashApiKey('smk_live_abc123')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hashApiKey('smk_live_abc123')).toBe(hash)
  })

  it('produces different digests for different inputs', () => {
    expect(hashApiKey('a')).not.toBe(hashApiKey('b'))
  })
})

describe('extractBearerToken', () => {
  it('extracts the token from a well-formed Authorization header', () => {
    expect(extractBearerToken('Bearer smk_live_xyz')).toBe('smk_live_xyz')
  })

  it('is case-insensitive on the Bearer scheme', () => {
    expect(extractBearerToken('bearer smk_live_xyz')).toBe('smk_live_xyz')
  })

  it('returns null for a missing header', () => {
    expect(extractBearerToken(null)).toBeNull()
    expect(extractBearerToken(undefined)).toBeNull()
  })

  it('returns null when the scheme is not Bearer', () => {
    expect(extractBearerToken('Basic abc')).toBeNull()
  })

  it('returns null for an empty token', () => {
    expect(extractBearerToken('Bearer ')).toBeNull()
  })
})

describe('generateApiKey', () => {
  it('returns a plaintext key with the smk prefix and a matching hash', () => {
    const { plaintext, hash, prefix } = generateApiKey()
    expect(plaintext.startsWith(MCP_KEY_PREFIX)).toBe(true)
    expect(hash).toBe(hashApiKey(plaintext))
    expect(plaintext.startsWith(prefix)).toBe(true)
  })

  it('returns a unique key on each call', () => {
    expect(generateApiKey().plaintext).not.toBe(generateApiKey().plaintext)
  })
})

describe('verifyMcpKey', () => {
  const activeRow = { id: 'key_1', scopes: ['superadmin'], revoked_at: null }

  it('resolves the key id and scopes for a valid, unrevoked key', async () => {
    const { client, eq } = makeSupabaseStub(activeRow)
    const result = await verifyMcpKey('Bearer smk_live_valid', client)
    expect(result).toEqual({ keyId: 'key_1', scopes: ['superadmin'] })
    // must look the key up by its hash, never by plaintext
    expect(eq).toHaveBeenCalledWith('key_hash', hashApiKey('smk_live_valid'))
  })

  it('throws when no matching key row exists', async () => {
    const { client } = makeSupabaseStub(null)
    await expect(verifyMcpKey('Bearer smk_live_unknown', client)).rejects.toThrow(/unauthorized/i)
  })

  it('throws when the key has been revoked', async () => {
    const { client } = makeSupabaseStub({ ...activeRow, revoked_at: '2026-07-01T00:00:00Z' })
    await expect(verifyMcpKey('Bearer smk_live_revoked', client)).rejects.toThrow(/revoked/i)
  })

  it('throws when the Authorization header is missing or malformed', async () => {
    const { client } = makeSupabaseStub(activeRow)
    await expect(verifyMcpKey(null, client)).rejects.toThrow(/unauthorized/i)
    await expect(verifyMcpKey('Basic nope', client)).rejects.toThrow(/unauthorized/i)
  })

  it('throws when the database lookup errors', async () => {
    const { client } = makeSupabaseStub(null, { message: 'db down' })
    await expect(verifyMcpKey('Bearer smk_live_valid', client)).rejects.toThrow()
  })
})
