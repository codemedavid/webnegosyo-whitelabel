jest.mock("../authorized-post", () => ({ postAuthorized: jest.fn(async () => true) }));

import { postAuthorized } from "../authorized-post";
import { buildPosSalePayload, notifyPosSaleActivity } from "./report-pos-sale";

describe("buildPosSalePayload", () => {
  test("names the sale in the platform's backend vocabulary", () => {
    expect(buildPosSalePayload("t1", { backend: "platform", orderId: "o1", total: 120, outletId: "b1" })).toEqual({
      tenantId: "t1",
      backend: "platform_supabase",
      externalOrderId: "o1",
      status: "pending",
      source: "pos",
      orderTotal: 120,
      outletId: "b1",
    });
  });

  test("refuses without a tenant or an order id", () => {
    expect(buildPosSalePayload("", { backend: "convex", orderId: "o1", total: 1 })).toBeNull();
    expect(buildPosSalePayload("t1", { backend: "convex", orderId: "", total: 1 })).toBeNull();
  });

  test("an unreadable total is sent as zero rather than dropping the sale", () => {
    expect(buildPosSalePayload("t1", { backend: "convex", orderId: "o1", total: Number.NaN })?.orderTotal).toBe(0);
  });
});

describe("notifyPosSaleActivity", () => {
  test("posts to the staff activity route with the cashier's token", async () => {
    await notifyPosSaleActivity("t1", { backend: "convex", orderId: "o1", total: 50 });
    expect(postAuthorized).toHaveBeenCalledWith(
      "/api/staff/order-activity",
      expect.objectContaining({ externalOrderId: "o1", source: "pos" }),
    );
  });
});
