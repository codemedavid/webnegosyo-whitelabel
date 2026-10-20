/**
 * Only the part of a stored discount these rows need.
 *
 * Declared structurally rather than importing `OrderDiscountPayload` so the
 * function states its real requirement: a full payload satisfies it, and so
 * does anything else carrying a total and its lines.
 */
/**
 * Deliberately a structural subset of the stored payload, so both backends'
 * shapes fit without this module depending on either. The extra keys the real
 * payload carries are declared optional rather than omitted, so a caller can
 * pass one as a literal.
 */
export interface SummarisableDiscount {
  total: number;
  lines: readonly {
    label: string;
    amount: number;
    /** The voucher's code, when a voucher rather than an open discount. */
    code?: string;
    voucherId?: string;
    /** Line-specific discounts: `{ lineKey: "line-<index>", units }[]`. Untrusted. */
    items?: unknown;
  }[];
  deliveryDiscount?: number;
  allocationsByLine?: Record<string, number>;
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
  /**
   * The voucher's code, on discount rows that came from one.
   *
   * The label is the voucher's NAME, which two vouchers can share. A merchant
   * reconciling a day's takings, and a customer disputing a bill, both work
   * from the code.
   */
  code?: string;
  /**
   * The dishes a line-specific discount came off ("Fries ×1"): a unit-limited
   * voucher or a cashier's item discount. Absent on order-wide discounts.
   */
  items?: readonly DiscountedDish[];
}

export interface DiscountedDish {
  name: string;
  units: number;
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
  /** The order's dish names by line position, so `line-<index>` reads as a dish. */
  itemNames?: readonly string[];
}

const UNKNOWN_DISH = "Item";

/** "Fries ×1, Soda ×2" — thermal printers pass `x` (no × in their code page). */
export function discountItemsText(items: readonly DiscountedDish[], times = "×"): string {
  return items.map((item) => `${item.name} ${times}${item.units}`).join(", ");
}

/** The dishes a stored line names, shape-checked; undefined when none. */
function discountedDishes(items: unknown, itemNames: readonly string[] | undefined): DiscountedDish[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const dishes = items.flatMap((item: unknown) => {
    const candidate = item as { lineKey?: unknown; units?: unknown } | null;
    const match = typeof candidate?.lineKey === "string" ? /^line-(\d+)$/.exec(candidate.lineKey) : null;
    const units = Number(candidate?.units);
    if (!Number.isInteger(units) || units < 1) return [];
    const name = match ? itemNames?.[Number(match[1])] : undefined;
    return [{ name: name && name.trim() !== "" ? name : UNKNOWN_DISH, units }];
  });
  return dishes.length > 0 ? dishes : undefined;
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
    const items = discountedDishes(line.items, input.itemNames);
    rows.push({
      kind: "discount",
      label: line.label,
      amount: line.amount,
      ...(line.code ? { code: line.code } : {}),
      ...(items ? { items } : {}),
    });
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
