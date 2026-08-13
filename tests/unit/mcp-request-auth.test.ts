/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals'
import { withSmartMenuAuth } from '@/lib/mcp/request-auth'

const metadataPath = '/.well-known/oauth-protected-resource'

describe('withSmartMenuAuth', () => {
  it('allows an anonymous MCP handshake when transport authentication is optional', async () => {
    const handler = jest.fn(async () => Response.json({ ok: true }))
    const verify = jest.fn(async () => undefined)
    const wrapped = withSmartMenuAuth(handler, verify, {
      resourceMetadataPath: metadataPath,
      required: false,
    })

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp'), {})

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(verify).not.toHaveBeenCalled()
  })

  it.each(['Bearer token-value', 'bearer   token-value', 'BEARER\ttoken-value'])(
    'accepts RFC-compatible authorization header %s',
    async (authorization) => {
      const handler = jest.fn(async () => Response.json({ ok: true }))
      const verify = jest.fn(async (_req: Request, token?: string) =>
        token === 'token-value'
          ? { token, clientId: 'client_1', scopes: ['superadmin'] }
          : undefined,
      )
      const wrapped = withSmartMenuAuth(handler, verify, { resourceMetadataPath: metadataPath })

      const response = await wrapped(new Request('https://example.com/api/mcp/mcp', {
        headers: { authorization },
      }), {})

      expect(response.status).toBe(200)
      expect(verify).toHaveBeenCalledWith(expect.any(Request), 'token-value')
      expect(handler).toHaveBeenCalledTimes(1)
    },
  )

  it('returns a discoverable 401 when the credential is missing or invalid', async () => {
    const handler = jest.fn(async () => new Response('unexpected'))
    const wrapped = withSmartMenuAuth(handler, async () => undefined, {
      resourceMetadataPath: metadataPath,
      required: true,
    })

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp'), {})

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain(
      'resource_metadata="https://example.com/.well-known/oauth-protected-resource"',
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects a credential without the required superadmin scope', async () => {
    const wrapped = withSmartMenuAuth(
      async () => new Response('unexpected'),
      async (_req, token) => ({ token: token ?? '', clientId: 'client_1', scopes: ['offline_access'] }),
      { resourceMetadataPath: metadataPath },
    )

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp', {
      headers: { authorization: 'Bearer token-value' },
    }), {})

    expect(response.status).toBe(403)
  })
})
