/**
 * Taking payment on an order that is already placed.
 *
 * The register's tender screen settles a sale it is ringing up. This settles a
 * bill that was rung up earlier and left unpaid — the pickup that was never
 * charged, the delivery paid on arrival, the counter sale the cashier let walk.
 * Routing that through an order EDIT, which was the only path before, rewrites
 * a bill nobody disputed just to record money changing hands.
 *
 * Pure lookups and arithmetic, no I/O. Both the gate and the amount rule are
 * here rather than on the screen because Jest cannot import `app/`.
 */

import { isOrderInScope, type BranchScope, type ScopedOrderLike } from "./branch-scope";
import type { OrderBackend } from "./order-backend";
import { hasPermission, type StaffPermissionHolder } from "./staff-permissions";

export interface CollectGate {
  allowed: boolean;
  /** User-facing copy, shown verbatim. */
  reason?: string;
}

const ALLOWED: CollectGate = { allowed: true };

/**
 * Balances under this are square. The same sub-centavo drift `order-balance`
 * discounts, for the same reason: it is a float artifact, not money.
 */
const SETTLED_EPSILON = 0.005;

/**
 * Backends that can accept the payment mutation.
 *
 * Per-tenant Supabase projects are absent for the same reason they cannot take
 * an edit: that backend has no mutation path at all today.
 */
const COLLECTABLE_BACKENDS: readonly OrderBackend[] = ["platform", "convex"];

export interface CollectRequest {
  status: string;
  backend: OrderBackend;
  user: StaffPermissionHolder;
  /** What the customer still owes. Negative means the merchant owes them. */
  balance: number;
  /** False when the ledger query failed — the balance is then a guess. */
  isLedgerAvailable: boolean;
  scope?: BranchScope;
  order?: ScopedOrderLike;
}

/**
 * May this person take money against this order right now?
 *
 * Deliberately more permissive about STATUS than editing is. Editing is barred
 * from `preparing` onwards because it desynchronises the bill from the food;
 * collecting does not touch the bill at all, and most orders are in fact paid
 * at handover. Only a cancelled order is closed to it — there is no bill left
 * to settle.
 *
 * Checks run most-absolute first, so nobody is sent to ask a manager for a
 * permission that would not have helped.
 */
export function canCollectPayment({
  status,
  backend,
  user,
  balance,
  isLedgerAvailable,
  scope,
  order,
}: CollectRequest): CollectGate {
  if (status === "cancelled") {
    return {
      allowed: false,
      reason: "This order was cancelled, so there is nothing left to collect.",
    };
  }

  // Without the ledger the balance on screen is a guess, and collecting against
  // a guess charges a customer who may have already paid.
  if (!isLedgerAvailable) {
    return {
      allowed: false,
      reason:
        "This order's payment history could not be loaded, so no payment can be taken safely.",
    };
  }

  if (!COLLECTABLE_BACKENDS.includes(backend)) {
    return {
      allowed: false,
      reason: "Recording payments is not supported on this store's order backend.",
    };
  }

  if (Math.abs(balance) < SETTLED_EPSILON) {
    return { allowed: false, reason: "This order is already fully paid." };
  }

  // A refund moves money OUT of the drawer and is gated by `order_refund`.
  // Offering it here as a negative collection would route around that.
  if (balance < 0) {
    return {
      allowed: false,
      reason: "This order is overpaid. Issue a refund from the register instead.",
    };
  }

  // Taking money at the counter is the register's job, so it is the register's
  // permission. `orders` on its own only advances an order's status.
  if (!hasPermission(user, "pos")) {
    return { allowed: false, reason: "You do not have permission to take payments." };
  }

  // Reads are narrowed to the branch already, but a write addressed by id never
  // passes through that filter. Same predicate as the edit path.
  if (scope && !isOrderInScope(scope, order ?? {})) {
    return {
      allowed: false,
      reason: "This order was taken by another branch and cannot be settled here.",
    };
  }

  return ALLOWED;
}

export type CollectAmount =
  | { ok: true; amount: number }
  | { ok: false; error: string };

/** One centavo of slack, so a balance of 148.999999 still accepts "149". */
const OVERPAY_TOLERANCE = 0.01;

function formatPesos(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}

/**
 * Is this a payment the cashier may record?
 *
 * The ceiling is the rule worth having. Over-collecting turns a settled order
 * into one the merchant owes money back on, and unwinding it needs the refund
 * permission the person at the counter may not hold.
 */
export function validateCollectAmount(raw: string, balanceDue: number): CollectAmount {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { ok: false, error: "Enter an amount to collect." };

  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) {
    return { ok: false, error: "Enter an amount as a number, like 149.50." };
  }

  if (amount <= 0) {
    return { ok: false, error: "Enter an amount more than zero." };
  }

  if (amount > balanceDue + OVERPAY_TOLERANCE) {
    return {
      ok: false,
      error: `Only ${formatPesos(balanceDue)} is still owed on this order.`,
    };
  }

  return { ok: true, amount };
}
