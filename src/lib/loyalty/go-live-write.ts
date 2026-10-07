/**
 * Bring a store's loyalty flags up to what an active program needs.
 *
 * Shared by the merchant's program activation (`/api/loyalty/programs`) and
 * the onboarding starter card. The decision itself is the pure
 * `decideLoyaltyGoLive`; this is the write.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadLoyaltyTenantFlags } from './store'
import { decideLoyaltyGoLive } from './go-live'

/**
 * Returns whether anything was written. Never throws: the program is already
 * active, and a flag write that failed is retried by the next activation
 * rather than failing the one just made.
 */
export async function switchLoyaltyLive(admin: SupabaseClient, tenantId: string): Promise<boolean> {
  try {
    const patch = decideLoyaltyGoLive(await loadLoyaltyTenantFlags(admin, tenantId))
    if (!patch) return false

    const { error } = await admin.from('tenants').update(patch).eq('id', tenantId)
    if (error) throw new Error(error.message)
    return true
  } catch (err) {
    console.error('[loyalty] could not switch the store live:', err instanceof Error ? err.message : err)
    return false
  }
}
