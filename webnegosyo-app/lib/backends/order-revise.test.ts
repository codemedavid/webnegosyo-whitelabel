/**
 * The rows an order edit writes, and the money row that settles it.
 *
 * These builders are the last line of defence before a real customer's bill is
 * rewritten. The register today trusts its own arithmetic — `createOrder` on
 * the platform backend writes `args.total` verbatim, with none of the price
 * flooring the web checkout does. An edit path that did the same would let a
 * bad client rewrite an order to any total it liked, so the totals here are
 * always recomputed and never taken from the caller.
 */

import {
  buildPaymentRow,
  buildRevisionRows,
  type PreviousOrderState,
  type ReviseOrderArgs,
} from "./order-revise";

const TENANT = "tenant-1";
const ORDER = "order-1";

function reviseArgs(overrides: Partial<ReviseOrderArgs> = {}): ReviseOrderArgs {
  return {
    orderId: ORDER,
    expectedRevisionNumber: 0,
    items: [
      {
        menuItemId: "item-latte",
        menuItemName: "Latte",
        quantity: 2,
        price: 100,
        subtotal: 200,
      },
    ],
    ...overrides,
  };
}

function previous(overrides: Partial<PreviousOrderState> = {}): PreviousOrderState {
  return {
    revisionNumber: 0,
    status: "confirmed",
    total: 100,
    items: [
      {
        menuItemId: "item-latte",
        menuItemName: "Latte",
        quantity: 1,
        price: 100,
        subtotal: 100,
      },
    ],
    ...overrides,
  };
}

