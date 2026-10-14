/**
 * Say so when a device gives up on a stock call.
 *
 * An abandoned call — refused for good, or out of attempts — leaves the shelf
 * wrong until a stocktake, and no screen will ever show it. So it is logged on
 * the device AND, once crash reporting has registered itself here
 * (`lib/sentry/index.ts`), sent to Sentry as a warning.
 *
 * A sink rather than an import: Sentry pulls in native modules that the pure
 * offline modules (and their tests) must not load.
 */

export interface AbandonedStockCall {
  tenantId: string;
  orderId: string;
  /** deplete | restore | redeplete | revise. */
  action: string;
  reason: "refused" | "exhausted";
  attempts: number;
}

export type StockAbandonSink = (message: string, tags: Record<string, string>) => void;

let sink: StockAbandonSink | null = null;

/** Registered once at boot by crash reporting; null unregisters (tests). */
export function setStockAbandonSink(next: StockAbandonSink | null): void {
  sink = next;
}

/** Never throws. */
export function reportAbandonedStock(call: AbandonedStockCall): void {
  const message =
    `[stock] Gave up on the ${call.action} stock call for order ${call.orderId} ` +
    `(store ${call.tenantId}): ${call.reason} after ${call.attempts} attempt(s).`;
  console.warn(message);
  try {
    sink?.(`Stock call abandoned (${call.reason})`, {
      tenantId: call.tenantId,
      orderId: call.orderId,
      stockAction: call.action,
      reason: call.reason,
      attempts: String(call.attempts),
    });
  } catch {
    // Reporting must never be what breaks the queue.
  }
}
