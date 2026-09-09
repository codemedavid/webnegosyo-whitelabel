/**
 * Optimistic patches to the cached order reads.
 *
 * A status advance and a collected payment both take a round trip before the
 * platform read comes back; meanwhile the row still shows the old state and a
 * second tap is tempting. These patch the cache in place, immutably, and hand
 * back a rollback for the failure path. Only the tenant's own order keys are
 * touched — never another tenant's, never an analytics ref.
 */
import { QueryClient } from "@tanstack/query-core";
import { platformQueryKey } from "../backends/query-keys";
import {
  appendOrderPaymentInCache,
  patchOrderStatusInCache,
  patchOrderStatusRows,
} from "./optimistic-order-status";

const ALL = { kind: "all" } as const;

interface Row {
  _id: string;
  status: string;
  total: number;
}

const rows: Row[] = [
  { _id: "o1", status: "pending", total: 100 },
  { _id: "o2", status: "confirmed", total: 200 },
];

describe("patchOrderStatusRows", () => {
  it("returns a new array with only the matching row changed", () => {
    const patched = patchOrderStatusRows(rows, "o1", "confirmed");

    expect(patched).not.toBe(rows);
    expect(patched?.[0]).toEqual({ _id: "o1", status: "confirmed", total: 100 });
    expect(patched?.[1]).toBe(rows[1]);
    expect(rows[0].status).toBe("pending");
  });

  it("returns the same array when the order is not in it", () => {
    expect(patchOrderStatusRows(rows, "missing", "ready")).toBe(rows);
    expect(patchOrderStatusRows(undefined, "o1", "ready")).toBeUndefined();
  });
});

describe("patchOrderStatusInCache", () => {
  let client: QueryClient;
  const listKey = platformQueryKey("orders:getOrders", {}, "t1", ALL);
  const deepKey = platformQueryKey("orders:getOrders", { limit: 2000 }, "t1", ALL);
  const detailKey = platformQueryKey("orders:getOrderById", { orderId: "o1" }, "t1", ALL);
  const otherTenantKey = platformQueryKey("orders:getOrders", {}, "t2", ALL);
  const analyticsKey = platformQueryKey("analytics:getTrends", { daysBack: 7 }, "t1", ALL);

  beforeEach(() => {
    client = new QueryClient();
    client.setQueryData(listKey, rows);
    client.setQueryData(deepKey, rows);
    client.setQueryData(detailKey, rows[0]);
    client.setQueryData(otherTenantKey, rows);
    client.setQueryData(analyticsKey, [{ date: "2026-09-01" }]);
  });

  afterEach(() => client.clear());

  it("patches every cached order list and the detail row of that tenant", () => {
    patchOrderStatusInCache(client, "t1", "o1", "confirmed");

    expect((client.getQueryData(listKey) as Row[])[0].status).toBe("confirmed");
    expect((client.getQueryData(deepKey) as Row[])[0].status).toBe("confirmed");
    expect((client.getQueryData(detailKey) as Row).status).toBe("confirmed");
  });

  it("leaves other tenants and non-order refs untouched", () => {
    patchOrderStatusInCache(client, "t1", "o1", "confirmed");

    expect(client.getQueryData(otherTenantKey)).toBe(rows);
    expect(client.getQueryData(analyticsKey)).toEqual([{ date: "2026-09-01" }]);
  });

  // Structurally equal, not the same reference: the cache shares structure on write.
  it("rolls back to the exact previous data", () => {
    const rollback = patchOrderStatusInCache(client, "t1", "o1", "confirmed");

    rollback();

    expect(client.getQueryData(listKey)).toEqual(rows);
    expect(client.getQueryData(detailKey)).toEqual(rows[0]);
  });

  it("is a no-op with nothing to roll back when the cache holds no order keys", () => {
    const empty = new QueryClient();

    const rollback = patchOrderStatusInCache(empty, "t1", "o1", "confirmed");

    expect(() => rollback()).not.toThrow();
    expect(empty.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("appendOrderPaymentInCache", () => {
  let client: QueryClient;
  const ledgerKey = platformQueryKey("orders:getOrderPayments", { orderId: "o1" }, "t1", ALL);
  const otherLedgerKey = platformQueryKey("orders:getOrderPayments", { orderId: "o2" }, "t1", ALL);
  const existing = [{ _id: "p0", _creationTime: 1, kind: "charge" as const, amount: 50 }];
  const payment = { _id: "p1", _creationTime: 2, kind: "charge" as const, amount: 100 };

  beforeEach(() => {
    client = new QueryClient();
    client.setQueryData(ledgerKey, existing);
    client.setQueryData(otherLedgerKey, existing);
  });

  afterEach(() => client.clear());

  it("appends the payment to that order's ledger only", () => {
    appendOrderPaymentInCache(client, "t1", "o1", payment);

    expect(client.getQueryData(ledgerKey)).toEqual([...existing, payment]);
    expect(client.getQueryData(otherLedgerKey)).toBe(existing);
    expect(existing).toHaveLength(1);
  });

  it("rolls back to the previous ledger", () => {
    const rollback = appendOrderPaymentInCache(client, "t1", "o1", payment);

    rollback();

    expect(client.getQueryData(ledgerKey)).toEqual(existing);
  });
});
