import { buildCreateOrderRows, type CreateOrderArgs } from "./supabase-orders";

const base: CreateOrderArgs = {
  customerName: "",
  customerContact: "",
  total: 100,
  itemCount: 1,
  source: "pos",
  clientOrderId: "pos-abc",
  items: [{ menuItemId: "", menuItemName: "Latte", quantity: 1, price: 100, subtotal: 100 }],
};

describe("buildCreateOrderRows — a sale the register identified and timed itself", () => {
  it("stores the row under the id the register printed, at the moment the sale was taken", () => {
    const { order } = buildCreateOrderRows("tenant-1", {
      ...base,
      id: "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f",
      createdAt: "2026-09-21T04:05:06.000Z",
    });
    expect(order.id).toBe("0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f");
    expect(order.created_at).toBe("2026-09-21T04:05:06.000Z");
  });

  it("sends the exact row shape every deployed reader has seen when neither is supplied", () => {
    const { order } = buildCreateOrderRows("tenant-1", base);
    expect("id" in order).toBe(false);
    expect("created_at" in order).toBe(false);
  });

  it("lets the database mint the id and time when the values are not usable", () => {
    const { order } = buildCreateOrderRows("tenant-1", {
      ...base,
      id: "pos-not-a-uuid",
      createdAt: "yesterday",
    });
    expect("id" in order).toBe(false);
    expect("created_at" in order).toBe(false);
  });
});
