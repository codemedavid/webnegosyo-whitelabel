import { createAdminClient } from '@/lib/supabase/admin'
import { registerClient } from '@/lib/mcp/oauth-service'
import { OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'

// RFC 7591 — OAuth 2.0 Dynamic Client Registration. Claude/ChatGPT POST their
// name + redirect URIs here and receive a client_id. Public clients (PKCE, no
// secret), so this is intentionally unauthenticated per the MCP OAuth profile.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RegistrationBody {
  client_name?: string
  redirect_uris?: unknown
}

export async function POST(req: Request): Promise<Response> {
  let body: RegistrationBody
  try {
    body = (await req.json()) as RegistrationBody
  } catch {
    return oauthError('invalid_client_metadata', 'Request body must be JSON', 400)
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === 'string')
    : []

  if (redirectUris.length === 0) {
    return oauthError('invalid_client_metadata', 'At least one redirect_uri is required', 400)
  }

  try {
    const client = await registerClient(createAdminClient(), {
      client_name: typeof body.client_name === 'string' ? body.client_name : 'MCP Client',
      redirect_uris: redirectUris,
    })

    return Response.json(
      {
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      { status: 201, headers: OAUTH_CORS_HEADERS },
    )
  } catch (error) {
    return oauthError('invalid_client_metadata', error instanceof Error ? error.message : 'Registration failed', 400)
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}

function oauthError(error: string, description: string, status: number): Response {
  return Response.json({ error, error_description: description }, { status, headers: OAUTH_CORS_HEADERS })
}
