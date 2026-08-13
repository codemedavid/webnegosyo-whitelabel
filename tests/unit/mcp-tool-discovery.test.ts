/** @jest-environment node */
import { describe, expect, it } from '@jest/globals'
import { withSmartMenuToolSecurity } from '@/lib/mcp/tool-discovery'

describe('withSmartMenuToolSecurity', () => {
  it('adds top-level OAuth securitySchemes to tools in an SSE tools/list response', async () => {
    const payload = {
      jsonrpc: '2.0',
      id: 2,
      result: {
        tools: [{
          name: 'list_tenants',
          inputSchema: { type: 'object' },
          _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['superadmin'] }] },
        }],
      },
    }
    const response = new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    })

    const secured = await withSmartMenuToolSecurity(response)
    const body = await secured.text()
    const data = JSON.parse(body.split('\ndata: ')[1].trim())

    expect(data.result.tools[0].securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['superadmin'] },
    ])
    expect(data.result.tools[0]._meta.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['superadmin'] },
    ])
  })

  it('adds top-level OAuth securitySchemes to a JSON tools/list response', async () => {
    const response = Response.json({
      jsonrpc: '2.0',
      id: 2,
      result: { tools: [{ name: 'get_tenant', inputSchema: { type: 'object' } }] },
    })

    const secured = await withSmartMenuToolSecurity(response)
    const data = await secured.json()

    expect(data.result.tools[0].securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['superadmin'] },
    ])
  })
})
