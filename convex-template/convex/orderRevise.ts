/**
 * The rules an order edit obeys, extracted from `reviseOrder` / `recordPayment`.
 *
 * Deliberately free of Convex imports so it can be unit-tested by the platform
 * repo's Jest run (`convex-template/convex/orderRevise.test.ts`) rather than
 * only exercised by a deployed backend. Until this split, the code path that
 * rewrites a real customer's bill and moves money was covered by nothing —
 * neither Jest project reaches a Convex handler.
 *
 * The shared platform Supabase enforces the same rules in the merchant app's
 * `lib/backends/order-revise.ts`. These two implementations must agree: a
 * merchant on Convex is entitled to exactly the same guard rails as one on the
 * platform backend, so the guarantees are mirrored deliberately rather than
 * re-derived.
 *
 * The governing principle, same as the platform path: NOTHING about the money
 * comes from the caller. The total is recomputed from the items, each line's
 * subtotal is forced to `price x quantity`, and implausible values are refused
 * outright. Throwing beats writing a defensible-looking but wrong bill.
 *
 * Pure and side-effect free — no clock, no database, no mutation of its inputs.
 */

/** Guard rails mirroring the platform backend's `order-revise.ts`. */
const MAX_PRICE = 1_000_000;
const MAX_QUANTITY = 99;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The stored order, as far as the revision rules are concerned. */
export interface RevisableOrderLike {
  total: number;
  /** Absent on every order placed before order editing shipped. */
  revisionNumber?: number;
  status?: string;
}

/**
 * Statuses past the point of editing, keyed to the message the cashier sees.
 *
 * The line is drawn where the kitchen starts: up to `confirmed` nothing has
 * been cooked and a correction costs nothing, but from `preparing` the ticket
 * is on the line and the stock has already moved against the original items.
 *
 * Duplicated deliberately in `webnegosyo-app/lib/order-edit-guards.ts` (the
 * screen gate) and `lib/backends/order-revise.ts` (the platform write path),
 * the same arrangement `staff-permissions.ts` uses. All three must agree, or a
 * merchant's protection depends on which backend they happen to be on.
 */
const UNEDITABLE_STATUSES: Record<string, string> = {
  preparing:
    "The kitchen has already started this order, so it can no longer be edited.",
  ready: "This order is ready for handover and can no longer be edited.",
  delivered: "This order was already delivered and can no longer be edited.",
  cancelled: "This order was cancelled and can no longer be edited.",
};

/** One line as the edit screen submits it. */
export interface RevisedItemLike {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  price: number;
  subtotal?: number;
  [key: string]: unknown;
}

/**
 * A line after {@link priceRevisedItems} has forced its arithmetic. The
 * subtotal is no longer optional here — that is the whole point of the pass.
 */
export type PricedItem = RevisedItemLike & { subtotal: number };

/** One settlement row, as far as the cached total is concerned. */
export interface LedgerRowLike {
  kind: "charge" | "refund";
  amount: number;
}

/**
 * May this edit be applied to this order?
 *
 * Checks run most-absolute first. A stale revision is reported ahead of an
 * empty cart because if the order has moved on, nothing about the submission is
 * trustworthy — including its item list — and "re-open it" is the only useful
 * instruction.
 *
 * @throws if the edit is stale or would empty the order.
 */
export function assertRevisable(
  order: RevisableOrderLike,
  expectedRevisionNumber: number,
  items: readonly RevisedItemLike[],
): void {
  // Reported before the stale-revision check: a started ticket stays
  // uneditable however many times it is reopened, so "reopen and try again"
  // would send the cashier round a loop that never ends.
  const statusRefusal = order.status ? UNEDITABLE_STATUSES[order.status] : undefined;
  if (statusRefusal) throw new Error(statusRefusal);

  if ((order.revisionNumber ?? 0) !== expectedRevisionNumber) {
    throw new Error(
      "This order changed while you were editing it — reopen it and try again.",
    );
  }

  if (items.length === 0) {
    throw new Error("An order cannot be emptied by editing. Cancel it instead.");
  }
}

