/**
 * Manual delivery details on a counter sale.
 *
 * The register historically had no concept of delivery: `discountBasis`
 * hardcoded `deliveryFee: 0` and `buildPosOrder` never emitted a fee, so a
 * delivery rung up at the counter billed the customer nothing for it and the
 * day's revenue quietly understated every such sale. These tests pin the new
 * behaviour: an optional fee that flows into ONE total via `cartTotals`, and
 * optional address/phone that ride the `customerData` blob so every
 * already-deployed backend accepts them.
 */

import {
  chargeableDeliveryFee,
  clearedSaleDelivery,
  deliveryCustomerData,
  parseDeliveryFee,
  type PosDeliveryDetails,
} from "./pos-delivery";
import { addLine, cartTotals, type PosCartLine } from "./pos-cart";
import { buildPosOrder } from "./pos-order";
import type { PosTender } from "./pos-order";

const delivery = (overrides: Partial<PosDeliveryDetails>): PosDeliveryDetails => ({
  ...clearedSaleDelivery().delivery,
  ...overrides,
});

describe("clearedSaleDelivery", () => {
  it("returns a no-delivery state for a fresh sale", () => {
    expect(clearedSaleDelivery()).toEqual({
      delivery: { fee: null, address: "", phone: "" },
    });
  });

  it("returns a new object each time so no two sales share state", () => {
    expect(clearedSaleDelivery().delivery).not.toBe(clearedSaleDelivery().delivery);
  });
});

describe("parseDeliveryFee", () => {
  it("parses a plain peso amount", () => {
    expect(parseDeliveryFee("50")).toBe(50);
  });

  it("rounds to centavos", () => {
    expect(parseDeliveryFee("49.999")).toBe(50);
  });

  it("returns null for empty input — the field is optional", () => {
    expect(parseDeliveryFee("")).toBeNull();
    expect(parseDeliveryFee("   ")).toBeNull();
  });

  it("refuses garbage and non-positive amounts", () => {
    expect(parseDeliveryFee("abc")).toBeNull();
    expect(parseDeliveryFee("-20")).toBeNull();
    expect(parseDeliveryFee("0")).toBeNull();
    expect(parseDeliveryFee("Infinity")).toBeNull();
  });
});

describe("chargeableDeliveryFee", () => {
  it("returns the fee when one was attached", () => {
    expect(chargeableDeliveryFee(delivery({ fee: 75 }))).toBe(75);
  });

  it("returns zero for a sale with no delivery", () => {
    expect(chargeableDeliveryFee(delivery({}))).toBe(0);
    expect(chargeableDeliveryFee(null)).toBe(0);
    expect(chargeableDeliveryFee(undefined)).toBe(0);
  });

  it("treats a corrupt fee as no fee rather than billing NaN", () => {
    expect(chargeableDeliveryFee(delivery({ fee: Number.NaN }))).toBe(0);
    expect(chargeableDeliveryFee(delivery({ fee: -5 }))).toBe(0);
  });
});

describe("deliveryCustomerData", () => {
  it("writes address and phone as blob keys the order detail already renders", () => {
    expect(
      deliveryCustomerData(delivery({ address: "12 Mabini St", phone: "0917 000 1234" })),
    ).toEqual({ delivery_address: "12 Mabini St", customer_phone: "0917 000 1234" });
  });

  it("omits blank fields so an ordinary counter sale carries no delivery keys", () => {
    expect(deliveryCustomerData(delivery({}))).toEqual({});
    expect(deliveryCustomerData(delivery({ address: "  ", phone: "" }))).toEqual({});
  });

  it("trims what the cashier typed", () => {
    expect(deliveryCustomerData(delivery({ address: " 12 Mabini St " }))).toEqual({
      delivery_address: "12 Mabini St",
    });
  });
});

// ---------------------------------------------------------------------------
// cartTotals with a delivery fee — the ONE place the fee joins the bill.
// ---------------------------------------------------------------------------

const CART: PosCartLine[] = addLine([], {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 150,
  quantity: 2,
  selections: [],
});

