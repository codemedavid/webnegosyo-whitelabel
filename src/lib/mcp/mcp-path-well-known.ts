/**
 * ChatGPT (and some other MCP clients) probe OAuth discovery on the MCP
 * resource URL itself, e.g. `/api/mcp/mcp/.well-known/oauth-authorization-server`.
 * Next.js only serves `.well-known` from the app root, so those probes 404
 * unless we rewrite them onto the origin discovery documents.
 */

const MCP_PATH_WELL_KNOWN =
  /^\/api\/mcp(?:\/merchant)?(?:\/mcp)?\/\.well-known\/(oauth-authorization-server|openid-configuration|oauth-protected-resource|jwks\.json)(\/.*)?$/

function isMerchantSuffix(suffix: string): boolean {
  return suffix === '/merchant' || suffix.startsWith('/merchant/') || suffix === '/api/mcp/merchant' || suffix.startsWith('/api/mcp/merchant/')
}

export function rewriteMcpPathWellKnown(pathname: string): string | null {
  const match = pathname.match(MCP_PATH_WELL_KNOWN)
  if (!match) return null

  const document = match[1]
  const suffix = match[2] ?? ''
  const isMerchant = pathname.startsWith('/api/mcp/merchant') || isMerchantSuffix(suffix)
  if (document === 'oauth-protected-resource' && isMerchant) {
    return '/.well-known/oauth-protected-resource/api/mcp/merchant'
  }
  if (document === 'oauth-protected-resource' && suffix) {
    return `/.well-known/oauth-protected-resource${suffix}`
  }
  if (document === 'jwks.json') {
    return '/.well-known/jwks.json'
  }
  return `/.well-known/${document}`
}
