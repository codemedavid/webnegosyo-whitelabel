/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals'
import { withSmartMenuAuth } from '@/lib/mcp/request-auth'

const metadataPath = '/.well-known/oauth-protected-resource'

function jsonRpcRequest(method: string, extra: Record<string, unknown> = {}): Request {
  return new Request('https://example.com/api/mcp/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...extra }),
  })
}

describe('withSmartMenuAuth', () => {
  it('allows an anonymous MCP handshake when transport authentication is optional', async () => {
    const handler = jest.fn(async () => Response.json({ ok: true }))
    const verify = jest.fn(async () => undefined)
    const wrapped = withSmartMenuAuth(handler, verify, {
      resourceMetadataPath: metadataPath,
      required: false,
    })

    const response = await wrapped(jsonRpcRequest('initialize'), {})

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(verify).not.toHaveBeenCalled()
  })

  it('allows anonymous tools/list so clients can discover OAuth-advertised tools', async () => {
    const handler = jest.fn(async (req: Request) => {
      const body = await req.json()
      return Response.json({ echoed: body.method })
    })
    const wrapped = withSmartMenuAuth(handler, async () => undefined, {
      resourceMetadataPath: metadataPath,
      required: false,
    })

    const response = await wrapped(jsonRpcRequest('tools/list'), {})

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ echoed: 'tools/list' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('returns HTTP 401 with WWW-Authenticate on anonymous tools/call so clients can start OAuth', async () => {
    const handler = jest.fn(async () => new Response('unexpected'))
    const wrapped = withSmartMenuAuth(handler, async () => undefined, {
      resourceMetadataPath: metadataPath,
      required: false,
      requiredScope: 'superadmin',
    })

    const response = await wrapped(
      jsonRpcRequest('tools/call', { params: { name: 'list_tenants', arguments: {} } }),
      {},
    )

    expect(response.status).toBe(401)
    const challenge = response.headers.get('WWW-Authenticate')
    expect(challenge).toContain(
      'resource_metadata="https://example.com/.well-known/oauth-protected-resource"',
    )
    expect(challenge).toContain('error="invalid_token"')
    expect(challenge).toContain('scope="superadmin"')
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns HTTP 401 with WWW-Authenticate on anonymous GET probes of the MCP endpoint', async () => {
    const handler = jest.fn(async () => new Response('unexpected'))
    const wrapped = withSmartMenuAuth(handler, async () => undefined, {
      resourceMetadataPath: metadataPath,
      required: false,
    })

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp'), {})

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata=')
    expect(handler).not.toHaveBeenCalled()
  })

  it('allows an anonymous ping during the MCP handshake', async () => {
    const handler = jest.fn(async () => Response.json({ ok: true }))
    const wrapped = withSmartMenuAuth(handler, async () => undefined, {
      resourceMetadataPath: metadataPath,
      required: false,
    })

    const response = await wrapped(jsonRpcRequest('ping'), {})

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('challenges anonymous DELETE session probes instead of forwarding them', async () => {
    const handler = jest.fn(async () => new Response('unexpected'))
    const wrapped = withSmartMenuAuth(handler, async () => undefined, {
      resourceMetadataPath: metadataPath,
      required: false,
    })

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp', { method: 'DELETE' }), {})

    expect(response.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
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
    expect(response.headers.get('WWW-Authenticate')).toContain('scope="superadmin"')
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
