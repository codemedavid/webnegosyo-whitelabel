import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// OAuth and manually-created credentials intentionally share one verifier.
jest.mock('@/lib/mcp-auth', () => ({
  __esModule: true,
  hashApiKey: (value: string) => `fingerprint-${value.length}`,
  verifyMcpKey: jest.fn(),
  MCP_KEY_PREFIX: 'smk_live_',
  MCP_OAUTH_KEY_PREFIX: 'smk_oauth_',
}))

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { verifyMcpKey } = jest.requireMock('@/lib/mcp-auth') as any
const { createMcpTokenVerifier } = require('@/lib/mcp/auth-adapter')
const { signAccessToken } = require('@/lib/mcp/oauth-jwt') as typeof import('@/lib/mcp/oauth-jwt')
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const client = {} as never
const req = {
  url: 'https://www.webnegosyo.com/api/mcp/mcp',
  headers: new Headers({ host: 'www.webnegosyo.com' }),
} as unknown as Request

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
    expect(verifyMcpKey).toHaveBeenCalledWith('Bearer smk_live_valid', client, { now: expect.any(Function) })
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

  it('accepts an opaque OAuth access token through the shared key store', async () => {
    const token = 'smk_oauth_future_random'
    verifyMcpKey.mockResolvedValue({ keyId: 'oauth_key_1', scopes: ['superadmin'] })
    const verify = createMcpTokenVerifier(client)

    const auth = await verify(req, token)

    expect(auth).toMatchObject({ token, clientId: 'oauth_key_1', scopes: ['superadmin'] })
    expect(verifyMcpKey).toHaveBeenCalledWith(`Bearer ${token}`, client, { now: expect.any(Function) })
  })

  it('returns undefined when the shared key store rejects an OAuth token', async () => {
    verifyMcpKey.mockRejectedValue(new Error('expired'))
    const verify = createMcpTokenVerifier(client)
    const token = 'smk_oauth_expired_random'
    await expect(verify(req, token)).resolves.toBeUndefined()
  })

  it('accepts an HS256 JWT access token without hitting the key store', async () => {
    const secret = 'adapter-jwt-secret-0123456789'
    const token = signAccessToken(
      {
        sub: 'user_1',
        scope: 'superadmin',
        client_id: 'client_1',
        aud: 'https://www.webnegosyo.com/api/mcp/mcp',
        iss: 'https://www.webnegosyo.com',
      },
      { secret, expiresInSeconds: 3600, now: 1_700_000_000_000 },
    )
    const verify = createMcpTokenVerifier(client, { jwtSecret: secret, now: () => 1_700_000_000_000 })

    const auth = await verify(req, token)

    expect(auth).toMatchObject({ clientId: 'client_1', scopes: ['superadmin'] })
    expect(verifyMcpKey).not.toHaveBeenCalled()
  })
})
