jest.mock("../authorized-post", () => ({ postAuthorized: jest.fn(async () => true) }));

import { postAuthorized } from "../authorized-post";
import {
  RECEIPT_REPRINTED_PATH,
  buildReceiptReprintPayload,
  reportReceiptReprint,
} from "./report-receipt-reprint";

const mockedPost = postAuthorized as jest.MockedFunction<typeof postAuthorized>;

describe("buildReceiptReprintPayload", () => {
  test("names the order in the platform's backend vocabulary", () => {
    expect(
      buildReceiptReprintPayload("t1", { backend: "platform", orderId: "o1", dailyNumber: 12, outletId: "b1" }),
    ).toEqual({ tenantId: "t1", backend: "platform_supabase", orderId: "o1", dailyNumber: 12, outletId: "b1" });
  });

  test("leaves out a missing or garbled daily number and branch", () => {
    expect(buildReceiptReprintPayload("t1", { backend: "convex", orderId: "o1", dailyNumber: 0, outletId: null })).toEqual({
      tenantId: "t1",
      backend: "convex",
      orderId: "o1",
    });
  });

  test("refuses without a tenant or an order id", () => {
    expect(buildReceiptReprintPayload(null, { backend: "convex", orderId: "o1" })).toBeNull();
    expect(buildReceiptReprintPayload("t1", { backend: "convex", orderId: "" })).toBeNull();
  });
});

describe("reportReceiptReprint", () => {
  beforeEach(() => mockedPost.mockClear());

  test("posts to the reprint route with the cashier's token", async () => {
    await reportReceiptReprint("t1", { backend: "supabase", orderId: "o1" });
    expect(mockedPost).toHaveBeenCalledWith(RECEIPT_REPRINTED_PATH, {
      tenantId: "t1",
      backend: "tenant_supabase",
      orderId: "o1",
    });
  });

  test("a refused or failed post only logs — it never throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockedPost.mockResolvedValueOnce(false);
    await expect(reportReceiptReprint("t1", { backend: "convex", orderId: "o1" })).resolves.toBeUndefined();
    mockedPost.mockRejectedValueOnce(new Error("offline"));
    await expect(reportReceiptReprint("t1", { backend: "convex", orderId: "o1" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test("sends nothing without a tenant", async () => {
    await reportReceiptReprint(undefined, { backend: "convex", orderId: "o1" });
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
