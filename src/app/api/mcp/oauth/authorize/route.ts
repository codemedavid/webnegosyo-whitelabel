import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAllowedRedirectUri, issueAuthorizationCode, type PkceMethod } from '@/lib/mcp/oauth-service'
import {
  AUTH_CODE_TTL_SECONDS,
  OAUTH_OFFLINE_SCOPE,
  OAUTH_PATHS,
  OAUTH_SCOPE,
  getOrigin,
} from '@/lib/mcp/oauth-config'

// OAuth 2.1 authorization endpoint. The human-login gate: it verifies the
// caller has a superadmin browser session (bouncing through /superadmin/login
// if not), then mints a PKCE-bound authorization code and redirects back to the
// connector. Logging in AS superadmin is the consent.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RegisteredClientRow {
  client_id: string
  redirect_uris: string[]
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const params = url.searchParams

  const responseType = params.get('response_type')
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const codeChallenge = params.get('code_challenge')
  const codeChallengeMethod = (params.get('code_challenge_method') ?? 'S256') as PkceMethod
  const state = params.get('state')
  const scope = params.get('scope') ?? OAUTH_SCOPE
  const resource = params.get('resource')

  // MCP OAuth tables aren't in the generated Database type; use an untyped view
  // (same convention as the MCP key service).
  const admin = createAdminClient() as unknown as SupabaseClient

  // Validate the client + redirect_uri BEFORE trusting the redirect target.
  if (!clientId) {
    return badRequest('invalid_request', 'client_id is required')
  }
  const { data: clientRow } = await admin
    .from('mcp_oauth_clients')
    .select('client_id, redirect_uris')
    .eq('client_id', clientId)
    .maybeSingle()
  const client = clientRow as RegisteredClientRow | null
  if (!client) {
    return badRequest('invalid_client', 'Unknown client_id')
  }
  if (!redirectUri || !isAllowedRedirectUri(redirectUri, client.redirect_uris)) {
    return badRequest('invalid_request', 'redirect_uri does not match a registered value')
  }

  // From here, errors are delivered to the (validated) redirect_uri per spec.
  if (responseType !== 'code') {
    return redirectError(redirectUri, 'unsupported_response_type', 'Only response_type=code is supported', state)
  }
  if (!codeChallenge) {
    return redirectError(redirectUri, 'invalid_request', 'code_challenge (PKCE) is required', state)
  }
  if (codeChallengeMethod !== 'S256' && codeChallengeMethod !== 'plain') {
    return redirectError(redirectUri, 'invalid_request', 'Unsupported code_challenge_method', state)
  }
  const expectedResource = `${getOrigin(req)}${OAUTH_PATHS.mcp}`
  if (resource && resource !== expectedResource) {
    return redirectError(redirectUri, 'invalid_target', 'resource does not match the SmartMenu MCP endpoint', state)
  }
  const requestedScopes = scope.split(/\s+/).filter(Boolean)
  const supportedScopes = new Set([OAUTH_SCOPE, OAUTH_OFFLINE_SCOPE])
  if (!requestedScopes.includes(OAUTH_SCOPE) || requestedScopes.some((item) => !supportedScopes.has(item))) {
    return redirectError(redirectUri, 'invalid_scope', 'Unsupported or missing OAuth scope', state)
  }

  // Human-login gate: require a superadmin cookie session.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isSuperadmin = false
  if (user) {
    const { data: roleRow } = await supabase
      .from('app_users')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    isSuperadmin = (roleRow as { role: string } | null)?.role === 'superadmin'
  }

  if (!user || !isSuperadmin) {
    // Send the operator to log in, then return to this exact authorize request.
    const returnTo = `${url.pathname}${url.search}`
    const loginUrl = new URL('/superadmin/login', url.origin)
    loginUrl.searchParams.set('redirect', returnTo)
    if (user && !isSuperadmin) loginUrl.searchParams.set('unauthorized', '1')
    return Response.redirect(loginUrl.toString(), 302)
  }

  // Authorized — issue a single-use code and hand control back to the connector.
  try {
    const code = await issueAuthorizationCode(
      admin,
      {
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope,
        userId: user.id,
      },
      { ttlSeconds: AUTH_CODE_TTL_SECONDS },
    )

    const target = new URL(redirectUri)
    target.searchParams.set('code', code)
    if (state) target.searchParams.set('state', state)
    return Response.redirect(target.toString(), 302)
  } catch {
    return redirectError(redirectUri, 'server_error', 'Failed to issue authorization code', state)
  }
}

function badRequest(error: string, description: string): Response {
  return Response.json({ error, error_description: description }, { status: 400 })
}

function redirectError(redirectUri: string, error: string, description: string, state: string | null): Response {
  const target = new URL(redirectUri)
  target.searchParams.set('error', error)
  target.searchParams.set('error_description', description)
  if (state) target.searchParams.set('state', state)
  return Response.redirect(target.toString(), 302)
}
