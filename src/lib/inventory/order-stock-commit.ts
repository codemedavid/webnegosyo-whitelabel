/**
 * The one write an order's stock makes: its idempotency claim AND its ledger
 * rows, in a single database transaction (`apply_order_stock_claim`,
 * migration 20261103140000).
 *
 * The claim used to be one HTTP call and the rows another, with a DELETE of
 * the claim when the second failed. A crash between them left a claim with no
 * rows (every retry said "duplicate", the order was never depleted); a network
 * error after the rows committed released the claim and the retry deducted
 * twice. Now the database commits both or neither, so a retry after ANY
 * failure is safe: it either does the work or answers `duplicate`.
 *
 * The cancel-wins and edit guards, and the cap on what an edit may give back,
 * are decided inside the same transaction under a per-order lock.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderStockClaimKind, OrderStockDirection } from './order-stock-claim'

/** What the database decided. */
export type OrderStockClaimStatus = 'applied' | 'duplicate' | 'cancelled_first'

/** Which claim a write belongs to: the unique key of `order_stock_applications`. */
export interface OrderStockClaimTarget {
  tenantId: string
  orderId: string
  reason: OrderStockDirection
  kind: OrderStockClaimKind
  revision: number
}

/** One ledger row as the caller computed it (tenant and order are the claim's). */
export interface OrderStockMovementInput {
  inventory_item_id: string
  outlet_id: string | null
  reason: 'sale' | 'void'
  quantity_delta: number
  entered_quantity: number | null
  entered_unit_id: string | null
}

export interface CommittedOrderStock {
  status: OrderStockClaimStatus
  /** The rows actually written (an edit's give-back may have been capped). */
  rows: OrderStockMovementInput[]
}

export const ORDER_STOCK_CLAIM_RPC = 'apply_order_stock_claim'

/** Same ceiling as the function: one order never writes more rows than this. */
export const MAX_ORDER_STOCK_ROWS = 500

const STATUSES: readonly OrderStockClaimStatus[] = ['applied', 'duplicate', 'cancelled_first']

type RpcClient = Pick<SupabaseClient, 'rpc'>

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRow(value: unknown): OrderStockMovementInput {
  const row = (value ?? {}) as Record<string, unknown>
  const delta = toNumberOrNull(row.quantity_delta)
  if (typeof row.inventory_item_id !== 'string' || delta === null || (row.reason !== 'sale' && row.reason !== 'void')) {
    throw new Error('apply_order_stock_claim answered a malformed row')
  }
  return {
    inventory_item_id: row.inventory_item_id,
    outlet_id: typeof row.outlet_id === 'string' ? row.outlet_id : null,
    reason: row.reason,
    quantity_delta: delta,
    entered_quantity: toNumberOrNull(row.entered_quantity),
    entered_unit_id: typeof row.entered_unit_id === 'string' ? row.entered_unit_id : null,
  }
}

/**
 * The answer, strictly. An unrecognised answer throws: reading it as
 * "applied" would hide a write that never happened, and as "duplicate" would
 * skip a real sale.
 */
export function parseCommittedOrderStock(data: unknown): CommittedOrderStock {
  const answer = (data ?? {}) as { status?: unknown; rows?: unknown }
  if (!STATUSES.includes(answer.status as OrderStockClaimStatus)) {
    throw new Error('apply_order_stock_claim answered an unknown status')
  }
  const rows = Array.isArray(answer.rows) ? answer.rows.map(parseRow) : []
  return { status: answer.status as OrderStockClaimStatus, rows }
}

async function callClaim(
  supabase: RpcClient,
  target: OrderStockClaimTarget,
  movements: readonly OrderStockMovementInput[],
  mode: 'rows' | 'reverse_all',
): Promise<CommittedOrderStock> {
  if (movements.length > MAX_ORDER_STOCK_ROWS) {
    throw new Error(`An order cannot write more than ${MAX_ORDER_STOCK_ROWS} stock movements at once`)
  }
  const { data, error } = await supabase.rpc(ORDER_STOCK_CLAIM_RPC, {
    p_tenant_id: target.tenantId,
    p_order_id: target.orderId,
    p_reason: target.reason,
    p_kind: target.kind,
    p_revision: target.revision,
    p_movements: movements,
    p_mode: mode,
  } as never)
  if (error) throw error
  return parseCommittedOrderStock(data)
}

/**
 * Claim `target` and write `movements` with it. Zero movements is allowed: the
 * claim alone is then the record (an un-cancel with nothing to spend).
 * Throws on a database error; nothing was written in that case.
 */
export function commitOrderStockClaim(
  supabase: RpcClient,
  target: OrderStockClaimTarget,
  movements: readonly OrderStockMovementInput[],
): Promise<CommittedOrderStock> {
  return callClaim(supabase, target, movements, 'rows')
}

/**
 * Claim the cancellation at `revision` and reverse EVERYTHING the order
 * recorded, netted per ingredient + entered unit + branch, computed by the
 * database under the same lock (so a sale landing concurrently is either
 * reversed or refused). The claim is kept even when nothing was recorded: it
 * is the marker a late sale stands down for.
 */
export function commitOrderStockReversal(
  supabase: RpcClient,
  tenantId: string,
  orderId: string,
  revision: number,
): Promise<CommittedOrderStock> {
  return callClaim(supabase, { tenantId, orderId, reason: 'void', kind: 'order', revision }, [], 'reverse_all')
}
