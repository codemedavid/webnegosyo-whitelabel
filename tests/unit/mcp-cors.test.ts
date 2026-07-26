/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals'
import { MCP_CORS_HEADERS, withCorsHeaders, corsPreflightResponse } from '@/lib/mcp/cors'

// The MCP transport endpoint answered OPTIONS with a bare 204 carrying no
// Access-Control-* headers, so any browser-hosted MCP client (MCP Inspector,
// in-browser connector testers) failed preflight before the first JSON-RPC
// message. Discovery metadata already sent CORS; the transport did not.

describe('MCP_CORS_HEADERS', () => {
  it('allows the headers an MCP client actually sends', () => {
    const allowed = MCP_CORS_HEADERS['Access-Control-Allow-Headers'].toLowerCase()
    expect(allowed).toContain('authorization')
    expect(allowed).toContain('content-type')
    expect(allowed).toContain('mcp-protocol-version')
    expect(allowed).toContain('mcp-session-id')
  })

  it('exposes mcp-session-id so the client can read the session it was assigned', () => {
    expect(MCP_CORS_HEADERS['Access-Control-Expose-Headers'].toLowerCase()).toContain('mcp-session-id')
  })

  it('allows the methods the Streamable HTTP transport uses', () => {
    const methods = MCP_CORS_HEADERS['Access-Control-Allow-Methods']
    for (const method of ['GET', 'POST', 'DELETE', 'OPTIONS']) {
      expect(methods).toContain(method)
    }
  })
})

describe('withCorsHeaders', () => {
  it('adds CORS headers while preserving status and existing headers', async () => {
    const original = new Response(JSON.stringify({ ok: true }), {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"', 'Content-Type': 'application/json' },
    })

    const result = withCorsHeaders(original)

    expect(result.status).toBe(401)
    expect(result.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"')
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await result.json()).toEqual({ ok: true })
  })

  it('exposes WWW-Authenticate so a browser client can read the discovery hint on 401', () => {
    const exposed = MCP_CORS_HEADERS['Access-Control-Expose-Headers'].toLowerCase()
    expect(exposed).toContain('www-authenticate')
  })
})

describe('corsPreflightResponse', () => {
  it('answers preflight with 204 and the full CORS header set', () => {
    const res = corsPreflightResponse()
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })
})
