import { getConnectivity, resetConnectivityForTests } from "./connectivity";
import type { QueuedSale } from "./order-outbox";
import { MAX_SYNC_ATTEMPTS, resetSyncForTests, syncOutbox } from "./sync-outbox";

function sale(localId: string, tenantId = "tenant-1"): QueuedSale {
  return {
    localId,
    tenantId,
    backend: "platform",
    clientOrderId: `pos-${localId}`,
    createdAt: 1000,
    orderArgs: { clientOrderId: `pos-${localId}`, total: 10 },
    bookkeeping: {
      stockItems: [],
      loyverseLines: [],
      discountLines: [],
      outletId: "outlet-1",
      total: 10,
      customerName: "Ana",
      customerContact: "0917",
      customerData: {},
      channel: "Dine-in",
      captureItems: [],
    },
    attempts: 0,
    lastError: null,
  };
}

function harness(sales: QueuedSale[]) {
  const createOrder = jest.fn(async (args: unknown) => `server-${(args as { clientOrderId: string }).clientOrderId}`);
  const updatePaymentStatus = jest.fn().mockResolvedValue(undefined);
  const bookkeeping = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const recordFailure = jest.fn().mockResolvedValue(undefined);
  const markWritten = jest.fn().mockResolvedValue(undefined);
  const markBookkeepingDone = jest.fn().mockResolvedValue(undefined);
  const deps = {
    tenantId: "tenant-1",
    backend: "platform" as const,
    createOrder,
    updatePaymentStatus,
    bookkeeping,
    listSales: () => sales,
    remove,
    recordFailure,
    markWritten,
    markBookkeepingDone,
  };
  return {
    deps,
    createOrder,
    updatePaymentStatus,
    bookkeeping,
    remove,
    recordFailure,
    markWritten,
    markBookkeepingDone,
  };
}

