import { resetOrderEditSyncForTests, syncOrderEdits, type SyncOrderEditsDeps } from "./sync-order-edits";
import { MAX_EDIT_ATTEMPTS, type QueuedOrderEdit } from "./order-edits";
import type { QueuedSale } from "./order-outbox";

jest.mock("./connectivity", () => ({ reportOffline: jest.fn() }));

function edit(editId: string, overrides: Partial<QueuedOrderEdit> = {}): QueuedOrderEdit {
  return {
    editId,
    tenantId: "tenant-1",
    backend: "platform",
    orderId: "order-1",
    ref: "orders:updateOrderStatus",
    args: { orderId: "order-1", status: "preparing" },
    createdAt: 1_000,
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

function unwrittenSale(localId: string, syncedOrderId?: string): QueuedSale {
  return { localId, tenantId: "tenant-1", syncedOrderId } as QueuedSale;
}

function setup(edits: QueuedOrderEdit[], overrides: Partial<SyncOrderEditsDeps> = {}) {
  const calls: string[] = [];
  const deps: SyncOrderEditsDeps = {
    tenantId: "tenant-1",
    backend: "platform",
    mutate: jest.fn(async (ref: string, args: Record<string, unknown>) => {
      calls.push(`${ref}:${String(args.orderId)}:${String(args.status ?? args.paymentStatus ?? args.amount)}`);
    }),
    afterWrite: jest.fn().mockResolvedValue(undefined),
    listEdits: () => edits,
    listSales: () => [],
    remove: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { deps, calls };
}

describe("syncOrderEdits", () => {
  beforeEach(() => resetOrderEditSyncForTests());

  it("replays this store's changes oldest first, then forgets them", async () => {
    const { deps, calls } = setup([
      edit("late", { createdAt: 3_000, args: { orderId: "order-1", status: "ready" } }),
      edit("early", { createdAt: 2_000, args: { orderId: "order-1", status: "preparing" } }),
      edit("foreign", { tenantId: "tenant-2" }),
    ]);

    const result = await syncOrderEdits(deps);

    expect(calls).toEqual([
      "orders:updateOrderStatus:order-1:preparing",
      "orders:updateOrderStatus:order-1:ready",
    ]);
    expect(deps.remove).toHaveBeenCalledWith("early");
    expect(deps.remove).toHaveBeenCalledWith("late");
    expect(deps.afterWrite).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ synced: 2, refused: 0, stoppedOffline: false });
  });

  it("waits while the order is still a sale the server has not written", async () => {
    const { deps, calls } = setup([edit("e1", { orderId: "local-1", args: { orderId: "local-1" } })], {
      listSales: () => [unwrittenSale("local-1")],
    });

    const result = await syncOrderEdits(deps);

    expect(calls).toEqual([]);
    expect(result.waiting).toBe(1);
  });

  it("addresses a written sale by its server id", async () => {
    const { deps, calls } = setup(
      [edit("e1", { orderId: "local-1", args: { orderId: "local-1", status: "ready" } })],
      { listSales: () => [unwrittenSale("local-1", "convex-9")] }
    );

    await syncOrderEdits(deps);

    expect(calls).toEqual(["orders:updateOrderStatus:convex-9:ready"]);
  });

  it("stops on a lost connection and keeps the rest queued", async () => {
    const { deps } = setup([edit("e1"), edit("e2", { createdAt: 2_000 })], {
      mutate: jest.fn().mockRejectedValue(new TypeError("Network request failed")),
    });

    const result = await syncOrderEdits(deps);

    expect(result.stoppedOffline).toBe(true);
    expect(deps.mutate).toHaveBeenCalledTimes(1);
    expect(deps.remove).not.toHaveBeenCalled();
    expect(deps.recordFailure).not.toHaveBeenCalled();
  });

  it("records a refusal and holds back later changes to the same order", async () => {
    const mutate = jest.fn(async (_ref: string, args: Record<string, unknown>) => {
      if (args.status === "preparing") throw new Error("Not allowed");
    });
    const { deps } = setup(
      [
        edit("e1", { createdAt: 1_000 }),
        edit("e2", { createdAt: 2_000, args: { orderId: "order-1", status: "ready" } }),
        edit("e3", { createdAt: 3_000, orderId: "order-2", args: { orderId: "order-2", status: "ready" } }),
      ],
      { mutate }
    );

    const result = await syncOrderEdits(deps);

    expect(deps.recordFailure).toHaveBeenCalledWith("e1", "Not allowed");
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(deps.remove).toHaveBeenCalledWith("e3");
    expect(result).toMatchObject({ synced: 1, refused: 1 });
  });

  it("skips changes refused too many times", async () => {
    const { deps } = setup([edit("e1", { attempts: MAX_EDIT_ATTEMPTS })]);

    const result = await syncOrderEdits(deps);

    expect(deps.mutate).not.toHaveBeenCalled();
    expect(result.stuck).toBe(1);
  });

  it("still forgets a change whose follow-up failed", async () => {
    const { deps } = setup([edit("e1")], { afterWrite: jest.fn().mockRejectedValue(new Error("stock down")) });

    const result = await syncOrderEdits(deps);

    expect(deps.remove).toHaveBeenCalledWith("e1");
    expect(result.synced).toBe(1);
  });
});
