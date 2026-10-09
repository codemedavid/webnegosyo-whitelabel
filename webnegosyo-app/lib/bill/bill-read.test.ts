import { billOrderFromRead } from "./bill-read";

const detail = {
  _id: "o1",
  _creationTime: 1,
  customerName: "Maria",
  customerContact: "",
  status: "delivered",
  paymentStatus: "pending",
  total: 300,
  customerData: { table_number: "4" },
  items: [{ menuItemName: "Latte", quantity: 2, subtotal: 300 }],
};
const charge = (amount: number) => ({ _id: `p${amount}`, _creationTime: 1, kind: "charge" as const, amount });

describe("billOrderFromRead", () => {
  it("reads what was paid off the ledger and tags every line with its order", () => {
    const order = billOrderFromRead(detail, [charge(100)], "available");

    expect(order?.amountPaid).toBe(100);
    expect(order?.items[0].orderId).toBe("o1");
  });

  it("counts an order settled by its status as paid in full, even with an empty ledger", () => {
    const order = billOrderFromRead({ ...detail, paymentStatus: "paid" }, [], "available");

    expect(order?.amountPaid).toBe(300);
  });

  it("treats a store with no ledger as nothing collected through one", () => {
    expect(billOrderFromRead(detail, undefined, "absent")?.amountPaid).toBe(0);
  });

  it("refuses to bill an order whose ledger could not be read", () => {
    expect(billOrderFromRead(detail, undefined, "unavailable")).toBeNull();
  });

  it("is not ready until the ledger has arrived", () => {
    expect(billOrderFromRead(detail, undefined, "available")).toBeNull();
  });
});
