/**
 * Idempotency for order-driven stock movements.
 *
 * Both ledger writers used to guard themselves by SELECTing for an existing
 * movement and inserting when there was none. Under concurrency that is not a
 * guard: N parallel calls all read "none" and all insert. The database has to
 * be the one saying no, which is what `order_stock_applications` and its unique
 * index (migration 20260805120000) are for — this module is the thin pair of
 * calls around it.
 *
 * The claim is taken BEFORE the ledger is written and released if that write
 * fails, so a crash mid-depletion leaves the order retryable rather than
 * permanently marked as done with its stock never moved.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Postgres unique_violation: another caller claimed this order first. */
const UNIQUE_VIOLATION = '23505'

/** The two directions stock moves for an order. Mirrors the ledger's reasons. */
export type OrderStockDirection = 'sale' | 'void'

/**
 * Any Supabase client. Callers here hold the service-role client — a diner
 * placing an order has no admin session and inventory RLS is admin-only — so
 * tenant scoping is this module's job, not RLS's, and every call filters on it.
 */
type ClaimClient = Pick<SupabaseClient, 'from'>

/**
 * Try to become the one caller that applies this order's stock in this
 * direction. Returns false when someone else already has.
 *
 * A losing race is a normal outcome, not a failure. Any OTHER database error
 * throws: reading an outage as "already applied" would silently skip depletion
 * for a real sale, which is the exact failure this guard exists to prevent.
 */
export async function claimOrderStockApplication(
  supabase: ClaimClient,
  tenantId: string,
  orderId: string,
  reason: OrderStockDirection,
): Promise<boolean> {
  const { error } = await supabase
    .from('order_stock_applications')
    .insert({ tenant_id: tenantId, order_id: orderId, reason } as never)

  if (!error) return true
  if (error.code === UNIQUE_VIOLATION) {
    console.warn('[inventory] Stock already applied for order', { orderId, reason })
    return false
  }
  throw error
}

/**
 * Give the claim back after a depletion failed to write.
 *
 * Never throws. The caller is already handling an error when it gets here, and
 * a failed release must not replace that error with a less useful one — the
 * cost of a leaked claim is a retry that no-ops, which is recoverable by hand.
 */
export async function releaseOrderStockApplication(
  supabase: ClaimClient,
  tenantId: string,
  orderId: string,
  reason: OrderStockDirection,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('order_stock_applications')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .eq('reason', reason)
    if (error) {
      console.error('[inventory] Could not release stock claim', { orderId, reason }, error)
    }
  } catch (error) {
    console.error('[inventory] Could not release stock claim', { orderId, reason }, error)
  }
}
