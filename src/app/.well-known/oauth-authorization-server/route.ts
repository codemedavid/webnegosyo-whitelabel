import { getOrigin, OAUTH_PATHS, OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'

// RFC 8414 — OAuth 2.0 Authorization Server Metadata. Advertises the endpoints
// (authorize/token/register), supported grants, and PKCE so Claude/ChatGPT can
// self-configure and run the "automatic login" flow without a copy-pasted key.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request): Response {
  const origin = getOrigin(req)
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}${OAUTH_PATHS.authorize}`,
      token_endpoint: `${origin}${OAUTH_PATHS.token}`,
      registration_endpoint: `${origin}${OAUTH_PATHS.register}`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['superadmin'],
    },
    { headers: OAUTH_CORS_HEADERS },
  )
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}
