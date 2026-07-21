import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock verifyMcpKey so the adapter's mapping is tested in isolation.
jest.mock('@/lib/mcp-auth', () => ({
  __esModule: true,
  verifyMcpKey: jest.fn(),
}))

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { verifyMcpKey } = jest.requireMock('@/lib/mcp-auth') as any
const { createMcpTokenVerifier } = require('@/lib/mcp/auth-adapter')
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

const client = {} as never
// The adapter ignores req; use a dummy (jsdom lacks a global Request).
const req = {} as Request

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
})
