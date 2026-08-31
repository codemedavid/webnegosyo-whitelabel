import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { SUPERADMIN_MCP_CONSENT_PATH } from '@/lib/mcp/supabase-oauth-config'

type Client = SupabaseClient<Database>

export type ConsentDecision = 'approve' | 'deny'

const AUTHORIZATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/

export function isValidSuperadminAuthorizationId(authorizationId: string): boolean {
  return AUTHORIZATION_ID_PATTERN.test(authorizationId)
}

export type ConsentView =
  | { kind: 'login'; href: string }
  | { kind: 'forbidden' }
  | { kind: 'redirect'; href: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'consent'
      authorizationId: string
      clientName: string
      redirectUri: string
      scopes: string[]
    }

async function currentSuperadmin(client: Client) {
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) return { user: null, allowed: false }

  const { data, error } = await client
    .from('app_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  return { user, allowed: !error && data?.role === 'superadmin' }
}

export async function loadSuperadminConsent(
  client: Client,
  authorizationId: string,
): Promise<ConsentView> {
  if (!authorizationId) {
    return { kind: 'error', message: 'Missing authorization request.' }
  }
  if (!isValidSuperadminAuthorizationId(authorizationId)) {
    return { kind: 'error', message: 'Invalid authorization request.' }
  }

  const identity = await currentSuperadmin(client)
  if (!identity.user) {
    const target = `${SUPERADMIN_MCP_CONSENT_PATH}?authorization_id=${encodeURIComponent(authorizationId)}`
    return {
      kind: 'login',
      href: `/superadmin/login?redirect=${encodeURIComponent(target)}`,
    }
  }
  if (!identity.allowed) return { kind: 'forbidden' }

  const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) {
    return { kind: 'error', message: 'Invalid or expired authorization request.' }
  }
  if (!('authorization_id' in data)) {
    return { kind: 'redirect', href: data.redirect_url }
  }

  return {
    kind: 'consent',
    authorizationId,
    clientName: data.client.name,
    redirectUri: data.redirect_uri,
    scopes: data.scope?.split(/\s+/).filter(Boolean) ?? [],
  }
}

export async function decideSuperadminConsent(
  client: Client,
  authorizationId: string,
  decision: ConsentDecision,
) {
  if (!authorizationId) {
    return { kind: 'error' as const, message: 'Missing authorization request.' }
  }
  if (!isValidSuperadminAuthorizationId(authorizationId)) {
    return { kind: 'error' as const, message: 'Invalid authorization request.' }
  }

  const identity = await currentSuperadmin(client)
  if (!identity.user || !identity.allowed) return { kind: 'forbidden' as const }

  const result = decision === 'approve'
    ? await client.auth.oauth.approveAuthorization(authorizationId)
    : await client.auth.oauth.denyAuthorization(authorizationId)

  if (result.error || !result.data) {
    return { kind: 'error' as const, message: 'Authorization decision failed.' }
  }

  return { kind: 'redirect' as const, href: result.data.redirect_url }
}
