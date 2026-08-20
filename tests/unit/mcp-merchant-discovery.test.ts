/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals'
import { GET as protectedResourceRootGET } from '@/app/.well-known/oauth-protected-resource/route'
import { GET as protectedResourceNestedGET } from '@/app/.well-known/oauth-protected-resource/[...path]/route'
import { GET as authServerRootGET } from '@/app/.well-known/oauth-authorization-server/route'

function req(url: string): Request {
  return { url, headers: new Headers() } as unknown as Request
}

const ORIGIN = 'https://x.example.com'

// The deployment now exposes TWO protected resources on one origin:
// the superadmin MCP at /api/mcp/mcp and the merchant MCP at
// /api/mcp/merchant/mcp. RFC 9728 §3.1 clients build the metadata URL by
// inserting the well-known segment between host and resource path, so the
// path suffix now selects WHICH resource document is served.

describe('merchant protected-resource metadata discovery', () => {
  it('serves the merchant document at the merchant path-suffixed URL', async () => {
    const body = await (
      await protectedResourceNestedGET(
        req(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp/merchant/mcp`),
      )
    ).json()

    expect(body.resource).toBe(`${ORIGIN}/api/mcp/merchant/mcp`)
    expect(body.scopes_supported).toEqual(['tenant_admin'])
    expect(body.authorization_servers).toEqual([ORIGIN])
  })

  it('serves the merchant document for the bare merchant resource prefix too', async () => {
    const body = await (
      await protectedResourceNestedGET(
        req(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp/merchant`),
      )
    ).json()

    expect(body.resource).toBe(`${ORIGIN}/api/mcp/merchant/mcp`)
    expect(body.scopes_supported).toEqual(['tenant_admin'])
  })

  it('keeps serving the superadmin document at the superadmin path-suffixed URL', async () => {
    const body = await (
      await protectedResourceNestedGET(
        req(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp/mcp`),
      )
    ).json()

    expect(body.resource).toBe(`${ORIGIN}/api/mcp/mcp`)
    expect(body.scopes_supported).toEqual(['superadmin'])
  })

  it('keeps serving the superadmin document at the root URL (legacy clients)', async () => {
    const body = await (
      await protectedResourceRootGET(req(`${ORIGIN}/.well-known/oauth-protected-resource`))
    ).json()

    expect(body.resource).toBe(`${ORIGIN}/api/mcp/mcp`)
  })
})

describe('authorization-server metadata with two resources', () => {
  it('advertises the tenant_admin scope alongside superadmin', async () => {
    const body = await (
      await authServerRootGET(req(`${ORIGIN}/.well-known/oauth-authorization-server`))
    ).json()

    expect(body.scopes_supported).toContain('superadmin')
    expect(body.scopes_supported).toContain('tenant_admin')
  })
})
