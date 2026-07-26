import { getOrigin, OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'
import { buildAuthorizationServerMetadata } from '@/lib/mcp/oauth-metadata'

// RFC 8414 — OAuth 2.0 Authorization Server Metadata. Advertises the endpoints
// (authorize/token/register), supported grants, and PKCE so Claude/ChatGPT can
// self-configure and run the "automatic login" flow without a copy-pasted key.
//
// Also served from `[...path]/route.ts` (RFC 8414 §3.1 path-suffixed form) and
// from `/.well-known/openid-configuration`, which some clients probe first.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request): Response {
  return Response.json(buildAuthorizationServerMetadata(getOrigin(req)), { headers: OAUTH_CORS_HEADERS })
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}
