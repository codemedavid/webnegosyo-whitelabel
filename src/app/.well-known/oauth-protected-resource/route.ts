import { getOrigin, OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'
import { buildProtectedResourceMetadata } from '@/lib/mcp/oauth-metadata'

// RFC 9728 — OAuth 2.0 Protected Resource Metadata. Tells an MCP client which
// authorization server protects the MCP endpoint so it can start the OAuth flow.
//
// Also served from `[...path]/route.ts` so the RFC 9728 §3.1 path-suffixed form
// (`/.well-known/oauth-protected-resource/api/mcp/mcp`) resolves — clients that
// build that URL themselves used to get a 404 and fail to connect.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request): Response {
  return Response.json(buildProtectedResourceMetadata(getOrigin(req)), { headers: OAUTH_CORS_HEADERS })
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}
