import {
  drainStockCalls,
  isNoopStockCall,
  resetStockDrainForTests,
  sendStockCall,
  type DrainStockCallsDeps,
} from "./drain-stock-calls";
import { MAX_STOCK_ATTEMPTS, nextStockRetryAt } from "./stock-retry-policy";
import type { QueuedStockCall } from "./stock-call-queue";
import type { StockPostOutcome } from "../pos-stock-notify";

function entry(id: string, overrides: Partial<QueuedStockCall> = {}): QueuedStockCall {
  return {
    id,
    tenantId: "t1",
    orderId: "o1",
    action: "restore",
    payload: { source: "merchant_app" },
    attempts: 0,
    retryAt: null,
    createdAt: 1,
    ...overrides,
  };
}

function harness(initial: QueuedStockCall[], outcomes: Record<string, StockPostOutcome> = {}) {
  let calls = [...initial];
  const ran: string[] = [];
  const deps = {
    tenantId: "t1",
    hydrate: jest.fn().mockResolvedValue(undefined),
    listCalls: () => calls,
    run: jest.fn(async (call: QueuedStockCall) => {
      ran.push(call.id);
      return outcomes[call.id] ?? "ok";
    }),
    remove: jest.fn(async (id: string) => {
      calls = calls.filter((c) => c.id !== id);
    }),
    defer: jest.fn(async (id: string, attempts: number, retryAt: number) => {
      calls = calls.map((c) => (c.id === id ? { ...c, attempts, retryAt } : c));
    }),
    reportAbandoned: jest.fn(),
    now: () => 50_000,
  } satisfies DrainStockCallsDeps;
  return { deps, ran, list: () => calls };
}

