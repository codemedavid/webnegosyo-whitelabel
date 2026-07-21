import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock verifyMcpKey so the adapter's mapping is tested in isolation. Keep the
// real MCP_KEY_PREFIX so the adapter's legacy-vs-JWT discrimination still works.
jest.mock('@/lib/mcp-auth', () => ({
  __esModule: true,
  MCP_KEY_PREFIX: 'smk_live_',
  verifyMcpKey: jest.fn(),
}))

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { verifyMcpKey } = jest.requireMock('@/lib/mcp-auth') as any
const { createMcpTokenVerifier } = require('@/lib/mcp/auth-adapter')
const { signAccessToken } = require('@/lib/mcp/oauth-jwt')
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

const client = {} as never
// The adapter ignores req; use a dummy (jsdom lacks a global Request).
const req = {} as Request
const JWT_SECRET = 'adapter-test-secret-0123456789'
const NOW = 1_700_000_000_000

beforeEach(() => {
  verifyMcpKey.mockReset()
})

describe('createMcpTokenVerifier', () => {
  it('maps a valid key to an AuthInfo with clientId=keyId and its scopes', async () => {
    verifyMcpKey.mockResolvedValue({ keyId: 'key_1', scopes: ['superadmin'] })
    const verify = createMcpTokenVerifier(client)

    const auth = await verify(req, 'smk_live_valid')

    expect(auth).toMatchObject({ token: 'smk_live_valid', clientId: 'key_1', scopes: ['superadmin'] })
    // verifyMcpKey must be handed a Bearer header reconstructed from the token
    expect(verifyMcpKey).toHaveBeenCalledWith('Bearer smk_live_valid', client)
  })

  it('returns undefined (→ 401) when the key is invalid or revoked', async () => {
    verifyMcpKey.mockRejectedValue(new Error('unauthorized'))
    const verify = createMcpTokenVerifier(client)

    await expect(verify(req, 'smk_live_bad')).resolves.toBeUndefined()
  })

  it('returns undefined when no bearer token is supplied', async () => {
    const verify = createMcpTokenVerifier(client)
    await expect(verify(req, undefined)).resolves.toBeUndefined()
    expect(verifyMcpKey).not.toHaveBeenCalled()
  })

  it('accepts a valid OAuth JWT without consulting the legacy key store', async () => {
    const token = signAccessToken(
      { sub: 'user_1', scope: 'superadmin', client_id: 'mcpc_abc' },
      { secret: JWT_SECRET, expiresInSeconds: 3600, now: NOW },
    )
    const verify = createMcpTokenVerifier(client, { jwtSecret: JWT_SECRET, now: () => NOW })

    const auth = await verify(req, token)

    expect(auth).toMatchObject({ token, clientId: 'mcpc_abc', scopes: ['superadmin'] })
    // JWTs are self-contained — the legacy key lookup must not run
    expect(verifyMcpKey).not.toHaveBeenCalled()
  })

  it('returns undefined for an expired OAuth JWT', async () => {
    const token = signAccessToken(
      { sub: 'user_1', scope: 'superadmin', client_id: 'mcpc_abc' },
      { secret: JWT_SECRET, expiresInSeconds: 60, now: NOW },
    )
    const verify = createMcpTokenVerifier(client, { jwtSecret: JWT_SECRET, now: () => NOW + 61_000 })
    await expect(verify(req, token)).resolves.toBeUndefined()
  })

  it('returns undefined for a JWT signed with the wrong secret', async () => {
    const token = signAccessToken(
      { sub: 'user_1', scope: 'superadmin', client_id: 'mcpc_abc' },
      { secret: 'wrong-secret', expiresInSeconds: 3600, now: NOW },
    )
    const verify = createMcpTokenVerifier(client, { jwtSecret: JWT_SECRET, now: () => NOW })
    await expect(verify(req, token)).resolves.toBeUndefined()
  })

  it('still routes an smk_live_ key to the legacy verifier even when a jwt secret is set', async () => {
    verifyMcpKey.mockResolvedValue({ keyId: 'key_9', scopes: ['superadmin'] })
    const verify = createMcpTokenVerifier(client, { jwtSecret: JWT_SECRET, now: () => NOW })

    const auth = await verify(req, 'smk_live_legacy')

    expect(auth).toMatchObject({ clientId: 'key_9' })
    expect(verifyMcpKey).toHaveBeenCalledWith('Bearer smk_live_legacy', client)
  })
})
