import { randomUUID } from 'crypto'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getOrigin } from '@/lib/mcp/oauth-config'
import {
  getSuperadminMcpResource,
  isSuperadminMcpAudience,
  SUPERADMIN_INTERNAL_SCOPE,
} from '@/lib/mcp/supabase-oauth-config'

export function createSuperadminTokenVerifier(client: SupabaseClient<Database>) {
  return async (req: Request, token?: string): Promise<AuthInfo | undefined> => {
    if (!token) {
      logRejection(req, 'missing_bearer')
      return undefined
    }

    try {
      const { data, error } = await client.auth.getClaims(token)
      const claims = data?.claims
      const userId = claims?.sub
      const clientId = claims?.client_id
      const audience = claims?.aud
      const resource = getSuperadminMcpResource(getOrigin(req))

      if (
        error ||
        !claims ||
        typeof userId !== 'string' ||
        typeof clientId !== 'string' ||
        !isAudience(audience, resource)
      ) {
        logRejection(req, 'invalid_oauth_claims')
        return undefined
      }

      const { data: appUser, error: roleError } = await client
        .from('app_users')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()

      if (roleError) {
        logRejection(req, 'role_lookup_failed')
        return undefined
      }

      const role = appUser?.role ?? null
      return {
        token,
        clientId,
        scopes: role === 'superadmin' ? [SUPERADMIN_INTERNAL_SCOPE] : [],
        extra: { userId, role },
      }
    } catch {
      logRejection(req, 'token_verification_failed')
      return undefined
    }
  }
}

function isAudience(audience: unknown, resource: string): audience is string | string[] {
  return (
    typeof audience === 'string' ||
    (Array.isArray(audience) && audience.every((item) => typeof item === 'string'))
  ) && isSuperadminMcpAudience(audience, resource)
}

function logRejection(req: Request, reason: string): void {
  console.error('[SmartMenu MCP superadmin auth rejected]', {
    requestId: req.headers.get('x-request-id') ?? randomUUID(),
    reason,
  })
}
