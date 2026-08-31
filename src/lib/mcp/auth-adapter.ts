import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { Database } from '@/types/database'
import { hashApiKey, MCP_KEY_PREFIX, MCP_OAUTH_KEY_PREFIX, verifyMcpKey } from '@/lib/mcp-auth'
import { verifyAccessToken } from '@/lib/mcp/oauth-jwt'
import { getJwtSecret, getOrigin, OAUTH_PATHS } from '@/lib/mcp/oauth-config'
import { MERCHANT_OAUTH_PATHS } from '@/lib/mcp/merchant-config'

/**
 * Builds a token verifier for `withMcpAuth`. It accepts:
 * - static API keys (`smk_live_…`) hashed in `mcp_api_keys`
 * - opaque OAuth access keys (`smk_oauth_…`) hashed in `mcp_api_keys`
 * - HS256 JWT access tokens minted by the OAuth token endpoint (Grok/ChatGPT)
 *
 * A valid credential resolves to an AuthInfo; anything else resolves to
 * undefined, which makes withMcpAuth respond 401.
 */
export interface McpTokenVerifierOptions {
    /** OAuth JWT signing secret; defaults to process.env.MCP_OAUTH_JWT_SECRET. */
    jwtSecret?: string
    /** Injectable clock (ms) for deterministic tests. */
    now?: () => number
}

export function createMcpTokenVerifier(
    client: SupabaseClient<Database>,
    options: McpTokenVerifierOptions = {},
) {
    const jwtSecret = options.jwtSecret ?? (process.env.MCP_OAUTH_JWT_SECRET ? getJwtSecret() : undefined)
    const now = options.now ?? (() => Date.now())

    return async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
        if (!bearerToken) {
            logAuthRejection(req, 'missing_bearer')
            return undefined
        }

        if (bearerToken.startsWith(MCP_KEY_PREFIX) || bearerToken.startsWith(MCP_OAUTH_KEY_PREFIX)) {
            try {
                const { keyId, scopes, tenantId } = await verifyMcpKey(`Bearer ${bearerToken}`, client, { now })
                return { token: bearerToken, clientId: keyId, scopes, extra: { tenantId } }
            } catch (error) {
                logAuthRejection(req, 'invalid_credential', bearerToken, error)
                return undefined
            }
        }

        if (jwtSecret && bearerToken.split('.').length === 3) {
            try {
                const origin = getOrigin(req)
                const path = safePathname(req.url)
                const audience = path.startsWith('/api/mcp/merchant')
                    ? `${origin}${MERCHANT_OAUTH_PATHS.mcp}`
                    : `${origin}${OAUTH_PATHS.mcp}`
                const claims = verifyAccessToken(bearerToken, {
                    secret: jwtSecret,
                    now: now(),
                    audience,
                    issuer: origin,
                })
                const scopes = claims.scope ? claims.scope.split(' ').filter(Boolean) : []
                return {
                    token: bearerToken,
                    clientId: claims.client_id,
                    scopes,
                    extra: { tenantId: claims.tenant_id ?? null },
                }
            } catch (error) {
                logAuthRejection(req, 'invalid_oauth_token', bearerToken, error)
                return undefined
            }
        }

        logAuthRejection(req, 'unrecognized_credential', bearerToken)
        return undefined
    }
}

type AuthRejectionReason =
    | 'missing_bearer'
    | 'invalid_credential'
    | 'invalid_oauth_token'
    | 'unrecognized_credential'

/**
 * Emits enough production telemetry to distinguish a missing credential from
 * a rejected one without ever logging the credential itself.
 */
function logAuthRejection(
    req: Request,
    reason: AuthRejectionReason,
    bearerToken?: string,
    error?: unknown,
): void {
    const authorization = req.headers?.get('authorization') ?? null
    const scheme = authorization?.match(/^\s*([^\s]+)/)?.[1]?.toLowerCase() ?? null

    console.error('[SmartMenu MCP auth rejected]', {
        reason,
        path: safePathname(req.url),
        authorizationPresent: authorization !== null,
        authorizationScheme: scheme,
        bearerTokenLength: bearerToken?.length ?? 0,
        bearerTokenSegments: bearerToken ? bearerToken.split('.').length : 0,
        tokenFingerprint: bearerToken ? hashApiKey(bearerToken).slice(0, 12) : null,
        verificationError: error instanceof Error ? error.message : null,
    })
}

function safePathname(url: string | undefined): string {
    if (!url) return '(unknown)'
    try {
        return new URL(url).pathname
    } catch {
        return '(invalid)'
    }
}
