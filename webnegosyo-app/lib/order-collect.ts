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
import type { LedgerState } from "./order-ledger";
import { hasPermission, type StaffPermissionHolder } from "./staff-permissions";
import { computeChange } from "./pos-cash";

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
  /** How far the settlement ledger can be trusted. See `order-ledger`. */
  ledger: LedgerState;
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
  ledger,
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
  if (ledger === "unavailable") {
    return {
      allowed: false,
      reason:
        "This order's payment history could not be loaded, so no payment can be taken safely.",
    };
  }

  // Here the balance IS trustworthy — nothing can have been paid through a
  // deployment with no ledger. But the same bundle is missing the mutation that
  // records the payment, so the block is about the store, not the order.
  if (ledger === "absent") {
    return {
      allowed: false,
      reason:
        "This store needs a backend update before payments can be recorded here. " +
        "Ask support to redeploy the store, then try again.",
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

export type CashCollect =
  | { ok: true; amount: number; cashTendered: number; changeDue: number }
  | { ok: false; error: string };

export interface CashCollectInput {
  /** What is being collected — the balance unless the cashier lowered it. */
  amountRaw: string;
  /** What the customer handed over. */
  cashRaw: string;
  balanceDue: number;
}

/**
 * A cash collection: the amount rules of {@link validateCollectAmount}, plus
 * the cash handed over and the change owed on it — the same arithmetic the
 * register's tender screen uses (`computeChange`).
 *
 * The ledger records `amount`, never the cash: the change went back into the
 * customer's hand, so counting it as paid would overstate the drawer.
 */
export function validateCashCollect({
  amountRaw,
  cashRaw,
  balanceDue,
}: CashCollectInput): CashCollect {
  const trimmedCash = (cashRaw ?? "").trim();
  if (trimmedCash === "") return { ok: false, error: "Enter the cash the customer handed over." };

  const cashTendered = Number(trimmedCash);
  if (!Number.isFinite(cashTendered) || cashTendered <= 0) {
    return { ok: false, error: "Enter the cash as a number, like 500." };
  }

  const amount = validateCollectAmount(amountRaw, balanceDue);
  if (!amount.ok) return amount;

  const change = computeChange(amount.amount, cashTendered);
  if (!change.isSufficient) {
    return {
      ok: false,
      error:
        `${formatPesos(cashTendered)} does not cover ${formatPesos(amount.amount)}. ` +
        "Enter more cash, or collect a smaller amount.",
    };
  }

  return { ok: true, amount: amount.amount, cashTendered, changeDue: change.changeDue };
}

/**
 * The line kept on the settlement row for a cash collection, so the cash and
 * change survive on the ledger (which has no columns for them) and can be
 * read back when the drawer does not reconcile. Nothing for other methods.
 */
export function collectLedgerNote({
  cashTendered,
  changeDue,
}: {
  cashTendered?: number;
  changeDue?: number;
}): string | undefined {
  if (cashTendered === undefined || changeDue === undefined) return undefined;
  return `Cash received ${formatPesos(cashTendered)} · change ${formatPesos(changeDue)}`;
}

export interface CollectMethodOption {
  id: string;
  name: string;
  isCash?: boolean;
}

/**
 * Which method the collect sheet opens on: the one the customer picked at
 * checkout when it is still offered, else cash (most bills settled later are
 * settled at the counter), else the first — so the common case is one tap.
 */
export function defaultCollectMethodId(
  methods: readonly CollectMethodOption[],
  preferredName: string | null | undefined,
): string | null {
  const wanted = preferredName?.trim().toLowerCase();
  const byName = wanted
    ? methods.find((method) => method.name.trim().toLowerCase() === wanted)
    : undefined;
  return (byName ?? methods.find((method) => method.isCash) ?? methods[0])?.id ?? null;
}
