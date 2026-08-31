import { getJwtSecret, OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'
import { buildJwks } from '@/lib/mcp/oauth-jwt'

// RFC 7517 JWKS so MCP clients (Grok, ChatGPT) can verify EdDSA access tokens
// without sharing the signing secret. Derived from MCP_OAUTH_JWT_SECRET.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(): Response {
  try {
    return Response.json(buildJwks(getJwtSecret()), { headers: OAUTH_CORS_HEADERS })
  } catch {
    return Response.json(
      { error: 'server_error', error_description: 'MCP_OAUTH_JWT_SECRET is not configured' },
      { status: 500, headers: OAUTH_CORS_HEADERS },
    )
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}
