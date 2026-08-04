/**
 * Whether staff may confirm a scanned pickup ticket.
 *
 * Pure, so the rule that stands between a customer and someone else's order
 * is testable without a camera or a network. The verification in verify.ts
 * proves the ticket is genuine; this decides what to do with a genuine one.
 */

import type { VerifiedPickupOrder } from "./verify";

export type PickupBlockReason = "wrong_tenant" | "cancelled";

/** The order is not yet marked ready, but staff may still hand it over. */
export type PickupWarning = "not_ready";

export type PickupDecision =
  | { decision: "confirm"; warning: PickupWarning | null }
  | { decision: "already_collected"; warning: null }
  | { decision: "block"; reason: PickupBlockReason; warning: null };

interface PickupTicketContext {
  /** Tenant encoded in the scanned ticket. */
  scannedTenantId: string;
  /** Tenant the signed-in staff member is currently working in. */
  sessionTenantId: string | null;
  order: Pick<VerifiedPickupOrder, "status">;
}

export function evaluatePickupTicket({
  scannedTenantId,
  sessionTenantId,
  order,
}: PickupTicketContext): PickupDecision {
  // Store check first, and before anything is said about the order. A staff
  // member must never learn the state of an order belonging to a store they
  // are not currently in — including a superadmin who has entered none.
  if (!sessionTenantId || sessionTenantId !== scannedTenantId) {
    return { decision: "block", reason: "wrong_tenant", warning: null };
  }

  if (order.status === "cancelled") {
    return { decision: "block", reason: "cancelled", warning: null };
  }

  // Double scans are routine — the customer re-shows the code, or two staff
  // scan the same bag. This is an outcome, not a failure.
  if (order.status === "delivered") {
    return { decision: "already_collected", warning: null };
  }

  // Kitchens routinely run ahead of their own status updates, so an order
  // that is still "preparing" may genuinely be sitting on the counter.
  // Warn, and let the person holding the bag decide.
  return {
    decision: "confirm",
    warning: order.status === "ready" ? null : "not_ready",
  };
}
