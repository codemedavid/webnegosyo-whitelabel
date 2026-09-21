import { getConnectivity, resetConnectivityForTests } from "./connectivity";
import type { QueuedSale } from "./order-outbox";
import { placeCounterSale } from "./place-sale";

const sale: Omit<QueuedSale, "attempts" | "lastError"> = {
  localId: "local-1",
  tenantId: "tenant-1",
  backend: "platform",
  clientOrderId: "pos-abc",
  createdAt: 1000,
  orderArgs: { total: 50, clientOrderId: "pos-abc" },
  bookkeeping: {
    stockItems: [],
    loyverseLines: [],
    discountLines: [],
    outletId: null,
    total: 50,
    customerName: "",
    customerContact: "",
    customerData: {},
    channel: null,
    captureItems: [],
  },
};

describe("placeCounterSale", () => {
  beforeEach(() => resetConnectivityForTests());

  it("writes the sale when online and hands back the server's id", async () => {
    const createOrder = jest.fn().mockResolvedValue("server-id");
    const enqueue = jest.fn();
    const outcome = await placeCounterSale({ createOrder, sale, enqueue, isOffline: () => false });
    expect(outcome).toEqual({ kind: "written", orderId: "server-id" });
    expect(createOrder).toHaveBeenCalledWith(sale.orderArgs);
    expect(enqueue).not.toHaveBeenCalled();
    expect(getConnectivity().status).toBe("online");
  });

  it("queues without trying the server when the register believes it is offline", async () => {
    const createOrder = jest.fn();
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const outcome = await placeCounterSale({ createOrder, sale, enqueue, isOffline: () => true });
    expect(outcome).toEqual({ kind: "queued", localId: "local-1" });
    expect(createOrder).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith({ ...sale, attempts: 0, lastError: null });
  });

  it("queues when the write cannot reach the server, and flips the belief offline", async () => {
    const createOrder = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const outcome = await placeCounterSale({ createOrder, sale, enqueue, isOffline: () => false });
    expect(outcome).toEqual({ kind: "queued", localId: "local-1" });
    expect(getConnectivity().status).toBe("offline");
  });

  it("queues when the write hangs past the deadline — a Convex client queues forever", async () => {
    const createOrder = jest.fn(() => new Promise<never>(() => {}));
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const outcome = await placeCounterSale({
      createOrder,
      sale,
      enqueue,
      isOffline: () => false,
      timeoutMs: 20,
    });
    expect(outcome.kind).toBe("queued");
  });

  it("rethrows a refusal so the cashier sees it, and never queues it", async () => {
    const refusal = new Error("ArgumentValidationError: source is not in the validator");
    const createOrder = jest.fn().mockRejectedValue(refusal);
    const enqueue = jest.fn();
    await expect(
      placeCounterSale({ createOrder, sale, enqueue, isOffline: () => false })
    ).rejects.toBe(refusal);
    expect(enqueue).not.toHaveBeenCalled();
    expect(getConnectivity().status).toBe("unknown");
  });
});