describe("syncOutbox", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    resetSyncForTests();
  });

  it("replays each sale in order: create, mark paid, bookkeeping, then forget it", async () => {
    const h = harness([sale("a"), sale("b")]);
    await expect(syncOutbox(h.deps)).resolves.toEqual({
      synced: 2,
      refused: 0,
      stuck: 0,
      stoppedOffline: false,
    });

    expect(h.createOrder.mock.calls.map(([args]) => args)).toEqual([
      sale("a").orderArgs,
      sale("b").orderArgs,
    ]);
    expect(h.updatePaymentStatus).toHaveBeenCalledWith({ orderId: "server-pos-a", paymentStatus: "paid" });
    expect(h.bookkeeping).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", orderId: "server-pos-a", createdAt: 1000 })
    );
    expect(h.remove.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
  });

  it("forgets a sale only after the server holds it", async () => {
    const h = harness([sale("a")]);
    const order: string[] = [];
    h.createOrder.mockImplementation(async () => {
      order.push("create");
      return "server-a";
    });
    h.remove.mockImplementation(async () => {
      order.push("remove");
    });
    await syncOutbox(h.deps);
    expect(order).toEqual(["create", "remove"]);
  });

  it("stops the run when the connection drops and leaves the rest queued", async () => {
    const h = harness([sale("a"), sale("b"), sale("c")]);
    h.createOrder
      .mockResolvedValueOnce("server-a")
      .mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(syncOutbox(h.deps)).resolves.toEqual({
      synced: 1,
      refused: 0,
      stuck: 0,
      stoppedOffline: true,
    });
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.recordFailure).not.toHaveBeenCalled();
    expect(getConnectivity().status).toBe("offline");
  });

  it("records a refusal on that sale, keeps it, and carries on with the next", async () => {
    const h = harness([sale("a"), sale("b")]);
    h.createOrder
      .mockRejectedValueOnce(new Error("ArgumentValidationError"))
      .mockResolvedValueOnce("server-b");
    await expect(syncOutbox(h.deps)).resolves.toEqual({
      synced: 1,
      refused: 1,
      stuck: 0,
      stoppedOffline: false,
    });
    expect(h.recordFailure).toHaveBeenCalledWith("a", "ArgumentValidationError");
    expect(h.remove).toHaveBeenCalledWith("b");
  });

  it("a refused paid-status write does not lose the sale; a dropped one does not forget it", async () => {
    const h = harness([sale("a")]);
    h.updatePaymentStatus.mockRejectedValueOnce(new Error("permission denied"));
    await expect(syncOutbox(h.deps)).resolves.toMatchObject({ synced: 0, refused: 1 });
    expect(h.markWritten).not.toHaveBeenCalled();
    expect(h.bookkeeping).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();

    resetSyncForTests();
    const h2 = harness([sale("b")]);
    h2.updatePaymentStatus.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(syncOutbox(h2.deps)).resolves.toMatchObject({ synced: 0, stoppedOffline: true });
    expect(h2.remove).not.toHaveBeenCalled();
  });

  it("replays only the current store's sales", async () => {
    const h = harness([sale("mine"), sale("theirs", "tenant-2")]);
    await syncOutbox(h.deps);
    expect(h.createOrder).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith("mine");
  });

  it("keeps a sale from the previous backend for reconciliation", async () => {
    const h = harness([{ ...sale("old"), backend: "convex" }, sale("current")]);
    await expect(syncOutbox(h.deps)).resolves.toMatchObject({ synced: 1 });
    expect(h.createOrder).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith("current");
  });

  it("stops after an account switch without further writes or bookkeeping", async () => {
    const h = harness([sale("a"), sale("b")]);
    let active = true;
    h.createOrder.mockImplementation(async () => { active = false; return "server-a"; });
    await expect(syncOutbox({ ...h.deps, isActive: () => active })).resolves.toMatchObject({ synced: 0 });
    expect(h.updatePaymentStatus).not.toHaveBeenCalled();
    expect(h.bookkeeping).not.toHaveBeenCalled();
    expect(h.recordFailure).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("bounds a stalled mutation and releases the worker for a later retry", async () => {
    const h = harness([sale("a")]);
    h.createOrder.mockImplementationOnce(() => new Promise<string>(() => {}));
    jest.useFakeTimers();
    try {
      const result = syncOutbox(h.deps);
      await jest.advanceTimersByTimeAsync(15_000);
      expect(h.remove).not.toHaveBeenCalled();
      // Await only after verifying a timeout actually fired (old code hangs).
      expect(getConnectivity().status).toBe("offline");
      await expect(result).resolves.toMatchObject({ synced: 0, stoppedOffline: true });
      await expect(syncOutbox(h.deps)).resolves.toMatchObject({ synced: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it("a second trigger joins the run in flight instead of replaying twice", async () => {
    const h = harness([sale("a")]);
    let release: (value: string) => void = () => {};
    h.createOrder.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));
    const first = syncOutbox(h.deps);
    const second = syncOutbox(h.deps);
    expect(second).toBe(first);
    release("server-a");
    await first;
    expect(h.createOrder).toHaveBeenCalledTimes(1);
  });
});

/**
 * "Pay later" sales ride the same outbox as paid ones. Replaying them must not
 * invent a payment: the order is written and stays unpaid until the cashier
 * collects it from the order screen.
 */
describe("marking a replayed sale paid", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    resetSyncForTests();
  });

  it("never marks a pay-later sale paid", async () => {
    const h = harness([{ ...sale("a"), paidAtTender: false }]);
    await syncOutbox(h.deps);
    expect(h.createOrder).toHaveBeenCalledTimes(1);
    expect(h.updatePaymentStatus).not.toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalledWith("a");
  });

  it("skips the second write when the insert itself already carried the payment", async () => {
    const paidOnInsert = sale("a");
    const h = harness([
      { ...paidOnInsert, orderArgs: { ...paidOnInsert.orderArgs, paymentStatus: "paid" } },
    ]);
    await syncOutbox(h.deps);
    expect(h.updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("still marks a sale queued before the flag existed as paid", async () => {
    const legacy = sale("a");
    delete (legacy as Partial<QueuedSale>).paidAtTender;
    const h = harness([legacy]);
    await syncOutbox(h.deps);
    expect(h.updatePaymentStatus).toHaveBeenCalledWith({ orderId: "server-pos-a", paymentStatus: "paid" });
  });
});

/**
 * With write-behind every sale goes through the outbox, so a sale rung up
 * while the previous one is still syncing must not wait for the 20-second
 * retry timer — that would leave it off the Orders list and the kitchen's
 * screens for no reason.
 */
describe("a sale queued while a run is in flight", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    resetSyncForTests();
  });

  it("is written by a follow-up run as soon as the current one finishes", async () => {
    const queue: QueuedSale[] = [sale("a")];
    const h = harness(queue);
    let release: (value: string) => void = () => {};
    h.createOrder.mockImplementationOnce(
      () => new Promise<string>((resolve) => (release = resolve))
    );
    h.remove.mockImplementation(async (localId: string) => {
      const index = queue.findIndex((candidate) => candidate.localId === localId);
      if (index >= 0) queue.splice(index, 1);
    });

    const first = syncOutbox(h.deps);
    queue.push(sale("b"));
    const second = syncOutbox(h.deps);
    release("server-pos-a");
    await first;
    await second;
    // Let the follow-up run settle.
    await syncOutbox(h.deps);

    expect(h.createOrder.mock.calls.map(([args]) => (args as { clientOrderId: string }).clientOrderId))
      .toEqual(["pos-a", "pos-b"]);
  });

  it("does not replay a sale the run already refused", async () => {
    const h = harness([sale("a")]);
    let release: (reason: Error) => void = () => {};
    h.createOrder.mockImplementationOnce(
      () => new Promise<string>((_, reject) => (release = reject))
    );
    const first = syncOutbox(h.deps);
    void syncOutbox(h.deps);
    release(new Error("check constraint violated"));
    await first;
    // The follow-up pass skipped it: one attempt, one recorded refusal.
    expect(h.createOrder).toHaveBeenCalledTimes(1);
    expect(h.recordFailure).toHaveBeenCalledTimes(1);
  });
});

