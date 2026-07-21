import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { Database } from '@/types/database'
import { verifyMcpKey } from '@/lib/mcp-auth'

/**
 * Builds a token verifier for `withMcpAuth`. It reconstructs a Bearer header
 * from the parsed token and delegates to verifyMcpKey (service-role lookup by
 * key hash). A valid, unrevoked key resolves to an AuthInfo; anything else
 * resolves to undefined, which makes withMcpAuth respond 401.
 */
export function createMcpTokenVerifier(client: SupabaseClient<Database>) {
    return async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
        if (!bearerToken) return undefined
        try {
            const { keyId, scopes } = await verifyMcpKey(`Bearer ${bearerToken}`, client)
            return { token: bearerToken, clientId: keyId, scopes }
        } catch {
            return undefined
        }
    }
}
