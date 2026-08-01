/**
 * The branch scope of whoever is performing a stock write.
 *
 * Resolved from `app_users` rather than taken from the caller, for the same
 * reason the POS route resolves it server-side: a client-named branch on a
 * write path would let one shop move another's stock.
 *
 * Extracted from `stock-service.ts` when transfers became a second writer that
 * has to ask the same question. Two copies of an authority lookup is precisely
 * the drift this codebase already keeps `branch-scope.ts` and
 * `staff-permissions.ts` single-definition to avoid — one copy loosening is a
 * hole nobody notices, because the other copy still reads correctly.
 */

import type { createClient } from '@/lib/supabase/server'
import {
  resolveBranchScope,
  type BranchScope,
  type BranchScopedUser,
} from '@/lib/outlets/branch-scope'

/**
 * Any Supabase client already scoped to the caller — the cookie-bound server
 * client on the web, a Bearer-token client for the merchant app.
 */
export type StockActorClient = Awaited<ReturnType<typeof createClient>>

/**
 * Falls back to store-wide when no user can be named. That is the order
 * pipeline's service client — a `sale` is deducted by the system, not by a
 * person — and it is the behaviour every tenant has today.
 *
 * Never throws: a failed identity lookup must not make a shelf uncountable.
 * The narrower guards that actually protect another branch's stock are the RLS
 * policies, which do not depend on this answer.
 */
export async function resolveActingBranchScope(
  supabase: StockActorClient,
  tenantId: string,
): Promise<BranchScope> {
  try {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) return { kind: 'all' }

    const { data: appUser } = await supabase
      .from('app_users')
      .select('role, is_owner, outlet_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .single()
    if (!appUser) return { kind: 'all' }

    return resolveBranchScope(appUser as unknown as BranchScopedUser)
  } catch {
    return { kind: 'all' }
  }
}