describe("cartTotals with a delivery fee", () => {
  it("adds the fee to the total and reports it in the breakdown", () => {
    const totals = cartTotals(CART, undefined, undefined, 50);

    expect(totals.subtotal).toBe(300);
    expect(totals.deliveryFee).toBe(50);
    expect(totals.total).toBe(350);
  });

  it("stacks with the service charge", () => {
    const totals = cartTotals(CART, { type: "percentage", value: 10 }, undefined, 50);

    expect(totals.serviceCharge).toBe(30);
    expect(totals.total).toBe(380);
  });

  it("caps a discount at the chargeable amount INCLUDING the fee", () => {
    // A free-delivery voucher (₱50) plus a fixed ₱300 voucher covers the whole
    // ₱350 bill. Capping at merchandise-only would strand the delivery
    // discount and re-bill the customer a fee they were given free.
    const totals = cartTotals(
      CART,
      undefined,
      [
        { label: "Free delivery", amount: 50, code: "FREEDEL" },
        { label: "300 off", amount: 300, code: "B300" },
      ],
      50,
    );

    expect(totals.discountTotal).toBe(350);
    expect(totals.total).toBe(0);
  });

  it("reports no fee when none is passed — the counter-sale default", () => {
    expect(cartTotals(CART).deliveryFee).toBe(0);
  });

  it("cannot bill a delivery fee on an empty cart", () => {
    expect(cartTotals([], undefined, undefined, 50).total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildPosOrder — the fee and contact details on the placed order.
// ---------------------------------------------------------------------------

const CASH: PosTender = { methodName: "Cash", isCash: true, cashTendered: 500, changeDue: 150 };

describe("buildPosOrder with delivery details", () => {
  const context = {
    cart: CART,
    tender: CASH,
    clientOrderId: "sale-del-1",
    orderType: "delivery",
    delivery: delivery({ fee: 50, address: "12 Mabini St", phone: "0917 000 1234" }),
  };

  it("charges the fee — total includes it", () => {
    expect(buildPosOrder(context).total).toBe(350);
  });

  it("emits deliveryFee so the backend stores the breakdown", () => {
    expect(buildPosOrder(context).deliveryFee).toBe(50);
  });

  it("omits the deliveryFee key entirely on a sale without one, for stale backends", () => {
    const order = buildPosOrder({ cart: CART, tender: CASH, clientOrderId: "sale-2" });
    expect("deliveryFee" in order).toBe(false);
  });

  it("writes address and phone into customerData", () => {
    const { customerData } = buildPosOrder(context);
    expect(customerData.delivery_address).toBe("12 Mabini St");
    expect(customerData.customer_phone).toBe("0917 000 1234");
  });

  it("uses the delivery phone as the order contact when no guest is attached", () => {
    expect(buildPosOrder(context).customerContact).toBe("0917 000 1234");
  });

  it("never overrides an attached guest's contact with the typed phone", () => {
    const order = buildPosOrder({ ...context, customerContact: "+639998887777" });
    expect(order.customerContact).toBe("+639998887777");
  });

  it("rejects cash that covers the merchandise but not the fee", () => {
    const shortTender: PosTender = { methodName: "Cash", isCash: true, cashTendered: 300 };
    expect(() =>
      buildPosOrder({ ...context, tender: shortTender }),
    ).toThrow(/insufficient cash/i);
  });
});

describe("buildPosOrder — deliveryAddress column parity", () => {
  it("emits the address top-level for backends with a real column", () => {
    const order = buildPosOrder({
      cart: CART,
      tender: CASH,
      clientOrderId: "sale-del-3",
      delivery: delivery({ fee: 50, address: "12 Mabini St" }),
    });
    expect(order.deliveryAddress).toBe("12 Mabini St");
  });

  it("omits the key entirely when no address was taken", () => {
    const order = buildPosOrder({
      cart: CART,
      tender: CASH,
      clientOrderId: "sale-del-4",
      delivery: delivery({ fee: 50 }),
    });
    expect("deliveryAddress" in order).toBe(false);
  });
});
