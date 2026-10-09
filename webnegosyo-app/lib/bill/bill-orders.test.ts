import { billOrderRef, billSummary, mergeBillItems, orderOwed, sortBillOrders } from "./bill-orders";
import { ROUND_ONE, ROUND_TWO, billOrder } from "./bill-fixtures";

describe("bill orders", () => {
  it("refers to an order by its daily number, or the tail of its id", () => {
    expect(billOrderRef(ROUND_ONE)).toBe("#12");
    expect(billOrderRef(billOrder({ _id: "abcdef1234567890" }))).toBe("#34567890");
  });

  it("owes the total less what was paid, never less than nothing", () => {
    expect(orderOwed({ ...ROUND_ONE, amountPaid: 100 })).toBe(240);
    expect(orderOwed({ ...ROUND_ONE, amountPaid: 500 })).toBe(0);
  });

  it("puts the oldest order first", () => {
    expect(sortBillOrders([ROUND_TWO, ROUND_ONE]).map((o) => o._id)).toEqual(["order-a", "order-b"]);
  });

  it("sums the bill across its orders", () => {
    const summary = billSummary([ROUND_ONE, { ...ROUND_TWO, amountPaid: 220 }]);

    expect(summary).toEqual({ total: 560, paid: 220, owed: 340, orderCount: 2, hasPayments: true });
  });

  it("merges the same dish across rounds into one line", () => {
    const lines = mergeBillItems([...ROUND_ONE.items, ...ROUND_TWO.items]);

    expect(lines.find((line) => line.menuItemName === "Latte")).toMatchObject({ quantity: 3, subtotal: 360 });
    expect(lines).toHaveLength(3);
  });

  it("keeps lines apart when their choices, notes or unit prices differ", () => {
    const lines = mergeBillItems([
      { orderId: "a", menuItemName: "Latte", quantity: 1, subtotal: 120, variation: "Large" },
      { orderId: "b", menuItemName: "Latte", quantity: 1, subtotal: 120 },
      { orderId: "b", menuItemName: "Latte", quantity: 1, subtotal: 120, specialInstructions: "oat" },
      { orderId: "b", menuItemName: "Latte", quantity: 1, subtotal: 99 },
    ]);

    expect(lines).toHaveLength(4);
  });

  it("keeps each order's combo together instead of merging two orders' combos", () => {
    const lines = mergeBillItems([
      { orderId: "a", menuItemName: "Burger", quantity: 1, subtotal: 150, isBundleItem: true, bundleId: "meal", bundleName: "Meal" },
      { orderId: "b", menuItemName: "Burger", quantity: 1, subtotal: 150, isBundleItem: true, bundleId: "meal", bundleName: "Meal" },
    ]);

    expect(lines.map((line) => line.bundleId)).toEqual(["a:meal", "b:meal"]);
  });
});
