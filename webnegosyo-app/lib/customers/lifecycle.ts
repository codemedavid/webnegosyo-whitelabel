/**
 * Telling the platform that an order moved, so the customer ledger keeps up.
 *
 * The ledger behind the Customer Hub is written once, when the order is
 * captured, and was never touched again — so a cancelled order counted as a
 * customer visit forever, and no loyalty rule could tell a settled sale from an
 * open ticket. The register is where most of those transitions happen.
 *
 * Same contract as its sibling `capture.ts`, and for the same reason: by the
 * time this runs the real change is already committed to the tenant's own
 * backend, and this is only the platform-side projection catching up. So
 * **nothing here throws**. A ledger row that lags is recoverable by a re-sync;
 * a register that refuses to advance a ticket because a bookkeeping call failed
 * is not.
 */

import { postAuthorized } from "../authorized-post";
import type { LifecycleSyncPlan } from "./lifecycle-plan";

const SYNC_PATH = "/api/customers/sync-order-lifecycle";

/**
 * Post one lifecycle event. Fire-and-forget: callers must not await this on the
 * path that updates the screen.
 */
export async function notifyLifecycleSync(plan: LifecycleSyncPlan): Promise<void> {
  try {
    await postAuthorized(SYNC_PATH, {
      tenantId: plan.tenantId,
      backend: plan.backend,
      externalOrderId: plan.externalOrderId,
      // Omitted rather than sent blank when the event only settled payment —
      // the platform keeps whatever status it already has.
      ...(plan.status ? { status: plan.status } : {}),
      ...(plan.paymentStatus ? { paymentStatus: plan.paymentStatus } : {}),
      source: plan.source,
      outletId: plan.outletId,
    });
  } catch (error) {
    console.warn("[lifecycle-sync] could not report order lifecycle:", error);
  }
}
