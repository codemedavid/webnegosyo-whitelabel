/**
 * Some MCP clients probe merchant OAuth discovery on the MCP resource URL.
 * Next.js only serves `.well-known` from the app root, so merchant probes are
 * rewritten onto the remaining local authorization server documents.
 */

const MERCHANT_MCP_PATH_WELL_KNOWN =
  /^\/api\/mcp\/merchant(?:\/mcp)?\/\.well-known\/(oauth-authorization-server|openid-configuration|oauth-protected-resource|jwks\.json)(\/.*)?$/

export function rewriteMcpPathWellKnown(pathname: string): string | null {
  const match = pathname.match(MERCHANT_MCP_PATH_WELL_KNOWN)
  if (!match) return null
  const document = match[1]
  if (document === 'oauth-protected-resource') {
    return '/.well-known/oauth-protected-resource/api/mcp/merchant'
  }
  if (document === 'jwks.json') return '/.well-known/jwks.json'
  return `/.well-known/${document}`
}
