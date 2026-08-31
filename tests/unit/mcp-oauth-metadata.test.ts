/**
 * @jest-environment node
 */
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals'
import { getOrigin, getJwtSecret } from '@/lib/mcp/oauth-config'
import { publicJwkFromSecret } from '@/lib/mcp/oauth-jwt'
import { GET as protectedResourceGET } from '@/app/.well-known/oauth-protected-resource/route'
import { GET as authServerGET } from '@/app/.well-known/oauth-authorization-server/route'
import { GET as jwksGET } from '@/app/.well-known/jwks.json/route'

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

describe('getJwtSecret', () => {
  const original = process.env.MCP_OAUTH_JWT_SECRET

  afterEach(() => {
    if (original === undefined) delete process.env.MCP_OAUTH_JWT_SECRET
    else process.env.MCP_OAUTH_JWT_SECRET = original
  })

  it('throws when the signing secret is missing', () => {
    delete process.env.MCP_OAUTH_JWT_SECRET
    expect(() => getJwtSecret()).toThrow(/MCP_OAUTH_JWT_SECRET/)
  })

  it('returns the configured secret', () => {
    process.env.MCP_OAUTH_JWT_SECRET = 'configured-secret'
    expect(getJwtSecret()).toBe('configured-secret')
  })
})

describe('protected-resource metadata', () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co/'
  })

  afterEach(() => {
    if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
  })

  it('points the MCP endpoint at Supabase Auth without named scopes', async () => {
    const res = await protectedResourceGET(reqWithHeaders('https://x.example.com/.well-known/oauth-protected-resource'))
    const body = await res.json()
    expect(body.resource).toBe('https://x.example.com/api/mcp/mcp')
    expect(body.authorization_servers).toEqual(['https://project.supabase.co/auth/v1'])
    expect(body.scopes_supported).toBeUndefined()
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
    expect(body.jwks_uri).toBe('https://x.example.com/.well-known/jwks.json')
    expect(body.id_token_signing_alg_values_supported).toEqual(['EdDSA'])
  })
})

describe('JWKS', () => {
  const original = process.env.MCP_OAUTH_JWT_SECRET

  afterEach(() => {
    if (original === undefined) delete process.env.MCP_OAUTH_JWT_SECRET
    else process.env.MCP_OAUTH_JWT_SECRET = original
  })

  it('publishes the Ed25519 public key derived from the signing secret', () => {
    process.env.MCP_OAUTH_JWT_SECRET = 'jwks-secret-please-change-0123456789'
    const res = jwksGET()
    expect(res.status).toBe(200)
    return res.json().then((body: { keys: Array<{ kty: string; crv: string; kid: string; x: string }> }) => {
      expect(body.keys).toHaveLength(1)
      expect(body.keys[0]).toEqual(publicJwkFromSecret('jwks-secret-please-change-0123456789'))
      expect(body.keys[0].kty).toBe('OKP')
      expect(body.keys[0].crv).toBe('Ed25519')
    })
  })
})
