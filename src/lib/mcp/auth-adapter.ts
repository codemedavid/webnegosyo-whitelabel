import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { Database } from '@/types/database'
import { hashApiKey, verifyMcpKey } from '@/lib/mcp-auth'

/**
 * Builds a token verifier for `withMcpAuth`. It accepts EITHER:
 * Manual API keys and OAuth access tokens are both opaque credentials stored
 * only as SHA-256 hashes in `mcp_api_keys`. One verification path avoids
 * transport-specific JWT handling and gives both credential types identical
 * revocation and scope semantics.
 *
 * A valid credential resolves to an AuthInfo; anything else resolves to
 * undefined, which makes withMcpAuth respond 401. The two are discriminated by
 * prefix: only legacy keys carry `smk_live_`.
 */
export interface McpTokenVerifierOptions {
    /** Injectable clock (ms) for deterministic tests. */
    now?: () => number
}

export function createMcpTokenVerifier(
    client: SupabaseClient<Database>,
    options: McpTokenVerifierOptions = {},
) {
    const now = options.now ?? (() => Date.now())

    return async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
        if (!bearerToken) {
            logAuthRejection(req, 'missing_bearer')
            return undefined
        }

        try {
            const { keyId, scopes, tenantId } = await verifyMcpKey(`Bearer ${bearerToken}`, client, { now })
            return { token: bearerToken, clientId: keyId, scopes, extra: { tenantId } }
        } catch (error) {
            logAuthRejection(req, 'invalid_credential', bearerToken, error)
            return undefined
        }
    }
}

type AuthRejectionReason =
    | 'missing_bearer'
    | 'invalid_credential'

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