describe("buildRevisionRows", () => {
  it("recomputes the order total from the items", () => {
    const { orderPatch } = buildRevisionRows(TENANT, reviseArgs(), previous());

    expect(orderPatch.total).toBe(200);
  });

  it("ignores a caller-supplied total", () => {
    // A client that claims the order is worth ₱1 must not be believed.
    const { orderPatch } = buildRevisionRows(
      TENANT,
      { ...reviseArgs(), total: 1 } as ReviseOrderArgs,
      previous(),
    );

    expect(orderPatch.total).toBe(200);
  });

  it("forces each line's subtotal to price x quantity", () => {
    const { itemRows } = buildRevisionRows(
      TENANT,
      reviseArgs({
        items: [
          {
            menuItemId: "item-latte",
            menuItemName: "Latte",
            quantity: 2,
            price: 100,
            subtotal: 5, // client drift, or a tampered payload
          },
        ],
      }),
      previous(),
    );

    expect(itemRows[0].subtotal).toBe(200);
  });

  /**
   * The row must be internally consistent: the stored price is rounded for
   * storage, so the stored subtotal has to be built from that same rounded
   * price. Deriving it from the raw submitted price instead writes a line whose
   * own numbers contradict each other — a printed receipt showing "10.01 x 3 =
   * 30.02", on the one feature whose entire purpose is a bill that stays
   * defensible weeks later.
   *
   * The Convex backend is pinned to the same rule in
   * `convex-template/convex/orderRevise.test.ts`; the two must not drift.
   */
  it("builds the subtotal from the price it actually stores", () => {
    const { itemRows } = buildRevisionRows(
      TENANT,
      reviseArgs({
        items: [
          {
            menuItemId: "item-latte",
            menuItemName: "Latte",
            quantity: 3,
            price: 10.005,
            subtotal: 30.015,
          },
        ],
      }),
      previous(),
    );

    expect(itemRows[0].price).toBe(10.01);
    expect(itemRows[0].subtotal).toBe(30.03);
    expect(itemRows[0].subtotal).toBe(
      Math.round(itemRows[0].price * itemRows[0].quantity * 100) / 100,
    );
  });

  /**
   * Mirrors the Convex rule in `convex-template/convex/orderRevise.test.ts` and
   * the client gate in `lib/order-edit-guards.ts`. All three must agree, or a
   * merchant's protection depends on which backend they happen to be on.
   */
  it("refuses to edit an order the kitchen has started", () => {
    expect(() =>
      buildRevisionRows(TENANT, reviseArgs(), previous({ status: "preparing" })),
    ).toThrow(/kitchen/i);
  });

  it("refuses to edit an order that is ready, delivered or cancelled", () => {
    for (const status of ["ready", "delivered", "cancelled"]) {
      expect(() =>
        buildRevisionRows(TENANT, reviseArgs(), previous({ status })),
      ).toThrow();
    }
  });

  it("still allows a pending or confirmed order", () => {
    for (const status of ["pending", "confirmed"]) {
      expect(() =>
        buildRevisionRows(TENANT, reviseArgs(), previous({ status })),
      ).not.toThrow();
    }
  });

  it("adds the delivery fee and service charge to the total", () => {
    const { orderPatch } = buildRevisionRows(
      TENANT,
      reviseArgs({ deliveryFee: 50, serviceChargeAmount: 20 }),
      previous(),
    );

    expect(orderPatch.total).toBe(270);
  });

  it("bumps the revision number and stamps who edited it", () => {
    const { orderPatch } = buildRevisionRows(
      TENANT,
      reviseArgs({
        expectedRevisionNumber: 3,
        revisedBy: "user-9",
        editedAt: "2026-07-29T10:00:00.000Z",
      }),
      previous({ revisionNumber: 3 }),
    );

    expect(orderPatch.revision_number).toBe(4);
    expect(orderPatch.edited_by).toBe("user-9");
    expect(orderPatch.edited_at).toBe("2026-07-29T10:00:00.000Z");
  });

  it("recounts item_count from the edited items", () => {
    const { orderPatch } = buildRevisionRows(TENANT, reviseArgs(), previous());

    expect(orderPatch.item_count).toBe(2);
  });

  it("snapshots both sides of the edit into the revision row", () => {
    const { revision } = buildRevisionRows(TENANT, reviseArgs(), previous());

    expect(revision).toMatchObject({
      tenant_id: TENANT,
      order_id: ORDER,
      revision_number: 1,
      total_before: 100,
      total_after: 200,
    });
    expect(revision.items_before).toHaveLength(1);
    expect(revision.items_after).toHaveLength(1);
  });

  it("refuses an edit built against a stale revision number", () => {
    // Two staff opened the same order; the first already saved.
    expect(() =>
      buildRevisionRows(TENANT, reviseArgs({ expectedRevisionNumber: 0 }), previous({ revisionNumber: 1 })),
    ).toThrow(/changed|stale|another/i);
  });

  it("refuses to empty an order", () => {
    // Removing every item is a cancellation, which has its own path and its
    // own stock and refund consequences.
    expect(() => buildRevisionRows(TENANT, reviseArgs({ items: [] }), previous())).toThrow(
      /cancel/i,
    );
  });

  it("refuses a non-positive quantity", () => {
    expect(() =>
      buildRevisionRows(
        TENANT,
        reviseArgs({
          items: [
            { menuItemId: "i", menuItemName: "X", quantity: 0, price: 10, subtotal: 0 },
          ],
        }),
        previous(),
      ),
    ).toThrow(/quantity/i);
  });

  it("refuses an implausible price", () => {
    expect(() =>
      buildRevisionRows(
        TENANT,
        reviseArgs({
          items: [
            {
              menuItemId: "i",
              menuItemName: "X",
              quantity: 1,
              price: 99_999_999,
              subtotal: 99_999_999,
            },
          ],
        }),
        previous(),
      ),
    ).toThrow(/price/i);
  });

  it("refuses a negative price", () => {
    expect(() =>
      buildRevisionRows(
        TENANT,
        reviseArgs({
          items: [
            { menuItemId: "i", menuItemName: "X", quantity: 1, price: -5, subtotal: -5 },
          ],
        }),
        previous(),
      ),
    ).toThrow(/price/i);
  });
});

