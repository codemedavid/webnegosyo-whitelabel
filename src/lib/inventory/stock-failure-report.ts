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
  | 'customer_order_stock_route'

export interface StockFailureContext {
  tenantId: string
  orderId: string
  operation: StockFailureOperation
  /** Which revision of the order was being saved, when the caller knows. */
  revision?: number
}

export function reportStockFailure(context: StockFailureContext, error: unknown): void {
  // Console first: the log line must survive even if Sentry is down.
  console.error(`[inventory] Stock operation failed: ${context.operation}`, context, error)

  try {
    Sentry.captureException(error, {
      tags: {
        tenantId: context.tenantId,
        orderId: context.orderId,
        operation: context.operation,
        // Tags are strings in Sentry; undefined stays absent rather than "undefined".
        ...(context.revision !== undefined ? { revision: String(context.revision) } : {}),
      },
    })
  } catch (reportError) {
    console.error('[inventory] Failed to report stock failure to Sentry', reportError)
  }
}
