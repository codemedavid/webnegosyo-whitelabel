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
  requeueSignedOutRefusals,
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

  it("preserves corrupt ledgers instead of overwriting paid sales", async () => {
    for (const raw of ["{nope", JSON.stringify([{ localId: 1 }, sale("ok")]), "{}"] ) {
      storage.getItem.mockResolvedValueOnce(raw);
      await expect(enqueueSale(sale("new"))).rejects.toThrow();
      expect(getOutbox().isHydrated).toBe(false);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
    storage.getItem.mockResolvedValueOnce(JSON.stringify([sale("recovered")]));
    await enqueueSale(sale("new"));
    expect(getOutbox().sales.map((entry) => entry.localId)).toEqual(["recovered", "new"]);
    expect(parseStoredOutbox(null)).toEqual([]);
  });

  it.each([
    { attempts: undefined }, { backend: "unknown" }, { createdAt: null },
    { bookkeeping: {} }, { orderArgs: [] }, { syncedOrderId: 7 },
  ])("rejects malformed replay data without discarding it: %j", (patch) => {
    expect(() => parseStoredOutbox(JSON.stringify([{ ...sale("a"), ...patch }]))).toThrow();
  });

  it("does not overwrite an unreadable ledger and retries hydration", async () => {
    storage.getItem.mockRejectedValueOnce(new Error("disk read failed"));
    await expect(enqueueSale(sale("new"))).rejects.toThrow("disk read failed");
    expect(storage.setItem).not.toHaveBeenCalled();
    storage.getItem.mockResolvedValueOnce(JSON.stringify([sale("existing")]));
    await enqueueSale(sale("new"));
    expect(getOutbox().sales).toHaveLength(2);
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

  it("deduplicates retried checkout by tenant and client order id", async () => {
    await enqueueSale(sale("a"));
    await enqueueSale({ ...sale("retry"), clientOrderId: "pos-a" });
    expect(getOutbox().sales.map((entry) => entry.localId)).toEqual(["a"]);
  });

  it("serializes writes and exposes a sale only after it is durable", async () => {
    await hydrateOutbox();
    let release!: () => void;
    storage.setItem.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const first = enqueueSale(sale("a"));
    await new Promise((resolve) => setImmediate(resolve));
    const second = enqueueSale(sale("b"));
    await new Promise((resolve) => setImmediate(resolve));
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(getOutbox().sales).toHaveLength(0);
    release();
    await Promise.all([first, second]);
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1])).toEqual([sale("a"), sale("b")]);
  });

  it("marks a sale as needing a person once the server has refused it enough times", () => {
    expect(needsAttention({ ...sale("a"), attempts: MAX_SYNC_ATTEMPTS - 1 })).toBe(false);
    expect(needsAttention({ ...sale("a"), attempts: MAX_SYNC_ATTEMPTS })).toBe(true);
  });

  it("refuses an unsaved sale and leaves memory unchanged when the disk write fails", async () => {
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(enqueueSale(sale("a"))).rejects.toThrow("disk full");
    expect(isSaleQueued("a")).toBe(false);
    await enqueueSale(sale("b"));
    expect(getOutbox().sales.map((entry) => entry.localId)).toEqual(["b"]);
  });

  describe("requeueSignedOutRefusals", () => {
    // Gungjeon Central, 2026-10-04: the register kept selling after its session
    // was revoked. Each replay went out as the anonymous role and came back as
    // an RLS refusal, which the outbox counted against the SALE — five of
    // those and a paid sale was parked for good, for a reason that said
    // nothing about the sale itself.
    const SIGNED_OUT_REFUSAL = 'new row violates row-level security policy for table "orders"';

    async function park(localId: string, message: string) {
      await enqueueSale(sale(localId));
      for (let i = 0; i < MAX_SYNC_ATTEMPTS; i += 1) await recordSyncFailure(localId, message);
    }

    it("gives a sale parked by a signed-out device a fresh set of attempts", async () => {
      await park("a", SIGNED_OUT_REFUSAL);
      expect(needsAttention(getOutbox().sales[0])).toBe(true);

      const requeued = await requeueSignedOutRefusals();

      expect(requeued).toBe(1);
      expect(getOutbox().sales[0]).toMatchObject({ localId: "a", attempts: 0, lastError: null });
      expect(needsAttention(getOutbox().sales[0])).toBe(false);
    });

    it("recognises an expired or missing token the same way", async () => {
      await park("a", "JWT expired");
      await park("b", "No API key found in request");

      expect(await requeueSignedOutRefusals()).toBe(2);
    });

    it("leaves a sale the server refused on its merits parked for a person", async () => {
      await park("a", 'insert or update on table "order_items" violates foreign key constraint');

      expect(await requeueSignedOutRefusals()).toBe(0);
      expect(needsAttention(getOutbox().sales[0])).toBe(true);
    });

    it("does not touch a sale still being retried", async () => {
      await enqueueSale(sale("a"));
      await recordSyncFailure("a", SIGNED_OUT_REFUSAL);

      expect(await requeueSignedOutRefusals()).toBe(0);
      expect(getOutbox().sales[0].attempts).toBe(1);
    });

    it("returns new objects instead of editing the stored ones", async () => {
      await park("a", SIGNED_OUT_REFUSAL);
      const before = getOutbox().sales[0];

      await requeueSignedOutRefusals();

      expect(before.attempts).toBe(MAX_SYNC_ATTEMPTS);
    });
  });
});
