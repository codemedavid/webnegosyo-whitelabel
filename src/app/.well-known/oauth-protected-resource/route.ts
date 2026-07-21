import { getOrigin, OAUTH_PATHS, OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'

// RFC 9728 — OAuth 2.0 Protected Resource Metadata. Tells an MCP client which
// authorization server protects the MCP endpoint so it can start the OAuth flow.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request): Response {
  const origin = getOrigin(req)
  return Response.json(
    {
      resource: `${origin}${OAUTH_PATHS.mcp}`,
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
      scopes_supported: ['superadmin'],
    },
    { headers: OAUTH_CORS_HEADERS },
  )
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}
