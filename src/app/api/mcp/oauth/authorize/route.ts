import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAllowedRedirectUri, issueAuthorizationCode, type PkceMethod } from '@/lib/mcp/oauth-service'
import {
  AUTH_CODE_TTL_SECONDS,
} from '@/lib/mcp/oauth-config'
import { MERCHANT_OAUTH_PATHS, MERCHANT_OAUTH_SCOPE } from '@/lib/mcp/merchant-config'
import { isSupportedMerchantScope } from '@/lib/mcp/merchant-oauth-rules'
import { isMerchantAuthorized, isTenantMcpEnabled } from '@/lib/mcp/merchant-gate'
import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'
import { resolveSmartMenuSiteOrigin } from '@/lib/mcp/connect-url'
import { beginMerchantConsent, consumeMerchantConsent, consentCookie, readConsentNonce } from '@/lib/mcp/merchant-consent'
import { merchantConsentHtml } from '@/lib/mcp/merchant-consent-page'

// OAuth 2.1 authorization endpoint. The human-login gate: it verifies the
// caller has a merchant Supabase browser session, then shows explicit consent.
// Only a same-origin, single-use approval POST may mint a PKCE-bound code.
// The admin's app_users.tenant_id becomes the authorization code's tenant pin.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RegisteredClientRow {
  client_id: string
  client_name: string
  redirect_uris: string[]
}


export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const origin = trustedOrigin()
  if (url.origin !== origin) {
    return Response.redirect(new URL(`${url.pathname}${url.search}`, origin), 302)
  }
  return authorize(req)
}

function trustedOrigin(): string {
  return resolveSmartMenuSiteOrigin({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    PLATFORM_ROOT_DOMAIN: process.env.PLATFORM_ROOT_DOMAIN,
  })
}

export async function POST(req: Request): Promise<Response> {
  if (req.headers.get('origin') !== trustedOrigin()) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  return authorize(req)
}