/**
 * A sale the server REFUSES is not a sale the connection lost. The money is
 * already in the till and the receipt is already in the customer's hand, so
 * the sale is never dropped — but it must stop being replayed forever and
 * must stop being counted as "waiting to sync", or a permanently refused
 * sale is indistinguishable from a slow one and nobody ever reconciles it.
 */
describe("a sale the server keeps refusing", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    resetSyncForTests();
  });

  it("stops retrying once it has burned through its attempts", async () => {
    const exhausted = { ...sale("a"), attempts: MAX_SYNC_ATTEMPTS };
    const h = harness([exhausted]);

    await expect(syncOutbox(h.deps)).resolves.toEqual({
      synced: 0,
      refused: 0,
      stuck: 1,
      stoppedOffline: false,
    });
    expect(h.createOrder).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("still replays a sale with attempts left", async () => {
    const h = harness([{ ...sale("a"), attempts: MAX_SYNC_ATTEMPTS - 1 }]);

    await expect(syncOutbox(h.deps)).resolves.toMatchObject({ synced: 1, stuck: 0 });
    expect(h.createOrder).toHaveBeenCalledTimes(1);
  });
});

/**
 * The bookkeeping (Loyverse receipt, customer capture, activity log) is NOT
 * deduped server-side the way `createOrder` is by `clientOrderId`. If the
 * process dies between a successful bookkeeping run and the sale leaving the
 * queue, the replay must not push a second Loyverse receipt — that double
 * counts the merchant's revenue in their own back office.
 */
describe("a replay that already got part-way", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    resetSyncForTests();
  });

  it("does not create the order twice when it already has a server id", async () => {
    const h = harness([{ ...sale("a"), syncedOrderId: "server-pos-a" }]);

    await expect(syncOutbox(h.deps)).resolves.toMatchObject({ synced: 1 });
    expect(h.createOrder).not.toHaveBeenCalled();
    expect(h.bookkeeping).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith("a");
  });

  it("does not run the bookkeeping twice when it already ran", async () => {
    const h = harness([
      { ...sale("a"), syncedOrderId: "server-pos-a", bookkeepingDone: true },
    ]);

    await expect(syncOutbox(h.deps)).resolves.toMatchObject({ synced: 1 });
    expect(h.bookkeeping).not.toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalledWith("a");
  });

  it("records the server id before the bookkeeping runs, so a crash cannot double it", async () => {
    const h = harness([sale("a")]);
    const order: string[] = [];
    h.markWritten.mockImplementation(async () => void order.push("markWritten"));
    h.bookkeeping.mockImplementation(async () => void order.push("bookkeeping"));
    h.markBookkeepingDone.mockImplementation(async () => void order.push("markBookkeepingDone"));
    h.remove.mockImplementation(async () => void order.push("remove"));

    await syncOutbox(h.deps);

    expect(order).toEqual(["markWritten", "bookkeeping", "markBookkeepingDone", "remove"]);
  });
});
