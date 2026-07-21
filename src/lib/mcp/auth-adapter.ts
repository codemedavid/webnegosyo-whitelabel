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

    return async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
        if (!bearerToken) return undefined

        // Legacy static key path.
        if (bearerToken.startsWith(MCP_KEY_PREFIX)) {
            try {
                const { keyId, scopes } = await verifyMcpKey(`Bearer ${bearerToken}`, client)
                return { token: bearerToken, clientId: keyId, scopes }
            } catch {
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
                return undefined
            }
        }

        return undefined
    }
}
