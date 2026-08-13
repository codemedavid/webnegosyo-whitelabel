import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { Database } from '@/types/database'
import { verifyMcpKey, MCP_KEY_PREFIX } from '@/lib/mcp-auth'
import { verifyAccessToken } from '@/lib/mcp/oauth-jwt'

/**
 * Builds a token verifier for `withMcpAuth`. It accepts EITHER:
 *  - a legacy static API key (`smk_live_…`) — verified against `mcp_api_keys`
 *    by hash via verifyMcpKey; or
 *  - an OAuth 2.1 access token (HS256 JWT) minted by the OAuth token endpoint —
 *    verified statelessly with the signing secret.
 *
 * A valid credential resolves to an AuthInfo; anything else resolves to
 * undefined, which makes withMcpAuth respond 401. The two are discriminated by
 * prefix: only legacy keys carry `smk_live_`.
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
    const jwtSecret = options.jwtSecret ?? process.env.MCP_OAUTH_JWT_SECRET
    const now = options.now ?? (() => Date.now())

    return async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
        if (!bearerToken) {
            logAuthRejection(req, 'missing_bearer')
            return undefined
        }

        // Legacy static key path.
        if (bearerToken.startsWith(MCP_KEY_PREFIX)) {
            try {
                const { keyId, scopes } = await verifyMcpKey(`Bearer ${bearerToken}`, client)
                return { token: bearerToken, clientId: keyId, scopes }
            } catch {
                logAuthRejection(req, 'invalid_static_key', bearerToken)
                return undefined
            }
        }

        // OAuth access-token (JWT) path.
        if (jwtSecret) {
            try {
                const claims = verifyAccessToken(bearerToken, { secret: jwtSecret, now: now() })
                const scopes = claims.scope ? claims.scope.split(' ').filter(Boolean) : []
                return { token: bearerToken, clientId: claims.client_id, scopes }
            } catch {
                logAuthRejection(req, 'invalid_oauth_token', bearerToken)
                return undefined
            }
        }

        logAuthRejection(req, 'oauth_secret_missing', bearerToken)
        return undefined
    }
}

type AuthRejectionReason =
    | 'missing_bearer'
    | 'invalid_static_key'
    | 'invalid_oauth_token'
    | 'oauth_secret_missing'

/**
 * Emits enough production telemetry to distinguish a missing credential from
 * a rejected one without ever logging the credential itself.
 */
function logAuthRejection(req: Request, reason: AuthRejectionReason, bearerToken?: string): void {
    const authorization = req.headers?.get('authorization') ?? null
    const scheme = authorization?.match(/^\s*([^\s]+)/)?.[1]?.toLowerCase() ?? null

    console.warn('[SmartMenu MCP auth rejected]', {
        reason,
        path: safePathname(req.url),
        authorizationPresent: authorization !== null,
        authorizationScheme: scheme,
        bearerTokenLength: bearerToken?.length ?? 0,
        bearerTokenSegments: bearerToken ? bearerToken.split('.').length : 0,
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
