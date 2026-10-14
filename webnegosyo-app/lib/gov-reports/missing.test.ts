import { parseMissingOrders } from "./missing-orders";

describe("parseMissingOrders", () => {
  it("keeps well-formed rows and drops junk", () => {
    const good = { orderId: "o1", label: "#7", occurredAt: "2026-10-15T04:00:00.000Z", outletId: null, total: 400, claimantCount: 1, reduction: 160 };
    expect(parseMissingOrders({ orders: [good, { orderId: 3 }, null] })).toEqual([good]);
    expect(parseMissingOrders({})).toEqual([]);
  });
});
