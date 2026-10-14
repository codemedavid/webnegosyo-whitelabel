import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STOCK_CALL_QUEUE_STORAGE_KEY,
  deferStockCall,
  enqueueStockCall,
  getStockCalls,
  hydrateStockCalls,
  parseStoredStockCalls,
  removeStockCall,
  resetStockCallsForTests,
  type NewStockCall,
} from "./stock-call-queue";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function call(overrides: Partial<NewStockCall> = {}): NewStockCall {
  return { tenantId: "t1", orderId: "o1", action: "restore", payload: { source: "merchant_app" }, ...overrides };
}

function stored(): unknown[] {
  const writes = storage.setItem.mock.calls.filter(([key]) => key === STOCK_CALL_QUEUE_STORAGE_KEY);
  return JSON.parse(String(writes[writes.length - 1]?.[1] ?? "[]"));
}

/**
 * Stock calls a screen fires and forgets — a status change's restore or
 * re-spend, an order edit's revision, a scanned QR sale's depletion — used to
 * be retried for ~40 seconds in memory. A killed app or a long outage lost them
 * for good, and the shelf stayed wrong. They are now written to the device
 * BEFORE the first attempt and kept until the platform answers for good.
 */
describe("stock-call queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStockCallsForTests();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
  });

  it("persists a new call with no attempts yet, due at once", async () => {
    const queued = await enqueueStockCall(call(), 1_000);

    expect(queued).toMatchObject({ tenantId: "t1", orderId: "o1", action: "restore", attempts: 0, retryAt: null, createdAt: 1_000 });
    expect(typeof queued.id).toBe("string");
    expect(stored()).toEqual([queued]);
    expect(getStockCalls()).toEqual([queued]);
  });

  it("keeps calls in the order they were queued", async () => {
    await enqueueStockCall(call({ action: "restore" }), 1);
    await enqueueStockCall(call({ action: "redeplete" }), 2);
    expect(getStockCalls().map((entry) => entry.action)).toEqual(["restore", "redeplete"]);
  });

  it("drops a repeat of the order's latest queued call (a double tap)", async () => {
    const first = await enqueueStockCall(call(), 1);
    const second = await enqueueStockCall(call(), 2);

    expect(second).toEqual(first);
    expect(getStockCalls()).toHaveLength(1);
  });

  it("keeps a repeat that follows a different call for the same order", async () => {
    // cancel → reinstate → cancel again: the last restore is real, not a repeat.
    await enqueueStockCall(call({ action: "restore" }), 1);
    await enqueueStockCall(call({ action: "redeplete" }), 2);
    await enqueueStockCall(call({ action: "restore" }), 3);
    expect(getStockCalls().map((entry) => entry.action)).toEqual(["restore", "redeplete", "restore"]);
  });

  it("treats revisions of one order as distinct calls, and a repeated revision as one", async () => {
    const revise = (revision: number) => call({ action: "revise", payload: { revision, deplete: [], restore: [] } });
    await enqueueStockCall(revise(2), 1);
    await enqueueStockCall(revise(2), 2);
    await enqueueStockCall(revise(3), 3);
    expect(getStockCalls().map((entry) => entry.payload.revision)).toEqual([2, 3]);
  });

  it("records an attempt and the time to retry", async () => {
    const queued = await enqueueStockCall(call(), 1);
    await deferStockCall(queued.id, 1, 31_000);
    expect(getStockCalls()[0]).toMatchObject({ attempts: 1, retryAt: 31_000 });
  });

  it("forgets a call", async () => {
    const queued = await enqueueStockCall(call(), 1);
    await removeStockCall(queued.id);
    expect(getStockCalls()).toEqual([]);
    expect(stored()).toEqual([]);
  });

  it("reads back what an earlier run of the app queued", async () => {
    const saved = [{ id: "s1", tenantId: "t1", orderId: "o1", action: "redeplete", payload: {}, attempts: 3, retryAt: 9, createdAt: 1 }];
    storage.getItem.mockResolvedValue(JSON.stringify(saved));

    await hydrateStockCalls();

    expect(getStockCalls()).toEqual(saved);
  });
});

describe("parseStoredStockCalls", () => {
  it("drops damaged entries instead of refusing the whole queue", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const good = { id: "s1", tenantId: "t1", orderId: "o1", action: "deplete", payload: { items: [] }, attempts: 0, retryAt: null, createdAt: 1 };
    const raw = JSON.stringify([good, { id: "s2", action: "explode" }, null]);

    expect(parseStoredStockCalls(raw)).toEqual([good]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reads nothing as an empty queue", () => {
    expect(parseStoredStockCalls(null)).toEqual([]);
  });
});
