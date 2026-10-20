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
 * Which life a claim belongs to (migration 20261013160000).
 *
 * 'order' is the order's own life: the original sale, a cancellation, an
 * un-cancel. 'edit' is a saved edit's difference, numbered by the order's own
 * revision counter. They used to share one (reason, revision) namespace, so an
 * edit's restore read as a cancellation and an un-cancel's fresh revision
 * collided with the next edit. Each kind now has its own.
 */
export type OrderStockClaimKind = 'order' | 'edit'

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
  kind: OrderStockClaimKind = 'order',
): Promise<boolean> {
  const { error } = await supabase
    .from('order_stock_applications')
    .insert({ tenant_id: tenantId, order_id: orderId, reason, revision, kind } as never)

  if (!error) return true
  if (error.code === UNIQUE_VIOLATION) {
    console.warn('[inventory] Stock already applied for order', { orderId, reason, revision, kind })
    return false
  }
  throw error
}

/** One claim row, as narrow as revision arithmetic needs it. */
export interface OrderStockClaimRow {
  reason: OrderStockDirection
  revision: number
  /** Absent on rows written before the column existed, which were all 'order'. */
  kind?: OrderStockClaimKind
  /** What a cancellation put back — the ledger rows an un-cancel re-spends. */
  restored?: RestoredMovement[] | null
}

/** One ledger row a cancellation wrote, as stored on its claim. */
export interface RestoredMovement {
  inventory_item_id: string
  outlet_id: string | null
  /** Positive: what came back onto the shelf, in the stock unit. */
  quantity_delta: number
  entered_quantity: number | null
  entered_unit_id: string | null
}

function isOrderClaim(claim: OrderStockClaimRow): boolean {
  return (claim.kind ?? 'order') === 'order'
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
    .select('reason, revision, kind, restored')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
  if (error) throw error

  return ((data ?? []) as OrderStockClaimRow[]).map((row) => ({
    reason: row.reason,
    revision: Number(row.revision) || 0,
    kind: row.kind === 'edit' ? 'edit' : 'order',
    restored: Array.isArray(row.restored) ? row.restored : null,
  }))
}

/**
 * Remember on a cancellation's claim exactly what it put back.
 *
 * Throws on failure: the caller decides whether a missing record matters (an
 * un-cancel without it falls back to recomputing from the order's lines).
 */
export async function recordRestoredMovements(
  supabase: Pick<SupabaseClient, 'from'>,
  tenantId: string,
  orderId: string,
  revision: number,
  restored: readonly RestoredMovement[],
): Promise<void> {
  const { error } = await supabase
    .from('order_stock_applications')
    .update({ restored } as never)
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .eq('reason', 'void')
    .eq('kind', 'order')
    .eq('revision', revision)
  if (error) throw error
}

/**
 * The movements the order's latest cancellation put back, or null when that
 * cancellation predates the record (or put nothing back) — the caller then
 * recomputes from the order's lines instead.
 */
export function latestCancellationRestored(
  claims: readonly OrderStockClaimRow[],
): RestoredMovement[] | null {
  const cancellations = claims.filter((claim) => isOrderClaim(claim) && claim.reason === 'void')
  if (cancellations.length === 0) return null
  const latest = cancellations.reduce((a, b) => (b.revision > a.revision ? b : a))
  return latest.restored && latest.restored.length > 0 ? latest.restored : null
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
  const own = claims.filter(isOrderClaim)
  if (own.length === 0) return 0
  return Math.max(...own.map((claim) => claim.revision)) + 1
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
  const own = claims.filter(isOrderClaim)
  const latestSaleRevision = own
    .filter((claim) => claim.reason === 'sale')
    .reduce((max, claim) => Math.max(max, claim.revision), 0)
  const burnedVoidRevisions = new Set(
    own.filter((claim) => claim.reason === 'void').map((claim) => claim.revision),
  )

  let revision = latestSaleRevision
  while (burnedVoidRevisions.has(revision)) revision += 1
  return revision
}

