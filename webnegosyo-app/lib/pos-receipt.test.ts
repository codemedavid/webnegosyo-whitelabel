/**
 * A counter sale's receipt is built from the SAME arguments the sale was
 * written with. The register used to hand the printer a hand-assembled object
 * that carried the items and the total but neither the delivery fee nor the
 * service charge, so a sale with a manual delivery fee printed items that did
 * not sum to the bill, with no line to name the difference.
 */
import { buildPosOrder } from "./pos-order";
import { posReceiptOrder } from "./pos-receipt";
import { renderReceipt, CLASSIC_RECEIPT_LAYOUT } from "./receipt-layout";
import type { PosCartLine } from "./pos-cart";

const LINE: PosCartLine = {
  key: "l1",
  menuItemId: "m1",
  name: "Latte",
  basePrice: 100,
  unitPrice: 100,
  quantity: 1,
  subtotal: 100,
  selections: [],
};

function saleWith(overrides: Parameters<typeof buildPosOrder>[0]) {
  const args = buildPosOrder(overrides);
  return { args, receipt: posReceiptOrder("order-1", args, overrides.tender, 1_700_000_000_000) };
}

describe("posReceiptOrder", () => {
  it("carries the delivery fee the sale charged", () => {
    // Arrange
    const tender = { methodName: "Cash", isCash: true, cashTendered: 200, changeDue: 50 };

    // Act
    const { args, receipt } = saleWith({
      cart: [LINE],
      tender,
      clientOrderId: "c1",
      delivery: { fee: 50, address: "12 Mabini St", phone: "" },
    });

    // Assert
    expect(args.deliveryFee).toBe(50);
    expect(receipt.deliveryFee).toBe(50);
    expect(receipt.total).toBe(150);
    expect(renderReceipt(receipt, { storeName: "Shop" }, CLASSIC_RECEIPT_LAYOUT)).toContain(
      "Delivery Fee:",
    );
  });

  it("prints the cash block and the payment method from the tender", () => {
    const tender = { methodName: "Cash", isCash: true, cashTendered: 200, changeDue: 100 };
    const { receipt } = saleWith({ cart: [LINE], tender, clientOrderId: "c1" });

    expect(receipt.cashTendered).toBe(200);
    expect(receipt.changeDue).toBe(100);
    expect(receipt.paymentMethod).toBe("Cash");
    expect(receipt.deliveryFee).toBeUndefined();
  });

  it("carries the discount breakdown so the receipt can name it", () => {
    const tender = { methodName: "Cash", isCash: true, cashTendered: 200, changeDue: 110 };
    const { receipt } = saleWith({
      cart: [LINE],
      tender,
      clientOrderId: "c1",
      discounts: [{ label: "Senior", amount: 10 }],
    });

    const printed = renderReceipt(receipt, { storeName: "Shop" }, CLASSIC_RECEIPT_LAYOUT);
    expect(printed).toContain("Senior");
    expect(receipt.total).toBe(90);
  });
});
