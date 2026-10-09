/**
 * The merchant's own checkout questions ride the order blob under their own
 * names — the same keys the storefront writes — and can never displace a key
 * the register itself writes.
 */

import { buildPosOrder, type PosTender } from "./pos-order";
import { addLine } from "./pos-cart";

const cart = addLine([], { menuItemId: "m-latte", name: "Latte", basePrice: 120, quantity: 1, selections: [] });
const cash: PosTender = { methodName: "Cash", isCash: true, cashTendered: 200, changeDue: 80 };

describe("buildPosOrder — checkout answers", () => {
  it("stores each answer under its field name", () => {
    const args = buildPosOrder({
      cart,
      tender: cash,
      clientOrderId: "c1",
      checkoutAnswers: { Landmark: "Blue gate", "Preferred time": "3:00 PM" },
    });

    expect(args.customerData).toMatchObject({ Landmark: "Blue gate", "Preferred time": "3:00 PM" });
  });

  it("lets the register's own keys win over a merchant field with the same name", () => {
    const args = buildPosOrder({
      cart,
      tender: cash,
      clientOrderId: "c1",
      delivery: { fee: null, address: "12 Mabini St", phone: "" },
      checkoutAnswers: { pos: "spoofed", delivery_address: "elsewhere" },
    });

    expect(args.customerData.delivery_address).toBe("12 Mabini St");
    expect(args.customerData.pos).toEqual({ cashTendered: 200, changeDue: 80 });
  });

  it("sends a blob unchanged by this feature when there are no answers", () => {
    const withNone = buildPosOrder({ cart, tender: cash, clientOrderId: "c1" });
    const withEmpty = buildPosOrder({ cart, tender: cash, clientOrderId: "c1", checkoutAnswers: {} });

    expect(withEmpty.customerData).toEqual(withNone.customerData);
  });
});
