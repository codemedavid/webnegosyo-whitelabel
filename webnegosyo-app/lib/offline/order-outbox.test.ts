import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MAX_SYNC_ATTEMPTS,
  OUTBOX_STORAGE_KEY,
  enqueueSale,
  getOutbox,
  hydrateOutbox,
  isSaleQueued,
  markBookkeepingDone,
  markSaleWritten,
  needsAttention,
  parseStoredOutbox,
  recordSyncFailure,
  removeQueuedSale,
  resetOutboxForTests,
  subscribeOutbox,
  type QueuedSale,
} from "./order-outbox";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function sale(localId: string): QueuedSale {
  return {
    localId,
    tenantId: "tenant-1",
    backend: "platform",
    clientOrderId: `pos-${localId}`,
    createdAt: 1000,
    orderArgs: { total: 100, items: [] },
    bookkeeping: {
      stockItems: [],
      loyverseLines: [],
      discountLines: [],
      outletId: null,
      total: 100,
      customerName: "",
      customerContact: "",
      customerData: {},
      channel: null,
      captureItems: [],
    },
    attempts: 0,
    lastError: null,
  };
}

describe("order outbox", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetOutboxForTests();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
  });

  it("starts empty and unhydrated", () => {
    expect(getOutbox()).toEqual({ sales: [], isHydrated: false });
  });

  it("restores queued sales from disk, oldest first, ahead of anything new", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify([sale("a"), sale("b")]));
    await enqueueSale(sale("c"));
    expect(getOutbox().sales.map((s) => s.localId)).toEqual(["a", "b", "c"]);
    expect(getOutbox().isHydrated).toBe(true);
  });

  it("persists every change and never mutates the previous array", async () => {
    await enqueueSale(sale("a"));
    const before = getOutbox().sales;
    await enqueueSale(sale("b"));
    expect(before).toHaveLength(1);
    expect(getOutbox().sales).toHaveLength(2);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      OUTBOX_STORAGE_KEY,
      JSON.stringify([sale("a"), sale("b")])
    );
  });

  it("removes a synced sale and records a failed attempt on one that refused", async () => {
    await enqueueSale(sale("a"));
    await enqueueSale(sale("b"));
    await removeQueuedSale("a");
    expect(isSaleQueued("a")).toBe(false);
    expect(isSaleQueued("b")).toBe(true);

    await recordSyncFailure("b", "validator said no");
    expect(getOutbox().sales[0]).toMatchObject({ attempts: 1, lastError: "validator said no" });
  });

  it("removing an unknown sale changes nothing and writes nothing", async () => {
    await enqueueSale(sale("a"));
    storage.setItem.mockClear();
    await removeQueuedSale("zzz");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("notifies subscribers on every change", async () => {
    const listener = jest.fn();
    subscribeOutbox(listener);
    await hydrateOutbox();
    await enqueueSale(sale("a"));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("drops corrupt disk entries rather than crashing the register", () => {
    expect(parseStoredOutbox("{nope")).toEqual([]);
    expect(parseStoredOutbox(JSON.stringify([{ localId: 1 }, sale("ok")]))).toEqual([sale("ok")]);
    expect(parseStoredOutbox(JSON.stringify({ not: "an array" }))).toEqual([]);
  });

  it("keeps the replay's progress markers on disk, so a crash resumes instead of repeating", async () => {
    await enqueueSale(sale("a"));
    await markSaleWritten("a", "server-a");
    expect(getOutbox().sales[0]).toMatchObject({ syncedOrderId: "server-a" });
    expect(getOutbox().sales[0].bookkeepingDone).toBeUndefined();

    await markBookkeepingDone("a");
    expect(getOutbox().sales[0]).toMatchObject({ syncedOrderId: "server-a", bookkeepingDone: true });
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)?.[1] as string)[0]).toMatchObject({
      bookkeepingDone: true,
    });
  });

  it("marks a sale as needing a person once the server has refused it enough times", () => {
    expect(needsAttention({ ...sale("a"), attempts: MAX_SYNC_ATTEMPTS - 1 })).toBe(false);
    expect(needsAttention({ ...sale("a"), attempts: MAX_SYNC_ATTEMPTS })).toBe(true);
  });

  it("survives a storage failure on read and write", async () => {
    storage.getItem.mockRejectedValue(new Error("disk"));
    storage.setItem.mockRejectedValue(new Error("disk"));
    await expect(enqueueSale(sale("a"))).resolves.toBeUndefined();
    expect(isSaleQueued("a")).toBe(true);
  });
});
