/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals'
import { getOrigin } from '@/lib/mcp/oauth-config'
import { GET as protectedResourceGET } from '@/app/.well-known/oauth-protected-resource/route'
import { GET as authServerGET } from '@/app/.well-known/oauth-authorization-server/route'

function reqWithHeaders(url: string, headers: Record<string, string> = {}): Request {
  return { url, headers: new Headers(headers) } as unknown as Request
}

describe('getOrigin', () => {
  it('honors x-forwarded-host and x-forwarded-proto (Vercel proxy)', () => {
    const req = reqWithHeaders('http://internal/whatever', {
      'x-forwarded-host': 'menu.example.com',
      'x-forwarded-proto': 'https',
    })
    expect(getOrigin(req)).toBe('https://menu.example.com')
  })

  it('falls back to the request URL host when no forwarding headers are present', () => {
    const req = reqWithHeaders('https://direct.example.com/x')
    expect(getOrigin(req)).toBe('https://direct.example.com')
  })
})

describe('protected-resource metadata', () => {
  it('points the MCP endpoint at the same-origin authorization server', async () => {
    const res = await protectedResourceGET(reqWithHeaders('https://x.example.com/.well-known/oauth-protected-resource'))
    const body = await res.json()
    expect(body.resource).toBe('https://x.example.com/api/mcp/mcp')
    expect(body.authorization_servers).toEqual(['https://x.example.com'])
  })
})

describe('authorization-server metadata', () => {
  it('advertises the endpoints, PKCE S256, and public-client auth', async () => {
    const res = await authServerGET(reqWithHeaders('https://x.example.com/.well-known/oauth-authorization-server'))
    const body = await res.json()
    expect(body.issuer).toBe('https://x.example.com')
    expect(body.authorization_endpoint).toBe('https://x.example.com/api/mcp/oauth/authorize')
    expect(body.token_endpoint).toBe('https://x.example.com/api/mcp/oauth/token')
    expect(body.registration_endpoint).toBe('https://x.example.com/api/mcp/oauth/register')
    expect(body.code_challenge_methods_supported).toContain('S256')
    expect(body.grant_types_supported).toEqual(expect.arrayContaining(['authorization_code', 'refresh_token']))
    expect(body.token_endpoint_auth_methods_supported).toContain('none')
    expect(body.scopes_supported).toEqual(expect.arrayContaining(['superadmin', 'offline_access']))
  })
})
