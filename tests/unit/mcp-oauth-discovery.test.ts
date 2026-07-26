/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals'
import { GET as protectedResourceRootGET } from '@/app/.well-known/oauth-protected-resource/route'
import { GET as protectedResourceNestedGET } from '@/app/.well-known/oauth-protected-resource/[...path]/route'
import { GET as authServerRootGET } from '@/app/.well-known/oauth-authorization-server/route'
import { GET as authServerNestedGET } from '@/app/.well-known/oauth-authorization-server/[...path]/route'
import { GET as openidRootGET } from '@/app/.well-known/openid-configuration/route'
import { GET as openidNestedGET } from '@/app/.well-known/openid-configuration/[...path]/route'

function req(url: string): Request {
  return { url, headers: new Headers() } as unknown as Request
}

const ORIGIN = 'https://x.example.com'

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
    expect(nestedBody.authorization_servers).toEqual([ORIGIN])
  })
})

describe('authorization-server metadata discovery (RFC 8414 §3.1)', () => {
  it('serves the same metadata at the path-suffixed URL as at the root URL', async () => {
    const rootBody = await (await authServerRootGET(req(`${ORIGIN}/.well-known/oauth-authorization-server`))).json()
    const nestedBody = await (
      await authServerNestedGET(req(`${ORIGIN}/.well-known/oauth-authorization-server/api/mcp/mcp`))
    ).json()

    expect(nestedBody).toEqual(rootBody)
    expect(nestedBody.issuer).toBe(ORIGIN)
    expect(nestedBody.token_endpoint).toBe(`${ORIGIN}/api/mcp/oauth/token`)
  })
})

describe('OpenID Connect discovery fallback', () => {
  // Several MCP clients probe /.well-known/openid-configuration before, or
  // instead of, the OAuth-specific document. Serving the same metadata there
  // costs nothing and removes a whole class of "couldn't connect" failures.
  it('serves the authorization-server metadata at the root and path-suffixed OIDC URLs', async () => {
    const asBody = await (await authServerRootGET(req(`${ORIGIN}/.well-known/oauth-authorization-server`))).json()
    const oidcRoot = await (await openidRootGET(req(`${ORIGIN}/.well-known/openid-configuration`))).json()
    const oidcNested = await (
      await openidNestedGET(req(`${ORIGIN}/.well-known/openid-configuration/api/mcp/mcp`))
    ).json()

    expect(oidcRoot).toEqual(asBody)
    expect(oidcNested).toEqual(asBody)
  })
})
