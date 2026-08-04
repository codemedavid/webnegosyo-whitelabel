import {
  buildPosOrder,
  readPosPayment,
  POS_WALK_IN_NAME,
  type PosTender,
} from "./pos-order";
import { addLine, type PosCartLine } from "./pos-cart";
import { readOrderDiscount } from "./order-discount";

const cart: PosCartLine[] = addLine(
  addLine([], {
    menuItemId: "m-latte",
    name: "Latte",
    basePrice: 120,
    quantity: 2,
    selections: [
      {
        groupId: "g-size",
        groupName: "Size",
        optionId: "o-large",
        optionName: "Large",
        priceModifier: 20,
      },
    ],
  }),
  {
    menuItemId: "m-croissant",
    name: "Croissant",
    basePrice: 87.5,
    quantity: 1,
    selections: [],
    note: "warmed",
  },
);

const cashTender: PosTender = {
  methodName: "Cash",
  isCash: true,
  cashTendered: 500,
  changeDue: 132.5,
};

const gcashTender: PosTender = {
  methodName: "GCash",
  isCash: false,
  methodDetails: "0917 000 1234 / Juan D.",
  proofUrl: "https://ik.imagekit.io/x/payment-proofs/abc.jpg",
  proofFileId: "file_abc",
  reference: "REF-8842190",
};

const context = {
  cart,
  tender: cashTender,
  orderType: "dine_in",
  orderTypeId: "ot-1",
  clientOrderId: "cid-123",
  cashierId: "user-9",
};

describe("buildPosOrder", () => {
  it("marks the order as a counter sale so it skips the pending queue", () => {
    expect(buildPosOrder(context).source).toBe("pos");
  });

  it("carries the cart through as priced order items", () => {
    const { items } = buildPosOrder(context);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      menuItemId: "m-latte",
      menuItemName: "Latte",
      quantity: 2,
      price: 120,
      subtotal: 280,
    });
  });

  it("maps cart selections onto the variationSelections shape Convex expects", () => {
    const { items } = buildPosOrder(context);
    expect(items[0].variationSelections).toEqual([
      { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
    ]);
  });

  it("passes a kitchen note through as the item's special instructions", () => {
    const { items } = buildPosOrder(context);
    expect(items[1].specialInstructions).toBe("warmed");
  });

  it("counts units sold, not lines", () => {
    expect(buildPosOrder(context).itemCount).toBe(3);
  });

  it("totals the cart including the order type's service charge", () => {
    const withCharge = buildPosOrder({
      ...context,
      serviceCharge: { type: "percentage", value: 10 },
    });
    expect(withCharge.total).toBe(404.25); // 367.50 + 36.75
  });

  it("names the buyer as a walk-in when the cashier took no name", () => {
    const order = buildPosOrder(context);
    expect(order.customerName).toBe(POS_WALK_IN_NAME);
    expect(order.customerContact).toBe("");
  });

  it("keeps a customer name when the cashier typed one", () => {
    expect(buildPosOrder({ ...context, customerName: "Maria" }).customerName).toBe("Maria");
  });

  it("forwards the idempotency key so a double-tap cannot double-charge", () => {
    expect(buildPosOrder(context).clientOrderId).toBe("cid-123");
  });

  it("records the payment method name and details on the order", () => {
    const order = buildPosOrder({ ...context, tender: gcashTender });
    expect(order.paymentMethod).toBe("GCash");
    expect(order.paymentMethodDetails).toBe("0917 000 1234 / Juan D.");
  });

  it("stashes the cash tendered and change due in the POS payload", () => {
    const order = buildPosOrder(context);
    expect(order.customerData.pos).toMatchObject({
      cashTendered: 500,
      changeDue: 132.5,
      cashierId: "user-9",
    });
  });

  it("stashes the proof url and reference for a non-cash sale", () => {
    const order = buildPosOrder({ ...context, tender: gcashTender });
    expect(order.customerData.pos).toMatchObject({
      proofUrl: "https://ik.imagekit.io/x/payment-proofs/abc.jpg",
      proofFileId: "file_abc",
      reference: "REF-8842190",
    });
  });

  it("does not put cash fields on a non-cash sale", () => {
    const { pos } = buildPosOrder({ ...context, tender: gcashTender }).customerData;
    expect(pos.cashTendered).toBeUndefined();
    expect(pos.changeDue).toBeUndefined();
  });

  it("preserves any existing customerData rather than overwriting it", () => {
    const order = buildPosOrder({
      ...context,
      customerData: { scheduledLabel: "Tomorrow 9am" },
    });
    expect(order.customerData.scheduledLabel).toBe("Tomorrow 9am");
    expect(order.customerData.pos).toBeDefined();
  });

  it("refuses to build an order from an empty cart", () => {
    expect(() => buildPosOrder({ ...context, cart: [] })).toThrow(/empty/i);
  });

  it("refuses to build a cash order whose tender does not cover the total", () => {
    expect(() =>
      buildPosOrder({
        ...context,
        tender: { ...cashTender, cashTendered: 10, changeDue: 0 },
      }),
    ).toThrow(/insufficient/i);
  });
});

