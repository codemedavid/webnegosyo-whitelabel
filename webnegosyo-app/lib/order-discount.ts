/**
 * Reading an order's discount on the register.
 *
 * PORT of `src/lib/order-discount.ts`. Kept in step by
 * `tests/unit/vouchers/order-discount-parity.test.ts`, which runs both copies
 * over the same fixtures — the register and the storefront read the same order
 * rows, so a reader that drifts makes the same sale print one discount on the
 * receipt and show another in admin.
 *
 * Only the READ half is ported. The register never writes a discount payload
 * itself: checkout does that server-side, and POS discounts go through
 * `buildPosOrder`. Porting `buildOrderDiscountPayload` too would be a second
 * copy of the arithmetic with no caller.
 *
 * Invariant worth restating here, because the receipt depends on it: an order's
 * `total` is ALWAYS already net of the discount, on every backend. This payload
 * is the breakdown — what to print, what to give back on a partial refund — and
 * never the source of the amount charged. Nothing may subtract it again.
 */

/** One deducted line as stored. */
export interface StoredDiscountLine {
  label: string;
  amount: number;
  voucherId?: string;
  code?: string;
}

export interface OrderDiscountPayload {
  /** Total taken off, lines plus delivery. */
  total: number;
  /** The part that came off delivery rather than the food. */
  deliveryDiscount: number;
  lines: StoredDiscountLine[];
  /** Per cart line, so a partial refund can be computed later. */
  allocationsByLine: Record<string, number>;
}

/** Shape-checks an untyped blob before trusting it. */
function asPayload(value: unknown): OrderDiscountPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const candidate = value as Partial<OrderDiscountPayload>;
  if (typeof candidate.total !== "number" || !Number.isFinite(candidate.total)) return null;

  return {
    total: candidate.total,
    deliveryDiscount:
      typeof candidate.deliveryDiscount === "number" ? candidate.deliveryDiscount : 0,
    lines: Array.isArray(candidate.lines) ? candidate.lines : [],
    allocationsByLine:
      typeof candidate.allocationsByLine === "object" && candidate.allocationsByLine !== null
        ? candidate.allocationsByLine
        : {},
  };
}

/**
 * Reads the discount off an order from whichever backend produced it.
 *
 * The `discount_data` column wins over the blob: a tenant migrated from Convex
 * to Postgres can carry both, and the column is what reporting queries
 * aggregate. Returns null — never throws — for orders with no discount and for
 * malformed blobs, because the blob is untyped at the database edge and a
 * reader must not assume its shape. A receipt that throws is a sale the cashier
 * cannot hand over.
 */
export function readOrderDiscount(order: unknown): OrderDiscountPayload | null {
  if (typeof order !== "object" || order === null) return null;

  const row = order as {
    discount_data?: unknown;
    customerData?: unknown;
    customer_data?: unknown;
  };

  const fromColumn = asPayload(row.discount_data);
  if (fromColumn) return fromColumn;

  const blob = row.customerData ?? row.customer_data;
  if (typeof blob !== "object" || blob === null) return null;

  return asPayload((blob as { discount?: unknown }).discount);
}
