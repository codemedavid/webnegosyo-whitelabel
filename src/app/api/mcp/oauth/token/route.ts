import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeAuthorizationCode, refreshAccessToken } from '@/lib/mcp/oauth-service'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  OAUTH_CORS_HEADERS,
  getJwtSecret,
} from '@/lib/mcp/oauth-config'

// OAuth 2.1 token endpoint. Exchanges an authorization code (with PKCE verifier)
// or a refresh token for a Bearer access token. Accepts both form-encoded (the
// OAuth default) and JSON bodies.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function readParams(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = (await req.json()) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(json).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]),
    )
  }
  const form = await req.formData()
  const out: Record<string, string> = {}
  for (const [k, v] of form.entries()) out[k] = typeof v === 'string' ? v : ''
  return out
}

export async function POST(req: Request): Promise<Response> {
  let params: Record<string, string>
  try {
    params = await readParams(req)
  } catch {
    return oauthError('invalid_request', 'Unreadable request body', 400)
  }

  let secret: string
  try {
    secret = getJwtSecret()
  } catch {
    return oauthError('server_error', 'OAuth signing secret is not configured', 500)
  }

  const admin = createAdminClient()
  const grantType = params.grant_type

  try {
    if (grantType === 'authorization_code') {
      const tokens = await exchangeAuthorizationCode(
        admin,
        {
          code: params.code ?? '',
          clientId: params.client_id ?? '',
          redirectUri: params.redirect_uri ?? '',
          codeVerifier: params.code_verifier ?? '',
        },
        {
          secret,
          accessTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
          refreshTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
        },
      )
      return tokenResponse(tokens)
    }

    if (grantType === 'refresh_token') {
      const tokens = await refreshAccessToken(
        admin,
        { refreshToken: params.refresh_token ?? '', clientId: params.client_id ?? '' },
        { secret, accessTtlSeconds: ACCESS_TOKEN_TTL_SECONDS },
      )
      return tokenResponse(tokens)
    }

    return oauthError('unsupported_grant_type', `Unsupported grant_type: ${grantType ?? '(none)'}`, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token request failed'
    // Service errors are prefixed with the OAuth error code (e.g. invalid_grant).
    const code = message.startsWith('invalid_grant') ? 'invalid_grant' : 'invalid_request'
    return oauthError(code, message, 400)
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}

function tokenResponse(body: unknown): Response {
  return Response.json(body, {
    headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  })
}

function oauthError(error: string, description: string, status: number): Response {
  return Response.json({ error, error_description: description }, { status, headers: OAUTH_CORS_HEADERS })
}