describe("readPosPayment", () => {
  it("reads back exactly what buildPosOrder wrote", () => {
    const order = buildPosOrder(context);
    expect(readPosPayment(order.customerData)).toEqual(order.customerData.pos);
  });

  it("returns null for an order that did not come from the register", () => {
    expect(readPosPayment({ scheduledLabel: "Tomorrow" })).toBeNull();
    expect(readPosPayment(undefined)).toBeNull();
    expect(readPosPayment(null)).toBeNull();
  });

  it("returns null rather than throwing on a malformed blob", () => {
    expect(readPosPayment({ pos: "not-an-object" })).toBeNull();
    expect(readPosPayment("nonsense")).toBeNull();
  });
});

/**
 * A discounted counter sale.
 *
 * The register prices vouchers locally, so `buildPosOrder` is where a discount
 * stops being a preview and becomes the amount a customer hands over. Two
 * things must be true at once: the total must be NET, and the breakdown must
 * be persisted — a receipt, a refund, and the merchant's books all need to
 * know what was taken off.
 */
describe("buildPosOrder with a discount", () => {
  // The fixture cart is 367.50.
  const discounted = {
    ...context,
    discounts: [{ label: "WELCOME10", amount: 24, voucherId: "v-1", code: "WELCOME10" }],
  };

  it("bills the discounted total, not the full one", () => {
    expect(buildPosOrder(discounted).total).toBe(343.5);
  });

  it("persists the breakdown where every backend can read it", () => {
    const order = buildPosOrder(discounted);

    expect(readOrderDiscount(order)).toEqual({
      total: 24,
      deliveryDiscount: 0,
      lines: [{ label: "WELCOME10", amount: 24, voucherId: "v-1", code: "WELCOME10" }],
      allocationsByLine: {},
    });
  });

  it("keeps the POS payment payload alongside the discount", () => {
    // Both ride in customerData; one must not overwrite the other.
    const order = buildPosOrder(discounted);

    expect(order.customerData.pos).toBeDefined();
    expect(order.customerData.discount).toBeDefined();
  });

  it("checks cash against the DISCOUNTED total", () => {
    // 343.50 due after the voucher. 350 covers it; refusing would send the
    // customer away over money they do not owe.
    const order = buildPosOrder({
      ...discounted,
      tender: { ...cashTender, cashTendered: 350 },
    });

    expect(order.total).toBe(343.5);
  });

  it("still refuses cash that does not cover the discounted total", () => {
    expect(() =>
      buildPosOrder({ ...discounted, tender: { ...cashTender, cashTendered: 100 } }),
    ).toThrow(/insufficient/i);
  });

  it("writes no discount key on an ordinary sale", () => {
    const order = buildPosOrder(context);

    expect(order.customerData.discount).toBeUndefined();
    expect(readOrderDiscount(order)).toBeNull();
  });

  it("writes no discount key when every line is worthless", () => {
    const order = buildPosOrder({ ...context, discounts: [{ label: "EMPTY", amount: 0 }] });

    expect(readOrderDiscount(order)).toBeNull();
  });
});
