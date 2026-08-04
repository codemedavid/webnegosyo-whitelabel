/**
 * Only the part of a stored discount these rows need.
 *
 * Declared structurally rather than importing `OrderDiscountPayload` so the
 * function states its real requirement: a full payload satisfies it, and so
 * does anything else carrying a total and its lines.
 */
export interface SummarisableDiscount {
  total: number;
  lines: readonly { label: string; amount: number }[];
}

/**
 * The money rows shown beneath an order's items.
 *
 * These rules already existed, buried inside `receipt-formatter.ts` as string
 * building. They live here so the screens can share them: an order screen that
 * lists items and then jumps straight to a total shows a discounted sale whose
 * lines do not add up, with nothing explaining the gap.
 *
 * Pure and render-agnostic. `amount` is always a MAGNITUDE — a screen and a
 * thermal printer show a deduction differently, so the shape says what a row
 * IS and leaves the minus sign to whoever draws it.
 */

export type OrderSummaryRowKind =
  | "subtotal"
  | "discount"
  | "service"
  | "delivery"
  | "total";

export interface OrderSummaryRow {
  kind: OrderSummaryRowKind;
  label: string;
  /** Always positive. `kind` carries the direction. */
  amount: number;
}

export interface OrderSummaryInput {
  subtotal: number;
  deliveryFee?: number | null;
  /**
   * The service charge already folded into `total` by `computeOrderTotals`.
   * Omitted by the backends that never store the figure — see the guard below.
   */
  serviceCharge?: number | null;
  discount?: SummarisableDiscount | null;
  /** What was actually charged. Authoritative. */
  total: number;
}

/** Cent-level tolerance, matching the receipt's own reconciliation check. */
const EPSILON = 0.01;

export function orderSummaryRows(input: OrderSummaryInput): OrderSummaryRow[] {
  const rows: OrderSummaryRow[] = [];

  const deliveryFee = input.deliveryFee ?? 0;
  const hasDelivery = deliveryFee > 0;

  // Guarded exactly like the delivery fee: shown only when it was actually
  // charged, so a pickup order does not carry a ₱0.00 row of pure noise.
  const serviceCharge = input.serviceCharge ?? 0;
  const hasServiceCharge = serviceCharge > 0;

  // A corrupt amount is dropped rather than shown: a NaN or negative
  // "deduction" would read as the shop charging extra.
  const discountLines = (input.discount?.lines ?? []).filter(
    (line) => Number.isFinite(line.amount) && line.amount > 0,
  );
  const hasDiscount = Boolean(input.discount);

  // A subtotal is shown only when something sits between the items and the
  // total. Otherwise it repeats a sum already on screen, and a discount would
  // be read with no stated starting point.
  if (hasDelivery || hasServiceCharge || hasDiscount) {
    rows.push({ kind: "subtotal", label: "Subtotal", amount: input.subtotal });
  }

  for (const line of discountLines) {
    rows.push({ kind: "discount", label: line.label, amount: line.amount });
  }

  if (input.discount) {
    // A discount total its lines do not account for still came off the bill —
    // a free-delivery voucher has no line of its own. Dropping it would leave
    // rows that cannot be reconciled to the total.
    const lineSum = discountLines.reduce((sum, line) => sum + line.amount, 0);
    const unaccounted = input.discount.total - lineSum;
    if (unaccounted > EPSILON) {
      rows.push({ kind: "discount", label: "Discount", amount: unaccounted });
    }
  }

  // Both fees sit after the deductions, because they are additions: a bill
  // reads down as goods, what came off, then what went on. The service charge
  // comes first of the two — it is derived from the food itself, so it belongs
  // beside the goods, while delivery is a separate carriage charge and reads
  // as the last thing added before the total.
  if (hasServiceCharge) {
    rows.push({ kind: "service", label: "Service charge", amount: serviceCharge });
  }

  if (hasDelivery) {
    rows.push({ kind: "delivery", label: "Delivery fee", amount: deliveryFee });
  }

  rows.push({ kind: "total", label: "Total", amount: input.total });

  return rows;
}
