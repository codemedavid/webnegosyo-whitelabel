/**
 * Everything a counter sale owes the platform once its order row exists —
 * stock depletion, the Loyverse receipt, voucher burns, the staff activity
 * line and customer capture — reported together.
 *
 * ONE implementation for the two moments it can run: right after an online
 * sale (the tender screen) and when a sale taken offline is finally written
 * (`sync-outbox.ts`). Both hand it the facts the register precomputed at
 * tender time, so a replayed sale reports exactly what a live one would have.
 *
 * None of these can throw and none depends on another's answer; each is a
 * bounded, never-throwing POST (`lib/authorized-post.ts`).
 *
 * The stock call's answer IS reported back: it is the one piece a sale must
 * not lose, and the only one the server makes idempotent (claimed per order),
 * so a caller holding a durable queue keeps retrying it — see
 * `sync-outbox.ts`. `skipReports` runs the stock call alone, for that retry;
 * `onReportsDone` lets that queue checkpoint the reports as soon as they land.
 */

import type { OrderBackend } from "../order-backend";
import type { notifyPosStockDepletion, StockPostOutcome } from "../pos-stock-notify";
import type { notifyLoyversePosSale } from "../loyverse-notify";
import type { burnPosRedemptions } from "../voucher-service";
import type { notifyPosSaleActivity } from "../staff-activity/report-pos-sale";
import type { notifyCustomerCapture } from "../customers/capture";
import type { QueuedSaleBookkeeping } from "./order-outbox";

export interface PosSaleBookkeepingFacts {
  tenantId: string;
  /** The id the order was WRITTEN under — the server's, after a sync. */
  orderId: string;
  backend: OrderBackend;
  /** When the sale was taken (epoch ms), not when it was written. */
  createdAt: number;
  bookkeeping: QueuedSaleBookkeeping;
  /** The reports already ran for this sale; only the stock call is owed. */
  skipReports?: boolean;
  /**
   * Persist "the reports ran" — called the moment they resolve, while the
   * stock call may still be out, so a crash in between does not send the
   * non-idempotent reports again. A failed checkpoint is only logged.
   */
  onReportsDone?: () => Promise<void>;
}

export interface PosSaleBookkeepingOutcome {
  stock: StockPostOutcome;
}

export interface PosSaleBookkeepingDeps {
  stock: typeof notifyPosStockDepletion;
  loyverse: typeof notifyLoyversePosSale;
  vouchers: typeof burnPosRedemptions;
  activity: typeof notifyPosSaleActivity;
  capture: typeof notifyCustomerCapture;
}

/**
 * Loaded at call time, like `lib/convex-provider.tsx` does for the same
 * reason: every notifier reaches `lib/authorized-post.ts` → `expo-constants`,
 * a native module that would otherwise be dragged into every logic test that
 * imports this file. Tests pass their own deps and never trigger the load.
 */
async function liveDeps(): Promise<PosSaleBookkeepingDeps> {
  const [stock, loyverse, vouchers, activity, capture] = await Promise.all([
    import("../pos-stock-notify"),
    import("../loyverse-notify"),
    import("../voucher-service"),
    import("../staff-activity/report-pos-sale"),
    import("../customers/capture"),
  ]);
  return {
    stock: stock.notifyPosStockDepletion,
    loyverse: loyverse.notifyLoyversePosSale,
    vouchers: vouchers.burnPosRedemptions,
    activity: activity.notifyPosSaleActivity,
    capture: capture.notifyCustomerCapture,
  };
}

/** The short reference Loyverse shows for a counter sale. */
export function loyverseOrderNumber(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}

export async function runPosSaleBookkeeping(
  facts: PosSaleBookkeepingFacts,
  injectedDeps?: PosSaleBookkeepingDeps
): Promise<PosSaleBookkeepingOutcome> {
  const deps = injectedDeps ?? (await liveDeps());
  const { tenantId, orderId, bookkeeping } = facts;
  const [stock] = await Promise.all([
    deps.stock(tenantId, orderId, bookkeeping.stockItems, "pos"),
    facts.skipReports ? Promise.resolve() : runReports(facts, deps).then(() => checkpointReports(facts)),
  ]);
  // An injected notifier that predates the outcome answers nothing: it ran.
  return { stock: stock ?? "ok" };
}

async function checkpointReports(facts: PosSaleBookkeepingFacts): Promise<void> {
  if (!facts.onReportsDone) return;
  try {
    await facts.onReportsDone();
  } catch (error) {
    // The reports landed; only the checkpoint is lost, so a crash before the
    // stock call settles could repeat them — exactly the risk before it existed.
    console.warn(`[pos] Could not record that order ${facts.orderId}'s reports ran:`, error);
  }
}

/** Everything but stock — none of it is idempotent, so it runs once. */
async function runReports(facts: PosSaleBookkeepingFacts, deps: PosSaleBookkeepingDeps): Promise<void> {
  const { tenantId, orderId, backend, bookkeeping } = facts;
  await Promise.all([
    deps.loyverse(tenantId, loyverseOrderNumber(orderId), bookkeeping.loyverseLines),
    deps.vouchers(tenantId, orderId, bookkeeping.discountLines, bookkeeping.outletId),
    deps.activity(tenantId, {
      backend,
      orderId,
      total: bookkeeping.total,
      outletId: bookkeeping.outletId,
    }),
    deps.capture(tenantId, {
      backend,
      orderId,
      name: bookkeeping.customerName,
      contact: bookkeeping.customerContact,
      customerData: bookkeeping.customerData,
      total: bookkeeping.total,
      createdAt: new Date(facts.createdAt).toISOString(),
      channel: bookkeeping.channel,
      items: bookkeeping.captureItems,
    }),
  ]);
}
