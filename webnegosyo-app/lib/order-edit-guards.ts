/**
 * Who may edit a placed order, and when.
 *
 * Editing rewrites a real customer's bill, so this gate is deliberately
 * conservative. Every refusal carries a reason the screen shows verbatim — a
 * disabled button with no explanation is how staff end up calling support.
 *
 * Pure lookups, no I/O.
 */

import type { OrderBackend } from "./order-backend";
import { hasPermission, type StaffPermissionHolder } from "./staff-permissions";

/** The outcome of a gate check. `reason` is user-facing copy. */
export interface EditGate {
  allowed: boolean;
  reason?: string;
}

const ALLOWED: EditGate = { allowed: true };

/**
 * Statuses past the point of editing. A delivered order has been handed over
 * and a cancelled one has already been reversed; changing either would
 * rewrite history rather than correct a live ticket.
 */
const FINAL_STATUSES: Record<string, string> = {
  delivered: "This order was already delivered and can no longer be edited.",
  cancelled: "This order was cancelled and can no longer be edited.",
};

/**
 * Backends that can accept the revise mutation.
 *
 * Per-tenant Supabase projects are absent on purpose: that backend has no
 * mutation path at all today, so its orders are read-only in every surface.
 */
const EDITABLE_BACKENDS: readonly OrderBackend[] = ["platform", "convex"];

export interface EditRequest {
  status: string;
  backend: OrderBackend;
  user: StaffPermissionHolder;
}

/**
 * May this person edit this order right now?
 *
 * Checks run cheapest-and-most-absolute first: a delivered order is not
 * editable by anyone, so reporting a missing permission there would send a
 * staff member to ask their manager for something that would not help.
 */
export function canEditOrder({ status, backend, user }: EditRequest): EditGate {
  const finalReason = FINAL_STATUSES[status];
  if (finalReason) return { allowed: false, reason: finalReason };

  if (!EDITABLE_BACKENDS.includes(backend)) {
    return {
      allowed: false,
      reason: "Editing orders is not supported on this store's order backend.",
    };
  }

  if (!hasPermission(user, "order_edit")) {
    return {
      allowed: false,
      reason: "You do not have permission to edit orders.",
    };
  }

  return ALLOWED;
}

/**
 * May this person issue a refund?
 *
 * Granted separately from ordinary editing because a refund moves money out of
 * the drawer — the one action in this flow that cannot be undone by editing
 * again.
 */
export function canIssueRefund(user: StaffPermissionHolder): EditGate {
  if (!hasPermission(user, "order_refund")) {
    return {
      allowed: false,
      reason: "You do not have permission to issue refunds.",
    };
  }
  return ALLOWED;
}