describe("drainStockCalls", () => {
  beforeEach(() => resetStockDrainForTests());

  it("sends each due call in the order it was queued and forgets it once accepted", async () => {
    const h = harness([entry("a", { orderId: "o1" }), entry("b", { orderId: "o2" })]);

    const result = await drainStockCalls(h.deps);

    expect(h.ran).toEqual(["a", "b"]);
    expect(h.list()).toEqual([]);
    expect(result).toEqual({ sent: 2, owed: 0, abandoned: 0 });
  });

  it("keeps a call that did not land, with the shared backoff", async () => {
    const h = harness([entry("a")], { a: "retry" });

    const result = await drainStockCalls(h.deps);

    expect(h.deps.defer).toHaveBeenCalledWith("a", 1, nextStockRetryAt(50_000, 1));
    expect(h.list()).toHaveLength(1);
    expect(result).toEqual({ sent: 0, owed: 1, abandoned: 0 });
  });

  it("holds an order's later calls behind an earlier one that is still owed", async () => {
    // restore did not land → the redeplete after it must not overtake it.
    const h = harness([entry("restore"), entry("redeplete", { action: "redeplete" }), entry("other", { orderId: "o2" })], {
      restore: "retry",
    });

    await drainStockCalls(h.deps);

    expect(h.ran).toEqual(["restore", "other"]);
    expect(h.list().map((c) => c.id)).toEqual(["restore", "redeplete"]);
  });

  it("waits out the backoff, and holds the order's later calls while it does", async () => {
    const h = harness([entry("a", { attempts: 2, retryAt: 60_000 }), entry("b", { action: "redeplete" })]);

    const result = await drainStockCalls(h.deps);

    expect(h.ran).toEqual([]);
    expect(result).toEqual({ sent: 0, owed: 2, abandoned: 0 });
  });

  it("forgets and reports a call refused for good, then carries on with the order", async () => {
    const h = harness([entry("a"), entry("b", { action: "redeplete" })], { a: "permanent" });

    const result = await drainStockCalls(h.deps);

    expect(h.deps.reportAbandoned).toHaveBeenCalledWith({
      tenantId: "t1",
      orderId: "o1",
      action: "restore",
      reason: "refused",
      attempts: 1,
    });
    expect(h.ran).toEqual(["a", "b"]);
    expect(result).toEqual({ sent: 1, owed: 0, abandoned: 1 });
  });

  it("gives up on, and reports, a call out of attempts", async () => {
    const h = harness([entry("a", { attempts: MAX_STOCK_ATTEMPTS - 1, retryAt: 0 })], { a: "retry" });

    await drainStockCalls(h.deps);

    expect(h.list()).toEqual([]);
    expect(h.deps.reportAbandoned).toHaveBeenCalledWith(expect.objectContaining({ reason: "exhausted", attempts: MAX_STOCK_ATTEMPTS }));
  });

  it("only sends this store's calls", async () => {
    const h = harness([entry("mine"), entry("theirs", { tenantId: "t2", orderId: "o9" })]);

    await drainStockCalls(h.deps);

    expect(h.ran).toEqual(["mine"]);
    expect(h.list().map((c) => c.id)).toEqual(["theirs"]);
  });

  it("treats a thrown attempt as one that may not have landed", async () => {
    const h = harness([entry("a")]);
    h.deps.run.mockRejectedValueOnce(new Error("boom"));

    await expect(drainStockCalls(h.deps)).resolves.toMatchObject({ owed: 1 });
  });

  it("stops when the signed-in scope changes mid-run", async () => {
    const h = harness([entry("a", { orderId: "o1" }), entry("b", { orderId: "o2" })]);
    let active = true;
    h.deps.run.mockImplementationOnce(async () => {
      active = false;
      return "ok";
    });

    await drainStockCalls({ ...h.deps, isActive: () => active });

    expect(h.deps.run).toHaveBeenCalledTimes(1);
  });

  it("runs one drain at a time; a trigger mid-run gets a follow-up pass for what it queued", async () => {
    const h = harness([entry("a")]);
    let release: () => void = () => undefined;
    h.deps.run.mockImplementationOnce(
      (call: QueuedStockCall) => new Promise<StockPostOutcome>((resolve) => {
        h.ran.push(call.id);
        release = () => resolve("ok");
      }),
    );

    const first = drainStockCalls(h.deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // queued while "a" is still out: same order, must run after it
    const later = entry("b", { action: "redeplete" });
    const listed = h.deps.listCalls;
    const withLater = () => [...listed(), ...(h.ran.includes("b") ? [] : [later])];
    const second = drainStockCalls({ ...h.deps, listCalls: withLater });
    release();
    await Promise.all([first, second]);

    expect(h.ran).toEqual(["a", "b"]);
  });
});

describe("sendStockCall", () => {
  beforeEach(() => resetStockDrainForTests());

  it("persists the call BEFORE the first attempt, then starts a drain for its store", async () => {
    const order: string[] = [];
    const enqueue = jest.fn(async () => {
      order.push("enqueue");
      return entry("a");
    });
    const drain = jest.fn(async () => {
      order.push("drain");
      return { sent: 1, owed: 0, abandoned: 0 };
    });

    await sendStockCall({ tenantId: "t1", orderId: "o1", action: "restore", payload: {} }, { enqueue, drain });

    expect(order).toEqual(["enqueue", "drain"]);
    expect(drain).toHaveBeenCalledWith({ tenantId: "t1" });
  });

  it("skips a call that would move nothing", async () => {
    const enqueue = jest.fn();
    const drain = jest.fn();

    await sendStockCall({ tenantId: "t1", orderId: "o1", action: "deplete", payload: { items: [] } }, { enqueue, drain });
    await sendStockCall(
      { tenantId: "t1", orderId: "o1", action: "revise", payload: { revision: 2, deplete: [], restore: [] } },
      { enqueue, drain },
    );

    expect(enqueue).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });

  it("still tries once when the device cannot store the call, and never throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const enqueue = jest.fn().mockRejectedValue(new Error("disk full"));
    const drain = jest.fn();
    const run = jest.fn().mockResolvedValue("ok");

    await expect(
      sendStockCall({ tenantId: "t1", orderId: "o1", action: "restore", payload: {} }, { enqueue, drain, run }),
    ).resolves.toBeUndefined();

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", action: "restore" }));
    expect(drain).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("isNoopStockCall", () => {
  it.each([
    [{ action: "deplete", payload: { items: [] } }, true],
    [{ action: "deplete", payload: {} }, true],
    [{ action: "deplete", payload: { items: [{ menuItemId: "m", quantity: 1, optionIds: [] }] } }, false],
    [{ action: "revise", payload: { revision: 1, deplete: [], restore: [] } }, true],
    [{ action: "revise", payload: { revision: 1, deplete: [], restore: [{ menuItemId: "m", quantity: 1, optionIds: [] }] } }, false],
    [{ action: "restore", payload: {} }, false],
    [{ action: "redeplete", payload: {} }, false],
  ] as const)("%j → %s", (call, expected) => {
    expect(isNoopStockCall(call as never)).toBe(expected);
  });
});
