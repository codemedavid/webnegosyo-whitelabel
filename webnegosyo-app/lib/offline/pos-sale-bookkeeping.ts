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
 */

import type { OrderBackend } from "../order-backend";
import type { notifyPosStockDepletion } from "../pos-stock-notify";
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
): Promise<void> {
  const deps = injectedDeps ?? (await liveDeps());
  const { tenantId, orderId, backend, bookkeeping } = facts;
  await Promise.all([
    deps.stock(tenantId, orderId, bookkeeping.stockItems),
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
