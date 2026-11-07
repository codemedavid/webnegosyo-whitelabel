/**
 * The one surface a swallowed stock failure has.
 *
 * Every order-side stock write is best-effort by design — a stock failure must
 * never cost a customer their order. That contract makes the failure report the
 * ONLY place drift can become visible, so it goes two places: the console for
 * the server logs (what the wrappers always did) and Sentry, tagged well enough
 * to find the drifted order later. And it must never throw: an observer that
 * can fail the operation it observes would break the very contract it serves.
 */

import * as Sentry from '@sentry/nextjs'

export type StockFailureOperation =
  | 'apply_order_stock'
  | 'reverse_order_stock'
  | 'redeplete_order_stock'
  | 'revise_simple_option_stock'
  | 'simple_option_sale'
  | 'simple_option_void'
  | 'simple_option_cancel'
  | 'record_restored_movements'
  | 'customer_order_stock_route'
  | 'skipped_depletion_line'
  | 'stock_alert_write'
  | 'stock_level_alerting'
  | 'auto_86_update'
  | 'sweep_order_stock'

export interface StockFailureContext {
  tenantId: string
  /** Absent for failures that belong to a shelf or a menu, not to one order. */
  orderId?: string
  operation: StockFailureOperation
  /** Which revision of the order was being saved, when the caller knows. */
  revision?: number
}

/** PostgREST errors are plain objects; Sentry groups an Error far better. */
function asError(error: unknown): Error {
  if (error instanceof Error) return error
  const message = (error as { message?: unknown } | null)?.message
  return new Error(typeof message === 'string' && message ? message : String(error))
}

export function reportStockFailure(context: StockFailureContext, error: unknown): void {
  // Console first: the log line must survive even if Sentry is down.
  console.error(`[inventory] Stock operation failed: ${context.operation}`, context, error)

  try {
    Sentry.captureException(asError(error), {
      tags: {
        tenantId: context.tenantId,
        ...(context.orderId !== undefined ? { orderId: context.orderId } : {}),
        operation: context.operation,
        // Tags are strings in Sentry; undefined stays absent rather than "undefined".
        ...(context.revision !== undefined ? { revision: String(context.revision) } : {}),
      },
    })
  } catch (reportError) {
    console.error('[inventory] Failed to report stock failure to Sentry', reportError)
  }
}

/** How long one bad recipe line stays quiet after it was reported. */
const SKIPPED_LINE_QUIET_MS = 60 * 60 * 1000
/** Bounds the memory of a long-lived server instance. */
const MAX_REMEMBERED_LINES = 500
const reportedSkippedLines = new Map<string, number>()

/**
 * A recipe line a sale could not deduct (its unit cannot convert to the
 * ingredient's stock unit, or its ingredient/unit is missing).
 *
 * The same broken line recurs on every order of that dish, so it is reported
 * once per recipe line per quiet window per server instance, never once per
 * order: this must surface the problem, not flood Sentry with it.
 */
export function reportSkippedDepletionLine(
  context: { tenantId: string; orderId: string; inventoryItemId: string; unitId: string },
  now: number = Date.now(),
): void {
  const key = `${context.tenantId}:${context.inventoryItemId}:${context.unitId}`
  const lastReportedAt = reportedSkippedLines.get(key)
  if (lastReportedAt !== undefined && now - lastReportedAt < SKIPPED_LINE_QUIET_MS) return

  if (reportedSkippedLines.size >= MAX_REMEMBERED_LINES) reportedSkippedLines.clear()
  reportedSkippedLines.set(key, now)
  reportStockFailure(
    { tenantId: context.tenantId, orderId: context.orderId, operation: 'skipped_depletion_line' },
    new Error(`Recipe line skipped: ingredient ${context.inventoryItemId} in unit ${context.unitId} cannot be deducted`),
  )
}

/** Test seam: forget what was reported. */
export function resetSkippedDepletionReports(): void {
  reportedSkippedLines.clear()
}
