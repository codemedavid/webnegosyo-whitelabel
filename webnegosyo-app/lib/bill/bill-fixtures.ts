import type { BillOrder } from "./bill-orders";

/** Test fixtures shared by the bill suites (not a test file itself). */
export function billOrder(overrides: Partial<BillOrder> & Pick<BillOrder, "_id">): BillOrder {
  return {
    _creationTime: 1_700_000_000_000,
    customerName: "Walk-in",
    customerContact: "",
    total: 0,
    status: "delivered",
    amountPaid: 0,
    items: [],
    ...overrides,
  };
}

export const ROUND_ONE = billOrder({
  _id: "order-a",
  _creationTime: 1_700_000_000_000,
  dailyNumber: 12,
  customerName: "Maria",
  orderType: "Dine-in",
  customerData: { table_number: "4" },
  total: 340,
  items: [
    { orderId: "order-a", menuItemName: "Latte", quantity: 2, subtotal: 240 },
    { orderId: "order-a", menuItemName: "Croissant", quantity: 1, subtotal: 100 },
  ],
});

export const ROUND_TWO = billOrder({
  _id: "order-b",
  _creationTime: 1_700_000_600_000,
  dailyNumber: 15,
  customerName: "Maria",
  orderType: "Dine-in",
  customerData: { table_number: "4" },
  total: 220,
  serviceCharge: 20,
  items: [
    { orderId: "order-b", menuItemName: "Latte", quantity: 1, subtotal: 120 },
    { orderId: "order-b", menuItemName: "Cake", quantity: 1, subtotal: 80 },
  ],
});
