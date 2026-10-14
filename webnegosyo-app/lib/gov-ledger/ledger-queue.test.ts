import type { RecordGovDiscountRequest } from "../gov-discount";
import {
  GOV_LEDGER_ROUTE,
  GOV_LEDGER_STORAGE_KEY,
  createGovLedgerQueue,
  parseQueue,
  type KeyValueStorage,
} from "./ledger-queue";
import { completeGovRecord, govRecordDraft, ledgerBackendOf } from "./record-request";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

const request = (revision = 0, orderId = "o1"): RecordGovDiscountRequest =>
  completeGovRecord(
    govRecordDraft({
      cart: [],
      government: null,
      outletId: null,
      revision,
      occurredAt: new Date("2026-10-12T04:00:00.000Z"),
      orderTotal: 400,
      serviceCharge: 0,
      deliveryFee: 0,
      allowShared: true,
      approvalId: null,
      approvalSkippedOffline: false,
    }),
    { tenantId: "t1", backend: "platform", orderId },
  );

describe("the Senior/PWD ledger queue", () => {
  it("keeps a record on the device until the platform takes it", async () => {
    const storage = memoryStorage();
    const post = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const queue = createGovLedgerQueue(storage, post);

    await queue.enqueue(request());
    expect(await queue.flush()).toBe(1);
    expect((await queue.pending())[0].attempts).toBe(1);

    expect(await queue.flush()).toBe(0);
    expect(post).toHaveBeenCalledWith(GOV_LEDGER_ROUTE, request());
  });

  it("treats a thrown post as not sent", async () => {
    const queue = createGovLedgerQueue(memoryStorage(), jest.fn().mockRejectedValue(new Error("offline")));
    await queue.enqueue(request());
    expect(await queue.flush()).toBe(1);
  });

  it("holds one entry per order revision", async () => {
    const queue = createGovLedgerQueue(memoryStorage(), jest.fn().mockResolvedValue(false));

    await queue.enqueue(request(0));
    await queue.enqueue(request(0));
    await queue.enqueue(request(1));

    expect((await queue.pending()).map((entry) => entry.id)).toEqual(["t1|platform_supabase|o1|0", "t1|platform_supabase|o1|1"]);
  });

  it("never loses an entry when an enqueue races a flush", async () => {
    const storage = memoryStorage();
    let release: (value: boolean) => void = () => undefined;
    const post = jest.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    const queue = createGovLedgerQueue(storage, post);

    await queue.enqueue(request(0, "a"));
    const flushing = queue.flush();
    const enqueuing = queue.enqueue(request(0, "b"));
    while (post.mock.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    release(true);
    await Promise.all([flushing, enqueuing]);

    expect((await queue.pending()).map((entry) => entry.request.externalOrderId)).toEqual(["b"]);
  });

  it("sends one order's revisions oldest first and stops that order at its first failure", async () => {
    const storage = memoryStorage();
    const sent: string[] = [];
    const post = jest.fn(async (_path: string, body: unknown) => {
      const record = body as RecordGovDiscountRequest;
      sent.push(`${record.externalOrderId}#${record.revision}`);
      return !(record.externalOrderId === "o1" && record.revision === 1);
    });
    const queue = createGovLedgerQueue(storage, post);
    await queue.enqueue(request(2, "o1"));
    await queue.enqueue(request(1, "o1"));
    await queue.enqueue(request(0, "o2"));
    await queue.enqueue(request(0, "o1"));

    const waiting = await queue.flush();

    // o1#2 is never sent while o1#1 is still waiting — the server would
    // otherwise record a newer revision before an older one.
    expect(sent).toEqual(["o1#0", "o1#1", "o2#0"]);
    expect(waiting).toBe(2);
    expect((await queue.pending()).map((entry) => entry.request.revision).sort()).toEqual([1, 2]);
  });

  it("survives a damaged storage value", () => {
    expect(parseQueue("{not json")).toEqual([]);
    expect(parseQueue(JSON.stringify([{ id: 1 }]))).toEqual([]);
    expect(parseQueue(null)).toEqual([]);
  });

  it("stores under its own key", async () => {
    const storage = memoryStorage();
    await createGovLedgerQueue(storage, jest.fn()).enqueue(request());
    expect(storage.data.has(GOV_LEDGER_STORAGE_KEY)).toBe(true);
  });
});

describe("record drafts", () => {
  it("maps the register's backend onto the ledger's names", () => {
    expect(ledgerBackendOf("platform")).toBe("platform_supabase");
    expect(ledgerBackendOf("convex")).toBe("convex");
    expect(ledgerBackendOf("supabase")).toBe("tenant_supabase");
  });
});
