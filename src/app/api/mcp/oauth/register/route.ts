import { createAdminClient } from '@/lib/supabase/admin'
import { registerClient } from '@/lib/mcp/oauth-service'
import { OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'
import { parseClientRegistration } from '@/lib/mcp/oauth-registration'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'

// RFC 7591 — OAuth 2.0 Dynamic Client Registration. Claude/ChatGPT POST their
// name + redirect URIs here and receive a client_id. Public clients (PKCE, no
// secret), so this is intentionally unauthenticated per the MCP OAuth profile —
// which is why it is capped (oauth-registration.ts) and rate limited per IP.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A client registers once per connection attempt; Cursor retries a few times.
 * Hosted connectors (claude.ai, ChatGPT) register from shared egress IPs, and
 * the busiest live hour so far saw 36 registrations, so the cap sits well
 * above that while still bounding a flood from one address.
 */
const REGISTER_RATE_LIMIT: RateLimitOptions = { limit: 100, windowSec: 600, onRedisFailure: 'instance' }

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIP(req) ?? 'unknown'
  const rate = await checkRateLimit(`mcp-register:${ip}`, REGISTER_RATE_LIMIT)
  if (!rate.allowed) {
    return Response.json(
      { error: 'slow_down', error_description: 'Too many client registrations. Try again later.' },
      { status: 429, headers: { ...OAUTH_CORS_HEADERS, 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return oauthError('invalid_client_metadata', 'Request body must be JSON', 400)
  }

  const parsed = parseClientRegistration(body)
  if (!parsed.ok) return oauthError(parsed.error, parsed.description, 400)

  try {
    const client = await registerClient(createAdminClient(), parsed.value)

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
    console.error('[SmartMenu OAuth] client registration failed', error instanceof Error ? error.message : error)
    return oauthError('invalid_client_metadata', 'Registration failed', 400)
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}

function oauthError(error: string, description: string, status: number): Response {
  return Response.json({ error, error_description: description }, { status, headers: OAUTH_CORS_HEADERS })
}
