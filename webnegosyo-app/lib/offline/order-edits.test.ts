import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ORDER_EDITS_STORAGE_KEY,
  MAX_EDIT_ATTEMPTS,
  enqueueOrderEdit,
  getOrderEdits,
  hasPendingOrderEdits,
  hydrateOrderEdits,
  isOrderEditStuck,
  parseStoredOrderEdits,
  rebindOrderEdits,
  recordOrderEditFailure,
  removeOrderEdit,
  requeueSignedOutEditRefusals,
  resetOrderEditsForTests,
  subscribeOrderEdits,
  type QueuedOrderEdit,
} from "./order-edits";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function edit(editId: string, overrides: Partial<QueuedOrderEdit> = {}): QueuedOrderEdit {
  return {
    editId,
    tenantId: "tenant-1",
    backend: "platform",
    orderId: "order-1",
    ref: "orders:updateOrderStatus",
    args: { orderId: "order-1", status: "preparing" },
    createdAt: 1000,
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

describe("order edits queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetOrderEditsForTests();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
  });

  it("persists an enqueued edit before publishing it", async () => {
    await enqueueOrderEdit(edit("e1"));

    expect(storage.setItem).toHaveBeenCalledWith(ORDER_EDITS_STORAGE_KEY, JSON.stringify([edit("e1")]));
    expect(getOrderEdits().edits).toEqual([edit("e1")]);
    expect(getOrderEdits().isHydrated).toBe(true);
  });

  it("restores edits saved before a restart", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify([edit("e1")]));

    await hydrateOrderEdits();

    expect(getOrderEdits().edits).toEqual([edit("e1")]);
  });

  it("refuses a damaged queue instead of silently dropping changes", () => {
    expect(() => parseStoredOrderEdits(JSON.stringify([{ editId: "e1" }]))).toThrow(/damaged/);
    expect(parseStoredOrderEdits(null)).toEqual([]);
  });

  it("removes one edit and leaves the rest", async () => {
    await enqueueOrderEdit(edit("e1"));
    await enqueueOrderEdit(edit("e2"));

    await removeOrderEdit("e1");

    expect(getOrderEdits().edits.map((e) => e.editId)).toEqual(["e2"]);
  });

  it("counts refusals and marks an edit stuck after the limit", async () => {
    await enqueueOrderEdit(edit("e1"));

    for (let i = 0; i < MAX_EDIT_ATTEMPTS; i += 1) {
      await recordOrderEditFailure("e1", "refused");
    }

    const [stored] = getOrderEdits().edits;
    expect(stored.attempts).toBe(MAX_EDIT_ATTEMPTS);
    expect(stored.lastError).toBe("refused");
    expect(isOrderEditStuck(stored)).toBe(true);
  });

  it("rebinds edits from a device id to the server id, args included", async () => {
    await enqueueOrderEdit(edit("e1", { orderId: "local-1", args: { orderId: "local-1", status: "ready" } }));
    await enqueueOrderEdit(edit("e2", { orderId: "other" }));

    await rebindOrderEdits("local-1", "server-1");

    const [first, second] = getOrderEdits().edits;
    expect(first.orderId).toBe("server-1");
    expect(first.args).toEqual({ orderId: "server-1", status: "ready" });
    expect(second.orderId).toBe("other");
  });

  it("reports whether an order still has changes waiting", async () => {
    await enqueueOrderEdit(edit("e1", { orderId: "order-9" }));

    expect(hasPendingOrderEdits("order-9")).toBe(true);
    expect(hasPendingOrderEdits("order-1")).toBe(false);
  });

  it("notifies subscribers on every change", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeOrderEdits(listener);

    await enqueueOrderEdit(edit("e1"));
    unsubscribe();
    await removeOrderEdit("e1");

    expect(listener).toHaveBeenCalled();
    const callsAfterUnsubscribe = listener.mock.calls.length;
    await enqueueOrderEdit(edit("e2"));
    expect(listener.mock.calls.length).toBe(callsAfterUnsubscribe);
  });

  it("does not publish an edit the disk refused", async () => {
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));

    await expect(enqueueOrderEdit(edit("e1"))).rejects.toThrow("disk full");
    expect(getOrderEdits().edits).toEqual([]);

    await enqueueOrderEdit(edit("e2"));
    expect(getOrderEdits().edits.map((e) => e.editId)).toEqual(["e2"]);
  });

  it("gives changes refused while signed out a fresh set of attempts", async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify([
        edit("signed-out", { attempts: MAX_EDIT_ATTEMPTS, lastError: "JWT expired" }),
        edit("refused", { attempts: MAX_EDIT_ATTEMPTS, lastError: "Not allowed" }),
        edit("retrying", { attempts: 1, lastError: "new row violates row-level security policy" }),
      ])
    );

    expect(await requeueSignedOutEditRefusals()).toBe(1);

    const byId = Object.fromEntries(getOrderEdits().edits.map((entry) => [entry.editId, entry]));
    expect(byId["signed-out"]).toMatchObject({ attempts: 0, lastError: null });
    expect(byId.refused).toMatchObject({ attempts: MAX_EDIT_ATTEMPTS, lastError: "Not allowed" });
    expect(byId.retrying.attempts).toBe(1);
  });
});
