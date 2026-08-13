import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// OAuth and manually-created credentials intentionally share one verifier.
jest.mock('@/lib/mcp-auth', () => ({
  __esModule: true,
  hashApiKey: (value: string) => `fingerprint-${value.length}`,
  verifyMcpKey: jest.fn(),
}))

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { verifyMcpKey } = jest.requireMock('@/lib/mcp-auth') as any
const { createMcpTokenVerifier } = require('@/lib/mcp/auth-adapter')
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
})
