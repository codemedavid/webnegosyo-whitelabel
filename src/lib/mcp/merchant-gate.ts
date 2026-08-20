import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The `mcp_enabled` kill switch.
 *
 * `tenants.mcp_enabled` is superadmin-controlled: it is the platform operator's
 * rollout gate and emergency off-switch for a merchant's AI connection. For that
 * to mean anything it has to be enforced on the surface itself, not just on the
 * page that mints keys — otherwise a tenant admin can drive the OAuth endpoints
 * directly, and any credential already issued outlives the switch.
 *
 * Every check here fails CLOSED: an unreadable flag, a missing tenant row, or a
 * database error all read as "not enabled".
 */

/** The subset of an `app_users` row the authorize decision needs. */
export interface MerchantAppUser {
  role: string
  tenant_id: string | null
}

/**
 * The merchant authorize-route decision: a tenant admin, bound to a concrete
 * store, whose store has the AI connection switched on. Used before any
 * authorization code is issued.
 */
export function isMerchantAuthorized(
  appUser: MerchantAppUser | null | undefined,
  mcpEnabled: boolean | null | undefined,
): boolean {
  if (!appUser || appUser.role !== 'admin' || !appUser.tenant_id) return false
  return mcpEnabled === true
}

/**
 * Reads the live flag for a tenant. Returns false on any error so a database
 * blip closes the surface rather than opening it.
 */
export async function isTenantMcpEnabled(tenantId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('tenants')
      .select('mcp_enabled')
      .eq('id', tenantId)
      .single()

    if (error || !data) return false
    // `mcp_enabled` post-dates the generated Database types, so read it structurally.
    return (data as unknown as { mcp_enabled: boolean | null }).mcp_enabled === true
  } catch {
    return false
  }
}
