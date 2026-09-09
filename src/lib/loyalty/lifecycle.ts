/**
 * The bridge from "an order changed" to "the loyalty ledger moved".
 *
 * Called by the lifecycle-sync route (after the customer ledger is brought up
 * to date) and by the web admin's own status writers. Best-effort by contract:
 * the order has already changed in its own backend; a failure here is logged
 * and retried by the next event, and `apply_loyalty_earning` makes that retry
 * safe.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { earnLoyaltyForFact, type LoyaltyEarningDeps, type LoyaltyEarningOutcome } from './apply'
import {
  createSupabaseLoyaltyDeps,
  loadLoyaltyOrderFact,
  loadLoyaltyTenantFlags,
  type LoyaltyOrderRef,
  type LoyaltyTenantFlags,
} from './store'
import type { CustomerOrderFact } from '@/lib/customer-order-facts'

export interface LoyaltyLifecycleDeps {
  loadFlags: (tenantId: string) => Promise<LoyaltyTenantFlags>
  loadFact: (ref: LoyaltyOrderRef) => Promise<CustomerOrderFact | null>
  earning: LoyaltyEarningDeps
}

export type LoyaltyLifecycleResult =
  | { ran: false; reason: 'disabled' | 'order_not_found' }
  | { ran: true; isShadow: boolean; outcome: LoyaltyEarningOutcome }

export async function runLoyaltyForOrderWith(
  ref: LoyaltyOrderRef,
  deps: LoyaltyLifecycleDeps,
): Promise<LoyaltyLifecycleResult> {
  const flags = await deps.loadFlags(ref.tenantId)
  if (!flags.isEnabled) return { ran: false, reason: 'disabled' }

  const fact = await deps.loadFact(ref)
  if (!fact) return { ran: false, reason: 'order_not_found' }

  const outcome = await earnLoyaltyForFact(
    fact,
    { tenantId: ref.tenantId, isShadow: flags.isShadow },
    deps.earning,
  )
  return { ran: true, isShadow: flags.isShadow, outcome }
}

export function createLoyaltyLifecycleDeps(client: SupabaseClient): LoyaltyLifecycleDeps {
  return {
    loadFlags: (tenantId) => loadLoyaltyTenantFlags(client, tenantId),
    loadFact: (ref) => loadLoyaltyOrderFact(client, ref),
    earning: createSupabaseLoyaltyDeps(client),
  }
}

/** Production entry point. Never throws. */
export async function runLoyaltyForOrder(
  client: SupabaseClient,
  ref: LoyaltyOrderRef,
): Promise<LoyaltyLifecycleResult | null> {
  try {
    return await runLoyaltyForOrderWith(ref, createLoyaltyLifecycleDeps(client))
  } catch (error) {
    console.error('[loyalty] earning failed for', ref, error)
    return null
  }
}