/**
 * Validate every line and force its arithmetic.
 *
 * The subtotal is DERIVED, never accepted: it is the only number the order
 * total is built from, so trusting a caller's value would make every other
 * check here decorative.
 *
 * @throws if any line carries an implausible quantity or price. The offending
 * item is named, so a cashier knows which line to fix.
 */
export function priceRevisedItems(
  items: readonly RevisedItemLike[],
): PricedItem[] {
  return items.map((item) => {
    if (
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_QUANTITY
    ) {
      throw new Error(
        `Invalid quantity for "${item.menuItemName}" — must be between 1 and ${MAX_QUANTITY}.`,
      );
    }

    if (!Number.isFinite(item.price) || item.price < 0 || item.price > MAX_PRICE) {
      throw new Error(`Invalid price for "${item.menuItemName}".`);
    }

    const price = round2(item.price);
    return { ...item, price, subtotal: round2(price * item.quantity) };
  });
}

/**
 * The order total, rebuilt from the priced lines.
 *
 * Call only with the output of {@link priceRevisedItems} — the subtotals are
 * trusted here precisely because that function derived them.
 */
export function computeRevisedTotal(
  priced: readonly PricedItem[],
  deliveryFee?: number,
  serviceChargeAmount?: number,
): number {
  const itemsTotal = priced.reduce((sum, item) => sum + item.subtotal, 0);
  return round2(itemsTotal + (deliveryFee ?? 0) + (serviceChargeAmount ?? 0));
}

/** Total units on the revised order, for the `itemCount` cache. */
export function countRevisedItems(priced: readonly PricedItem[]): number {
  return priced.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * The amount to store for one settlement.
 *
 * Stored unsigned — the row's `kind` carries the direction. A signed refund
 * amount alongside `kind = 'refund'` would double-negate and silently credit
 * the customer twice.
 *
 * @throws if the amount is not a positive, finite number.
 */
export function normalizePaymentAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("A payment amount must be a positive number.");
  }
  return round2(amount);
}

/**
 * Net collected across a ledger: charges minus refunds.
 *
 * Convex has no triggers, so this maintains the `amountPaid` cache the platform
 * backend gets from `sync_order_amount_paid`. It is deliberately NOT clamped at
 * zero: an over-refund is a real error a merchant has to be able to see.
 *
 * A non-finite row is skipped rather than allowed to turn the whole cache into
 * NaN — one corrupt row must not make every other order's balance unreadable.
 */
export function netAmountPaid(ledger: readonly LedgerRowLike[]): number {
  const net = ledger.reduce((sum, row) => {
    if (!Number.isFinite(row.amount)) return sum;
    return row.kind === "refund" ? sum - row.amount : sum + row.amount;
  }, 0);

  return round2(net);
}

/** The discount payload as it is stored, shaped loosely at the database edge. */
export interface StoredDiscountLike {
  total: number;
  deliveryDiscount?: number;
  lines?: unknown[];
  allocationsByLine?: Record<string, unknown>;
}

/**
 * Put the discount an edit settled on into the order's customer blob.
 *
 * Convex has no `discount_data` field — unlike the platform backend, the
 * discount rides inside `customerData` next to the customer's name, contact,
 * schedule and payment proof. So this replaces exactly one key and copies the
 * rest through.
 *
 * A wholesale overwrite would erase the customer's own details on the first
 * discounted edit, which is a far worse outcome than the stale discount row it
 * set out to fix. `null` removes the key rather than storing a zeroed payload,
 * which would otherwise render a discount heading with no rows beneath it.
 *
 * Returns a new object; the input is never mutated.
 */
export function mergeOrderDiscount(
  customerData: unknown,
  discount: StoredDiscountLike | null,
): Record<string, unknown> {
  const base =
    typeof customerData === "object" && customerData !== null && !Array.isArray(customerData)
      ? { ...(customerData as Record<string, unknown>) }
      : {};

  if (discount === null) {
    delete base.discount;
    return base;
  }

  return { ...base, discount };
}
