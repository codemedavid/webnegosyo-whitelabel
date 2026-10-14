const syncStockMock = jest.fn();
const pushLoyverseMock = jest.fn();
jest.mock("../order-cancel-stock", () => ({ syncStockForStatusChange: syncStockMock }));
jest.mock("../loyverse-confirm", () => ({ pushConfirmedOrderToLoyverse: pushLoyverseMock }));
jest.mock("./connectivity", () => ({ reportOffline: jest.fn() }));

import { runOrderEditSideEffects } from "./sync-order-edits";
import type { QueuedOrderEdit } from "./order-edits";

function statusEdit(status: string, previousStatus?: string): QueuedOrderEdit {
  return {
    editId: "e1",
    tenantId: "t1",
    backend: "platform",
    orderId: "o1",
    ref: "orders:updateOrderStatus",
    args: { orderId: "o1", status },
    createdAt: 1,
    attempts: 0,
    lastError: null,
    ...(previousStatus ? { previousStatus } : {}),
  };
}

describe("runOrderEditSideEffects", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    syncStockMock.mockResolvedValue("ok");
    pushLoyverseMock.mockResolvedValue(undefined);
  });

  it("re-spends the stock when a replayed change takes an order out of cancelled", async () => {
    await runOrderEditSideEffects(statusEdit("preparing", "cancelled"));
    expect(syncStockMock).toHaveBeenCalledWith({ orderId: "o1", newStatus: "preparing", previousStatus: "cancelled" });
  });

  it("restores the stock when a replayed change cancels the order", async () => {
    await runOrderEditSideEffects(statusEdit("cancelled", "confirmed"));
    expect(syncStockMock).toHaveBeenCalledWith({ orderId: "o1", newStatus: "cancelled", previousStatus: "confirmed" });
  });

  it("still pushes a confirmed order to Loyverse", async () => {
    await runOrderEditSideEffects(statusEdit("confirmed", "pending"));
    expect(pushLoyverseMock).toHaveBeenCalledWith("o1");
  });

  it("ignores payment changes", async () => {
    await runOrderEditSideEffects({ ...statusEdit("paid"), ref: "orders:updatePaymentStatus" });
    expect(syncStockMock).not.toHaveBeenCalled();
  });
});
