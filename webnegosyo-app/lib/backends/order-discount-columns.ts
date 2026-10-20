/**
 * The platform table's discount COLUMNS, kept in step with the blob.
 *
 * Every backend carries an order's discount breakdown in
 * `customerData.discount` — it is the only field Convex and tenant-owned
 * projects share. The platform table also has real columns for it
 * (`orders.discount_total`, `orders.discount_data`,
 * `order_items.discount_amount`), and those are what reports and the BIR
 * sales books aggregate. The register used to fill only the blob on create and
 * only the column on revise, so:
 *
 *   - every counter sale reported a discount of ₱0, and
 *   - an edited order kept a stale blob that every order screen still read.
 *
 * Both writes now go through here, so the blob and the columns cannot part.
 */

import { readOrderDiscount, type OrderDiscountPayload } from "../order-discount";

export interface OrderDiscountColumns {
  discount_total: number;
  discount_data: OrderDiscountPayload | null;
}

/** The columns a NEW order writes, read off the blob the register built. */
export function discountColumnsForCreate(
  customerData: Record<string, unknown> | null | undefined,
): OrderDiscountColumns {
  const payload = readOrderDiscount({ customerData });
  return {
    discount_total: payload ? payload.total : 0,
    discount_data: payload,
  };
}

export interface RevisionDiscountPatch extends OrderDiscountColumns {
  customer_data: Record<string, unknown>;
}

/**
 * What an edit writes about its discount — or nothing.
 *
 * `undefined` means the edit settled nothing, so the stored discount is left
 * alone (an old app build must not blank a discount it never knew about).
 * `null` means the order HAD a discount and now has none. Either way the blob
 * moves with the columns.
 */
export function discountPatchForRevision(
  discount: OrderDiscountPayload | null | undefined,
  previousCustomerData: Record<string, unknown> | null | undefined,
): RevisionDiscountPatch | undefined {
  if (discount === undefined) return undefined;

  const rest = Object.fromEntries(
    Object.entries(previousCustomerData ?? {}).filter(([key]) => key !== "discount"),
  );
  return {
    discount_total: discount ? discount.total : 0,
    discount_data: discount,
    customer_data: discount ? { ...rest, discount } : rest,
  };
}

/**
 * The discount fields a revision patch spreads in.
 *
 * Empty when the edit settled nothing. When the caller never read the stored
 * blob (`previousCustomerData` undefined) only the columns are written: a blob
 * rebuilt from nothing would erase the order's table, address and payment
 * details.
 */
export function revisionDiscountFields(
  discount: OrderDiscountPayload | null | undefined,
  previousCustomerData: Record<string, unknown> | null | undefined,
): Partial<RevisionDiscountPatch> {
  const patch = discountPatchForRevision(discount, previousCustomerData);
  if (!patch) return {};
  if (previousCustomerData === undefined) {
    return { discount_total: patch.discount_total, discount_data: patch.discount_data };
  }
  return patch;
}

/**
 * Each line's share of the discount, in line order.
 *
 * Allocations are keyed `line-<index>` (the checkout's convention, see
 * `src/lib/vouchers/order-pricing.ts`). A key that is absent, negative or not
 * a number is a line nothing was allocated to.
 */
export function lineDiscountAmounts(
  payload: OrderDiscountPayload | null,
  lineCount: number,
): number[] {
  return Array.from({ length: lineCount }, (_, index) => {
    const amount = payload?.allocationsByLine[`line-${index}`];
    return typeof amount === "number" && Number.isFinite(amount) && amount > 0
      ? amount
      : 0;
  });
}