/** A simple-option claim row; its `action` uses 'cancel' as well as 'void' for a reversal. */
export interface SimpleOptionClaimRow {
  action: string
  revision: number
}

/**
 * May an un-cancelled order spend its stock again?
 *
 * Only when its latest sale was put back BY A CANCELLATION. Re-deducting at a
 * fresh revision is always accepted by the unique index, so the claim cannot be
 * what refuses a second deduction here: a cancel that never restored
 * (best-effort, timed out, or made outside updateOrderStatus) or a repeated
 * un-cancel would each spend the order a second time. An edit's restore is not
 * a cancellation — counting it let an edited order's un-cancel deduct twice.
 * The simple-option claims count only when no ingredient sale is on record —
 * an order with no recipes releases its recipe claim, and its simple-option
 * claims are then the only record of what was sold; the
 * simple RPC marks a cancellation `action = 'cancel'` ('void' is its edit).
 *
 * An order with no sale on record has nothing to double-count, so it stays
 * allowed (that is the behaviour it had before this guard).
 */
export function isLatestSaleReversed(
  claims: readonly OrderStockClaimRow[],
  simpleClaims: readonly SimpleOptionClaimRow[] = [],
): boolean {
  const own = claims.filter(isOrderClaim)
  // The ingredient claims are the authority once they record a sale. A
  // simple-option sale written by an un-cancel whose ingredient write then
  // failed (and handed its claim back) would otherwise read as the latest sale
  // and refuse every retry, leaving the re-opened order's ingredients unspent.
  const hasOwnSale = own.some((claim) => claim.reason === 'sale')
  const moves = [
    ...own.map((claim) => ({ isSale: claim.reason === 'sale', isCancel: claim.reason === 'void', revision: claim.revision })),
    ...(hasOwnSale ? [] : simpleClaims).map((claim) => ({ isSale: claim.action === 'sale', isCancel: claim.action === 'cancel', revision: Number(claim.revision) })),
  ]
  const sales = moves.filter((move) => move.isSale)
  if (sales.length === 0) return true
  const latestSale = Math.max(...sales.map((move) => move.revision))
  return moves.some((move) => move.isCancel && move.revision >= latestSale)
}

/**
 * Whether a cancellation has already spoken for this order's stock at or above
 * the given sale revision — in which case the sale must not apply (cancel
 * wins). Strictly-below cancellations do NOT block: they belong to an earlier
 * life of the order that an un-cancel has since re-opened. Edit claims never
 * block: an edit's restore landing before the original sale is still owed that
 * sale.
 */
export function hasBlockingVoidClaim(
  claims: readonly OrderStockClaimRow[],
  revision: number,
): boolean {
  return claims.some(
    (claim) => isOrderClaim(claim) && claim.reason === 'void' && claim.revision >= revision,
  )
}

/**
 * Is the order cancelled as far as its stock is concerned — a cancellation at
 * or above its latest sale? An edit arriving then must not move stock: the
 * cancellation has already netted everything the order recorded, so a late
 * edit sale would spend for a dead order and a late edit restore would give
 * back stock that was never out.
 */
export function isCancelledByClaims(claims: readonly OrderStockClaimRow[]): boolean {
  const own = claims.filter(isOrderClaim)
  const latestSale = own
    .filter((claim) => claim.reason === 'sale')
    .reduce((max, claim) => Math.max(max, claim.revision), 0)
  return own.some((claim) => claim.reason === 'void' && claim.revision >= latestSale)
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
  kind: OrderStockClaimKind = 'order',
): Promise<void> {
  try {
    const { error } = await supabase
      .from('order_stock_applications')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .eq('reason', reason)
      .eq('kind', kind)
      .eq('revision', revision)
    if (error) {
      console.error('[inventory] Could not release stock claim', { orderId, reason }, error)
    }
  } catch (error) {
    console.error('[inventory] Could not release stock claim', { orderId, reason }, error)
  }
}
