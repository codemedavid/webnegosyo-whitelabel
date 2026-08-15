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
  revision: number = 0,
): Promise<boolean> {
  const { error } = await supabase
    .from('order_stock_applications')
    .insert({ tenant_id: tenantId, order_id: orderId, reason, revision } as never)

  if (!error) return true
  if (error.code === UNIQUE_VIOLATION) {
    console.warn('[inventory] Stock already applied for order', { orderId, reason, revision })
    return false
  }
  throw error
}

/** One claim row, as narrow as revision arithmetic needs it. */
export interface OrderStockClaimRow {
  reason: OrderStockDirection
  revision: number
}

/**
 * Every claim this order holds, in both directions.
 *
 * Cancel/un-cancel and the racing-cancel guard all need to see the whole
 * picture at once: which revisions are burned decides both the next revision a
 * re-depletion can mint and whether a cancellation has already spoken for the
 * order's stock. Throws on a read error — guessing "no claims" during an
 * outage would let a sale through a guard that exists to refuse it.
 */
export async function listOrderStockClaims(
  supabase: ClaimClient,
  tenantId: string,
  orderId: string,
): Promise<OrderStockClaimRow[]> {
  const { data, error } = await supabase
    .from('order_stock_applications')
    .select('reason, revision')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
  if (error) throw error

  return ((data ?? []) as OrderStockClaimRow[]).map((row) => ({
    reason: row.reason,
    revision: Number(row.revision) || 0,
  }))
}

/**
 * The revision an un-cancel re-depletes at: one above every claim the order
 * holds, in either direction.
 *
 * The original sale and its cancellation burned their revisions on the unique
 * index; re-using any of them would make the re-depletion a silent no-op —
 * which is exactly the defect this exists to fix. A fresh revision always has
 * both directions free, so a later re-cancel can claim its void symmetrically.
 */
export function resolveRedepletionRevision(
  claims: readonly OrderStockClaimRow[],
): number {
  if (claims.length === 0) return 0
  return Math.max(...claims.map((claim) => claim.revision)) + 1
}

/**
 * The revision a cancellation claims its void at: paired with the latest sale,
 * skipping forward past any void an order edit already burned.
 *
 * Pairing with the latest sale keeps the plain order exactly as it was (sale@0
 * cancels as void@0) and makes the racing-sale guard line up — a sale at
 * revision r is blocked by a void at or above r. Skipping burned voids keeps a
 * cancellation working on an edited order, whose swap edits claim voids of
 * their own.
 */
export function resolveVoidClaimRevision(
  claims: readonly OrderStockClaimRow[],
): number {
  const latestSaleRevision = claims
    .filter((claim) => claim.reason === 'sale')
    .reduce((max, claim) => Math.max(max, claim.revision), 0)
  const burnedVoidRevisions = new Set(
    claims.filter((claim) => claim.reason === 'void').map((claim) => claim.revision),
  )

  let revision = latestSaleRevision
  while (burnedVoidRevisions.has(revision)) revision += 1
  return revision
}

/**
 * Whether a cancellation has already spoken for this order's stock at or above
 * the given sale revision — in which case the sale must not apply (cancel
 * wins). Strictly-below voids do NOT block: they belong to an earlier life of
 * the order that an un-cancel has since re-opened.
 */
export function hasBlockingVoidClaim(
  claims: readonly OrderStockClaimRow[],
  revision: number,
): boolean {
  return claims.some(
    (claim) => claim.reason === 'void' && claim.revision >= revision,
  )
}

/**
 * Give the claim back after a depletion failed to write.
 *
 * `revision` must match the claim that was taken, or the delete finds nothing
 * and the claim is leaked.
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
  revision: number = 0,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('order_stock_applications')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .eq('reason', reason)
      .eq('revision', revision)
    if (error) {
      console.error('[inventory] Could not release stock claim', { orderId, reason }, error)
    }
  } catch (error) {
    console.error('[inventory] Could not release stock claim', { orderId, reason }, error)
  }
}