async function authorize(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const params = url.searchParams

  const responseType = params.get('response_type')
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const codeChallenge = params.get('code_challenge')
  const codeChallengeMethod = (params.get('code_challenge_method') ?? 'S256') as PkceMethod
  const state = params.get('state')
  const scope = params.get('scope') ?? MERCHANT_OAUTH_SCOPE
  const resource = params.get('resource')

  // MCP OAuth tables aren't in the generated Database type; use an untyped view
  // (same convention as the MCP key service).
  const admin = createAdminClient() as unknown as SupabaseClient

  // Validate the client + redirect_uri BEFORE trusting the redirect target.
  if (!clientId) {
    return badRequest('invalid_request', 'client_id is required')
  }
  const { data: clientRow, error: clientLookupError } = await admin
    .from('mcp_oauth_clients')
    .select('client_id, client_name, redirect_uris')
    .eq('client_id', clientId)
    .maybeSingle()
  if (clientLookupError) {
    console.error('[SmartMenu OAuth] client lookup failed', {
      clientId,
      message: clientLookupError.message,
    })
    return badRequest('server_error', 'Failed to look up the registered OAuth client')
  }
  const client = clientRow as RegisteredClientRow | null
  if (!client) {
    return badRequest('invalid_client', 'Unknown client_id')
  }
  const validatedRedirectUri = redirectUri
    ? resolveAllowedRedirectUri(redirectUri, client.redirect_uris)
    : null
  if (!validatedRedirectUri) {
    return badRequest('invalid_request', 'redirect_uri does not match a registered value')
  }

  // From here, errors are delivered to the (validated) redirect_uri per spec.
  if (responseType !== 'code') {
    return redirectError(validatedRedirectUri, 'unsupported_response_type', 'Only response_type=code is supported', state)
  }
  if (!codeChallenge) {
    return redirectError(validatedRedirectUri, 'invalid_request', 'code_challenge (PKCE) is required', state)
  }
  if (codeChallengeMethod !== 'S256' && codeChallengeMethod !== 'plain') {
    return redirectError(validatedRedirectUri, 'invalid_request', 'Unsupported code_challenge_method', state)
  }
  if (!isSupportedMerchantScope(scope)) {
    return redirectError(validatedRedirectUri, 'invalid_scope', 'Unsupported or missing OAuth scope', state)
  }

  const origin = trustedOrigin()
  const expectedResource = `${origin}${MERCHANT_OAUTH_PATHS.mcp}`
  if (resource && resource !== expectedResource) {
    return redirectError(validatedRedirectUri, 'invalid_target', 'resource does not match the SmartMenu merchant MCP endpoint', state)
  }

  // Human-login gate: require a merchant cookie session.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let tenantId: string | null = null
  if (user) {
    const { data: roleRow } = await supabase
      .from('app_users')
      .select('role, tenant_id, is_owner, permissions')
      .eq('user_id', user.id)
      .maybeSingle()
    const appUser = roleRow as (PermissionHolder & { tenant_id: string | null }) | null
    // OAuth credentials carry the same authority as manually-created AI keys.
    if (appUser && !hasPermission(appUser, 'store_setup')) {
      return Response.json({ error: 'Store setup permission required' }, { status: 403 })
    }
    // A tenant admin's authority is their own store, pinned via tenant_id —
    // and only while superadmin has the store's `mcp_enabled` switch on. The
    // flag is read here, before any code is issued, so a disabled store can
    // never complete the flow. It is re-checked on every dispatch too.
    const mcpEnabled = appUser?.tenant_id ? await isTenantMcpEnabled(appUser.tenant_id) : false
    if (isMerchantAuthorized(appUser, mcpEnabled)) tenantId = appUser!.tenant_id
  }

  if (!user || !tenantId) {
    if (req.method === 'POST') return Response.json({ error: 'Forbidden' }, { status: 403 })
    // Send the operator to log in, then return to this exact authorize request.
    const returnTo = `${url.pathname}${url.search}`
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('redirect', returnTo)
    if (user) loginUrl.searchParams.set('unauthorized', '1')
    return Response.redirect(loginUrl.toString(), 302)
  }

  const consentContext = { clientId, redirectUri: validatedRedirectUri, userId: user.id, tenantId, authorizationQuery: url.search }
  if (req.method === 'GET') {
    try {
      const { nonce, token } = await beginMerchantConsent(admin, consentContext)
      return new Response(merchantConsentHtml({
        clientName: client.client_name || 'MCP Client',
        redirectUri: validatedRedirectUri,
        action: `${origin}${url.pathname}${url.search}`,
        token,
        offlineAccess: scope.split(/\s+/).includes('offline_access'),
      }), { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Set-Cookie': consentCookie(origin, nonce),
      } })
    } catch {
      return badRequest('server_error', 'Could not prepare authorization consent')
    }
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return badRequest('invalid_request', 'Invalid consent form')
  }
  const decision = form.get('decision')
  const token = form.get('consent_token')
  if ((decision !== 'approve' && decision !== 'deny') || typeof token !== 'string') {
    return badRequest('invalid_request', 'Invalid consent decision')
  }
  const consumed = await consumeMerchantConsent(admin, consentContext, readConsentNonce(req, origin), token)
  if (!consumed) return Response.json({ error: 'Consent expired or invalid. Restart the connection.' }, { status: 403 })

  function finishConsent(response: Response): Response {
    // Redirect responses have immutable headers, so copy before clearing.
    const headers = new Headers(response.headers)
    headers.set('Set-Cookie', consentCookie(origin, '', 0))
    headers.set('Cache-Control', 'no-store')
    return new Response(null, { status: 303, headers })
  }
  if (decision === 'deny') {
    return finishConsent(redirectError(validatedRedirectUri, 'access_denied', 'The connection was declined', state))
  }

  // Explicitly approved — issue a single-use code and return to the connector.
  try {
    const code = await issueAuthorizationCode(
      admin,
      {
        clientId,
        redirectUri: validatedRedirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope,
        userId: user.id,
        tenantId,
      },
      { ttlSeconds: AUTH_CODE_TTL_SECONDS },
    )

    const target = new URL(validatedRedirectUri)
    target.searchParams.set('code', code)
    if (state) target.searchParams.set('state', state)
    return finishConsent(Response.redirect(target.toString(), 303))
  } catch {
    return finishConsent(redirectError(validatedRedirectUri, 'server_error', 'Failed to issue authorization code', state))
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
