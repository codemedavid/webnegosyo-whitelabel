/**
 * Configuration for the MERCHANT-side MCP resource.
 *
 * The merchant MCP shares the superadmin server's OAuth machinery but is a
 * distinct protected resource: its credentials carry the `tenant_admin` scope
 * and are pinned to one tenant. Per RFC 9728, a resource that does not live at
 * the origin root advertises its metadata at a path-suffixed well-known URL —
 * clients (ChatGPT, MCP Inspector) build that URL themselves from the resource
 * path, so it must match `/api/mcp/merchant` exactly.
 */

/** Scope granted to merchant credentials — authority over exactly one tenant. */
export const MERCHANT_OAUTH_SCOPE = 'tenant_admin'

export const MERCHANT_OAUTH_PATHS = {
  mcp: '/api/mcp/merchant/mcp',
  protectedResourceMetadata: '/.well-known/oauth-protected-resource/api/mcp/merchant',
} as const