describe("buildPaymentRow", () => {
  it("builds a charge row", () => {
    const row = buildPaymentRow(TENANT, {
      orderId: ORDER,
      kind: "charge",
      amount: 120,
      paymentMethodName: "Cash",
      recordedBy: "user-9",
    });

    expect(row).toMatchObject({
      tenant_id: TENANT,
      order_id: ORDER,
      kind: "charge",
      amount: 120,
      payment_method_name: "Cash",
      recorded_by: "user-9",
    });
  });

  it("builds a refund row carrying its reference and proof", () => {
    const row = buildPaymentRow(TENANT, {
      orderId: ORDER,
      kind: "refund",
      amount: 40,
      paymentMethodName: "GCash",
      reference: "  REF-123  ",
      proofUrl: "https://img/proof.jpg",
    });

    expect(row).toMatchObject({
      kind: "refund",
      amount: 40,
      reference: "REF-123",
      proof_url: "https://img/proof.jpg",
    });
  });

  it("stores the amount unsigned, letting the kind carry the direction", () => {
    // A signed refund row that also said kind='refund' would double-negate.
    const row = buildPaymentRow(TENANT, { orderId: ORDER, kind: "refund", amount: 40 });

    expect(row.amount).toBe(40);
  });

  it("refuses a zero or negative amount", () => {
    expect(() =>
      buildPaymentRow(TENANT, { orderId: ORDER, kind: "charge", amount: 0 }),
    ).toThrow(/amount/i);
    expect(() =>
      buildPaymentRow(TENANT, { orderId: ORDER, kind: "refund", amount: -1 }),
    ).toThrow(/amount/i);
  });

  it("refuses a non-finite amount", () => {
    expect(() =>
      buildPaymentRow(TENANT, { orderId: ORDER, kind: "charge", amount: Number.NaN }),
    ).toThrow(/amount/i);
  });

  it("rounds the amount to centavos", () => {
    const row = buildPaymentRow(TENANT, {
      orderId: ORDER,
      kind: "charge",
      amount: 10.005,
    });

    expect(row.amount).toBe(10.01);
  });

  it("writes null rather than undefined for absent optional fields", () => {
    const row = buildPaymentRow(TENANT, { orderId: ORDER, kind: "charge", amount: 50 });

    expect(row.reference).toBeNull();
    expect(row.proof_url).toBeNull();
    expect(row.outlet_id).toBeNull();
  });
});

/**
 * Recording WHICH discount an edit ended up with.
 *
 * `reviseOrder` had exactly one channel for everything that is neither a line
 * item nor delivery: `serviceChargeAmount`. That was enough to make the TOTAL
 * right, and it is how the re-priced discount has always travelled.
 *
 * It is not enough to keep the order HONEST. The stored discount payload is
 * written once, at order creation, and never again — so an edit that re-priced
 * a voucher, or applied a new one, left the order showing its original discount
 * rows beside a total those rows no longer add up to. The merchant sees
 * "20% off −₱40" on a bill that was actually discounted ₱60, and nothing on
 * screen explains the difference.
 *
 * So the revise carries the payload it settled on. Omitted means "unchanged",
 * because the overwhelming majority of edits do not touch the discount and
 * blanking it on every save would erase the original.
 */
describe("buildRevisionRows discount payload", () => {
  const DISCOUNT = {
    total: 60,
    deliveryDiscount: 0,
    lines: [{ label: "20% off", amount: 60, code: "SAVE20", voucherId: "v-1" }],
    allocationsByLine: {},
  };

  it("writes the settled discount onto the order", () => {
    const { orderPatch } = buildRevisionRows(
      "tenant-1",
      reviseArgs({ discount: DISCOUNT }),
      previous(),
    );

    expect(orderPatch.discount_data).toEqual(DISCOUNT);
  });

  /** Most edits never touch the discount; blanking it would erase the original. */
  it("leaves the stored discount alone when the edit did not settle one", () => {
    const { orderPatch } = buildRevisionRows("tenant-1", reviseArgs({}), previous());

    expect(orderPatch).not.toHaveProperty("discount_data");
  });

  /**
   * Removing the last code IS a change, and has to be distinguishable from
   * "did not touch it" — otherwise the order keeps discount rows for a voucher
   * that no longer applies.
   */
  it("clears the stored discount when the edit settled on none", () => {
    const { orderPatch } = buildRevisionRows(
      "tenant-1",
      reviseArgs({ discount: null }),
      previous(),
    );

    expect(orderPatch.discount_data).toBeNull();
  });

  it("still totals from serviceChargeAmount, not from the payload", () => {
    // The payload is a RECORD of what was decided. Totalling from it as well
    // would deduct the discount twice.
    const { orderPatch } = buildRevisionRows(
      "tenant-1",
      reviseArgs({ discount: DISCOUNT, serviceChargeAmount: -60 }),
      previous(),
    );

    expect(orderPatch.total).toBe(140);
  });
});
