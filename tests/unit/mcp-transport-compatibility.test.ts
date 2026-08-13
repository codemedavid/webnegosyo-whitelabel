/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals'
import { createMcpHandler } from 'mcp-handler'
import { withMcpAcceptCompatibility } from '@/lib/mcp/request-compatibility'

describe('withMcpAcceptCompatibility', () => {
  it('prevents the MCP SDK from returning 406 to a JSON-only initialize request', async () => {
    const intervalSpy = jest.spyOn(global, 'setInterval')
      .mockReturnValue({} as NodeJS.Timeout)
    const sdkHandler = createMcpHandler(
      () => undefined,
      { serverInfo: { name: 'test-mcp', version: '1.0.0' } },
      { basePath: '/api/mcp', disableSse: true },
    )
    const wrapped = withMcpAcceptCompatibility(sdkHandler as never)

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'json-only-client', version: '1.0.0' },
        },
      }),
    }), {})

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    await expect(response.text()).resolves.toContain('"serverInfo":{"name":"test-mcp"')
    intervalSpy.mockRestore()
  })

  it.each([
    ['application/json', 'application/json, text/event-stream'],
    ['*/*', '*/*, application/json, text/event-stream'],
    [undefined, 'application/json, text/event-stream'],
  ])('lets MCP POST clients with Accept %s reach the SDK', async (accept, expected) => {
    const handler = jest.fn(async (request: Request) =>
      Response.json({ accept: request.headers.get('accept') }),
    )
    const wrapped = withMcpAcceptCompatibility(handler)
    const headers = new Headers({ 'content-type': 'application/json' })
    if (accept) headers.set('accept', accept)

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    }), {})

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ accept: expected })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not alter a standards-compliant MCP POST request', async () => {
    const handler = jest.fn(async (request: Request) =>
      Response.json({ accept: request.headers.get('accept') }),
    )
    const wrapped = withMcpAcceptCompatibility(handler)

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp', {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream' },
      body: '{}',
    }), {})

    await expect(response.json()).resolves.toEqual({ accept: 'application/json, text/event-stream' })
  })

  it('preserves credentials and the JSON-RPC body while normalizing headers', async () => {
    const handler = jest.fn(async (request: Request) => Response.json({
      authorization: request.headers.get('authorization'),
      body: await request.json(),
    }))
    const wrapped = withMcpAcceptCompatibility(handler)

    const response = await wrapped(new Request('https://example.com/api/mcp/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    }), {})

    await expect(response.json()).resolves.toEqual({
      authorization: 'Bearer access-token',
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    })
  })

  it('does not alter requests outside MCP transport negotiation', async () => {
    const request = new Request('https://example.com/api/mcp/mcp', {
      method: 'DELETE',
      headers: { accept: 'application/json' },
    })
    const handler = jest.fn(async (received: Request) =>
      Response.json({ sameRequest: received === request, accept: received.headers.get('accept') }),
    )

    const response = await withMcpAcceptCompatibility(handler)(request, {})

    await expect(response.json()).resolves.toEqual({ sameRequest: true, accept: 'application/json' })
  })
})
