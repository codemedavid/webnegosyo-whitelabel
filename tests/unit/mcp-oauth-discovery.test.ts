/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, it, expect } from '@jest/globals'
import { GET as protectedResourceRootGET } from '@/app/.well-known/oauth-protected-resource/route'
import { GET as protectedResourceNestedGET } from '@/app/.well-known/oauth-protected-resource/[...path]/route'
import { GET as authServerRootGET } from '@/app/.well-known/oauth-authorization-server/route'
import { GET as authServerNestedGET } from '@/app/.well-known/oauth-authorization-server/[...path]/route'
import { GET as openidRootGET } from '@/app/.well-known/openid-configuration/route'
import { GET as openidNestedGET } from '@/app/.well-known/openid-configuration/[...path]/route'
import { GET as merchantProtectedResourceGET } from '@/app/.well-known/oauth-protected-resource/[...path]/route'
import { rewriteMcpPathWellKnown } from '@/lib/mcp/mcp-path-well-known'

function req(url: string): Request {
  return { url, headers: new Headers() } as unknown as Request
}

const ORIGIN = 'https://x.example.com'
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co/'
})

afterAll(() => {
  if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
})

// RFC 9728 §3.1 / RFC 8414 §3.1: a client holding the resource URL
// `https://host/api/mcp/mcp` builds the metadata URL by inserting the
// well-known segment BETWEEN host and path — it does not strip the path.
// Clients that construct this URL themselves (ChatGPT, MCP Inspector, the
// MCP SDKs) 404 if only the root path is served, and the connection fails.

describe('protected-resource metadata discovery (RFC 9728 §3.1)', () => {
  it('serves the same metadata at the path-suffixed URL as at the root URL', async () => {
    const rootBody = await (await protectedResourceRootGET(req(`${ORIGIN}/.well-known/oauth-protected-resource`))).json()
    const nestedBody = await (
      await protectedResourceNestedGET(req(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp/mcp`))
    ).json()

    expect(nestedBody).toEqual(rootBody)
    expect(nestedBody.resource).toBe(`${ORIGIN}/api/mcp/mcp`)
    expect(nestedBody.authorization_servers).toEqual(['https://project.supabase.co/auth/v1'])
    expect(nestedBody.scopes_supported).toBeUndefined()
  })
})

describe('authorization-server metadata discovery (RFC 8414 §3.1)', () => {
  it('serves the merchant issuer at the merchant path-suffixed URL', async () => {
    const rootBody = await (await authServerRootGET(req(`${ORIGIN}/.well-known/oauth-authorization-server`))).json()
    const nestedBody = await (
      await authServerNestedGET(req(`${ORIGIN}/.well-known/oauth-authorization-server/api/mcp/merchant/mcp`))
    ).json()

    expect(nestedBody).toEqual(rootBody)
    expect(nestedBody.issuer).toBe(ORIGIN)
    expect(nestedBody.token_endpoint).toBe(`${ORIGIN}/api/mcp/oauth/token`)
    expect(nestedBody.scopes_supported).toEqual(['tenant_admin', 'offline_access'])
  })

  it('rejects the retired superadmin path suffix', async () => {
    const response = await authServerNestedGET(
      req(`${ORIGIN}/.well-known/oauth-authorization-server/api/mcp/mcp`),
    )

    expect(response.status).toBe(404)
  })
})

describe('OpenID Connect discovery fallback', () => {
  // Several MCP clients probe /.well-known/openid-configuration before, or
  // instead of, the OAuth-specific document. Serving the same metadata there
  // costs nothing and removes a whole class of "couldn't connect" failures.
  it('serves the merchant authorization-server metadata at root and merchant OIDC URLs', async () => {
    const asBody = await (await authServerRootGET(req(`${ORIGIN}/.well-known/oauth-authorization-server`))).json()
    const oidcRoot = await (await openidRootGET(req(`${ORIGIN}/.well-known/openid-configuration`))).json()
    const oidcNested = await (
      await openidNestedGET(req(`${ORIGIN}/.well-known/openid-configuration/api/mcp/merchant/mcp`))
    ).json()

    expect(oidcRoot).toEqual(asBody)
    expect(oidcNested).toEqual(asBody)
  })

  it('rejects the retired superadmin path suffix', async () => {
    const response = await openidNestedGET(
      req(`${ORIGIN}/.well-known/openid-configuration/api/mcp/mcp`),
    )

    expect(response.status).toBe(404)
  })
})

// Some MCP clients probe well-known documents on the resource URL. The local
// compatibility rewrites now apply only to the merchant resource; superadmin
// discovery is owned by the protected-resource document and Supabase issuer.
describe('well-known probes on MCP resource URLs', () => {
  it('no longer rewrites superadmin MCP-path authorization-server or JWKS probes', () => {
    expect(rewriteMcpPathWellKnown('/api/mcp/mcp/.well-known/oauth-authorization-server')).toBeNull()
    expect(rewriteMcpPathWellKnown('/api/mcp/mcp/.well-known/jwks.json')).toBeNull()
  })

  it('preserves merchant MCP-path discovery rewrites', () => {
    expect(rewriteMcpPathWellKnown('/api/mcp/merchant/mcp/.well-known/oauth-authorization-server'))
      .toBe('/.well-known/oauth-authorization-server')
  })

  it('rewrites merchant MCP well-known PRM onto the merchant resource document', async () => {
    const destination = rewriteMcpPathWellKnown(
      '/api/mcp/merchant/mcp/.well-known/oauth-protected-resource',
    )
    expect(destination).toBe('/.well-known/oauth-protected-resource/api/mcp/merchant')

    const body = await (await merchantProtectedResourceGET(req(`${ORIGIN}${destination}`))).json()
    expect(body.resource).toBe(`${ORIGIN}/api/mcp/merchant/mcp`)
    expect(body.scopes_supported).toEqual(['tenant_admin'])
  })

  it('still serves merchant PRM when the handler sees ChatGPT\'s original MCP-path URL', async () => {
    const originalProbe = `${ORIGIN}/api/mcp/merchant/mcp/.well-known/oauth-protected-resource`
    const body = await (await merchantProtectedResourceGET(req(originalProbe))).json()
    expect(body.resource).toBe(`${ORIGIN}/api/mcp/merchant/mcp`)
    expect(body.scopes_supported).toEqual(['tenant_admin'])
  })

  it('does not rewrite the MCP transport or OAuth endpoints', () => {
    expect(rewriteMcpPathWellKnown('/api/mcp/mcp')).toBeNull()
    expect(rewriteMcpPathWellKnown('/api/mcp/oauth/authorize')).toBeNull()
  })
})
