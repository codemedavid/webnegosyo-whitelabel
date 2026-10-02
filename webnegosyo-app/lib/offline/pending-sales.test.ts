import type { QueuedSale } from "./order-outbox";
import { FRESH_SALE_GRACE_MS, summarizePendingSales } from "./pending-sales";

const NOW = 1_000_000;

function sale(overrides: Partial<QueuedSale> = {}): QueuedSale {
  return {
    localId: "a",
    tenantId: "tenant-1",
    backend: "platform",
    clientOrderId: "pos-a",
    createdAt: NOW,
    orderArgs: {},
    bookkeeping: {
      stockItems: [],
      loyverseLines: [],
      discountLines: [],
      outletId: null,
      total: 10,
      customerName: "",
      customerContact: "",
      customerData: {},
      channel: null,
      captureItems: [],
    },
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

const scope = { tenantId: "tenant-1", backend: "platform" as const, now: NOW };

describe("summarizePendingSales", () => {
  it("keeps a sale that is saving normally out of the banner while online", () => {
    expect(summarizePendingSales([sale()], { ...scope, isOnline: true })).toEqual({
      pending: 0,
      stuck: 0,
      hasFreshSales: true,
    });
  });

  it("reports a sale that is taking longer than the grace period", () => {
    const slow = sale({ createdAt: NOW - FRESH_SALE_GRACE_MS - 1 });
    expect(summarizePendingSales([slow], { ...scope, isOnline: true })).toMatchObject({
      pending: 1,
      hasFreshSales: false,
    });
  });

  it("reports a sale the server has refused at least once, however new", () => {
    const retried = sale({ attempts: 1, lastError: "refused" });
    expect(summarizePendingSales([retried], { ...scope, isOnline: true }).pending).toBe(1);
  });

  it("counts every queued sale while offline — they really are waiting", () => {
    expect(summarizePendingSales([sale()], { ...scope, isOnline: false }).pending).toBe(1);
  });

  it("counts stuck sales and sales from another backend as needing a person", () => {
    const stuck = sale({ localId: "b", attempts: 5 });
    const otherBackend = sale({ localId: "c", backend: "convex" });
    expect(
      summarizePendingSales([stuck, otherBackend], { ...scope, isOnline: true }),
    ).toMatchObject({ pending: 0, stuck: 2 });
  });

  it("ignores another store's sales", () => {
    expect(
      summarizePendingSales([sale({ tenantId: "tenant-2" })], { ...scope, isOnline: false }),
    ).toEqual({ pending: 0, stuck: 0, hasFreshSales: false });
  });
});
