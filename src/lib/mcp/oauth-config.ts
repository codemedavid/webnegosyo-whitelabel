/**
 * Shared configuration + helpers for the SmartMenu MCP OAuth routes. Keeps the
 * route handlers thin: TTLs, the single supported scope, endpoint paths, origin
 * resolution, and secret access all live here.
 */

/** The only scope this AS grants — superadmin authority over the admin API. */
export const OAUTH_SCOPE = 'superadmin'
/** Standard scope ChatGPT requests when refreshable access is advertised. */
export const OAUTH_OFFLINE_SCOPE = 'offline_access'

/** Authorization codes are single-use and short-lived. */
export const AUTH_CODE_TTL_SECONDS = 600
/** Access tokens (stateless JWT) — short so revocation latency stays bounded. */
export const ACCESS_TOKEN_TTL_SECONDS = 3600
/** Refresh tokens — 30 days, revocable in the token store. */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30

export const OAUTH_PATHS = {
  mcp: '/api/mcp/mcp',
  authorize: '/api/mcp/oauth/authorize',
  token: '/api/mcp/oauth/token',
  register: '/api/mcp/oauth/register',
  authorizationServerMetadata: '/.well-known/oauth-authorization-server',
  protectedResourceMetadata: '/.well-known/oauth-protected-resource',
  jwks: '/.well-known/jwks.json',
} as const

/**
 * RFC 6750 / RFC 9728 WWW-Authenticate value. ChatGPT's plugin Authenticate
 * button looks here for a URL it can open; without `authorization_uri` it
 * reports "didn't provide a sign-in link" even when resource_metadata is set.
 */
export function buildBearerChallenge(options: {
  origin: string
  resourceMetadataPath: string
  error: string
  description: string
  scope?: string
}): string {
  const params = [
    `resource_metadata="${options.origin}${options.resourceMetadataPath}"`,
    `authorization_uri="${options.origin}${OAUTH_PATHS.authorize}"`,
    ...(options.scope ? [`scope="${options.scope}"`] : []),
    `error="${options.error}"`,
    `error_description="${options.description}"`,
  ]
  return `Bearer ${params.join(', ')}`
}

/** CORS headers so browser-based connectors can read discovery metadata. */
export const OAUTH_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-protocol-version',
}

/**
 * Resolves the public origin of the request, honoring the reverse proxy headers
 * Vercel sets. Used to build absolute endpoint URLs in discovery metadata.
 */
export function getOrigin(req: Request): string {
  const url = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${proto}://${host}`
}

/** HS256 signing secret for OAuth access tokens. Grok will not attach opaque tokens. */
export function getJwtSecret(): string {
  const secret = process.env.MCP_OAUTH_JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('MCP_OAUTH_JWT_SECRET is not configured')
  }
  return secret
}
