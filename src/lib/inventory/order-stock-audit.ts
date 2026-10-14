/**
 * The audit row every order-driven stock operation leaves behind, whatever
 * happened: applied, nothing to deduct, refused as a duplicate, or failed.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { StockAuditContext, StockAuditEvent } from './stock-audit'
import { auditErrorDetail, recordStockAudit } from './stock-audit-service'
import type { OrderStockClaimKind } from './order-stock-claim'
import type { OrderStockResult } from './order-stock-ledger'

/** Where an order-driven stock write came from, when the caller knows. */
export interface OrderStockAuditOptions {
  context?: StockAuditContext
  /** Overrides the event implied by the direction (e.g. an edit, an un-cancel). */
  event?: StockAuditEvent
  /** Claim namespace; a saved edit passes 'edit'. Defaults to the order's own. */
  kind?: OrderStockClaimKind
}

export const SYSTEM_CONTEXT: StockAuditContext = { source: 'system' }

export interface OrderAuditTarget {
  tenantId: string
  orderId: string
  event: StockAuditEvent
  context: StockAuditContext
  revision: number | null
  outletId: string | null
}

function skippedDetail(result: OrderStockResult): string | null {
  return result.skipped.length > 0
    ? `Skipped ${result.skipped.length} ingredient(s) with an unresolvable unit: ${result.skipped.join(', ')}`
    : null
}

/**
 * The audit row for one order-driven operation. Never throws — the writer
 * swallows its own failures, and this runs after the stock decision is final.
 */
export async function auditOrderStock(
  target: OrderAuditTarget,
  outcome: { result: OrderStockResult } | { error: unknown },
): Promise<void> {
  const isFailure = 'error' in outcome
  if (!isFailure && outcome.result.outcome === 'duplicate') {
    // The signal a "deducted twice" report needs. Also on the server log, so it
    // shows up in Vercel without opening the admin screen.
    console.warn('[inventory-audit] Refused a second stock operation for order', {
      tenantId: target.tenantId,
      orderId: target.orderId,
      event: target.event,
      source: target.context.source,
      revision: target.revision,
    })
  }
  await recordStockAudit(createAdminClient(), {
    tenantId: target.tenantId,
    event: target.event,
    outcome: isFailure ? 'failed' : outcome.result.outcome,
    context: target.context,
    orderId: target.orderId,
    revision: target.revision,
    outletId: target.outletId,
    lines: isFailure ? [] : outcome.result.lines,
    detail: isFailure ? auditErrorDetail(outcome.error) : skippedDetail(outcome.result),
  })
}

/** Server-log the ingredients a write had to skip (unresolvable units). */
export function warnSkipped(message: string, orderId: string, result: OrderStockResult): void {
  if (result.skipped.length === 0) return
  console.warn(message, { orderId, skipped: result.skipped })
}
