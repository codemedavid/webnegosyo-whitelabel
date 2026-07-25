import {
  buildTenantOrdersPage,
  fetchTenantOrdersPage,
  fetchTenantOrderById,
  fetchTenantOrderStats,
} from "@/lib/tenant-supabase-orders-read";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * P5 — reading a tenant's orders back out of their OWN Supabase project.
 *
 * The admin queue is the merchant's operational surface: if these reads point at
 * the wrong project, or quietly drop the tenant filter, or mis-report the page
 * count, the merchant either sees nothing or sees somebody else's orders.
 */

interface QueryCall {
  table: string;
  select?: string;
  count?: string;
  eq: Array<[string, unknown]>;
  gte: Array<[string, unknown]>;
  order?: [string, { ascending: boolean }];
  range?: [number, number];
  single?: boolean;
}

interface FakeResult {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

/**
 * Records the query the module builds and resolves with a canned result.
 * Chainable methods return `this`; awaiting the builder resolves it, which is
 * how the real postgrest builder behaves.
 */
function makeFakeClient(result: FakeResult) {
  const calls: QueryCall[] = [];

  const makeBuilder = (call: QueryCall) => {
    const builder = {
      select(select: string, options?: { count?: string }) {
        call.select = select;
        call.count = options?.count;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eq.push([column, value]);
        return builder;
      },
      gte(column: string, value: unknown) {
        call.gte.push([column, value]);
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        call.order = [column, options];
        return builder;
      },
      range(from: number, to: number) {
        call.range = [from, to];
        return builder;
      },
      single() {
        call.single = true;
        return Promise.resolve(result);
      },
      then(onFulfilled: (value: FakeResult) => unknown) {
        return Promise.resolve(result).then(onFulfilled);
      },
    };
    return builder;
  };

  const client = {
    from(table: string) {
      const call: QueryCall = { table, eq: [], gte: [] };
      calls.push(call);
      return makeBuilder(call);
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const ORDER_ROW = {
  id: "order-1",
  tenant_id: "tenant-1",
  total: 250,
  status: "pending",
  created_at: "2026-07-25T01:00:00.000Z",
  order_items: [{ id: "item-1", menu_item_name: "Latte", quantity: 1 }],
};

describe("buildTenantOrdersPage", () => {
  it("reports the page position for a full first page", () => {
    const page = buildTenantOrdersPage([ORDER_ROW], 45, 1, 20);

    expect(page.currentPage).toBe(1);
    expect(page.totalCount).toBe(45);
    expect(page.totalPages).toBe(3);
    expect(page.hasNextPage).toBe(true);
    expect(page.hasPreviousPage).toBe(false);
  });

  it("reports no next page on the last page", () => {
    const page = buildTenantOrdersPage([ORDER_ROW], 45, 3, 20);

    expect(page.hasNextPage).toBe(false);
    expect(page.hasPreviousPage).toBe(true);
  });

  it("returns an empty, navigable page when the tenant has no orders yet", () => {
    const page = buildTenantOrdersPage([], 0, 1, 20);

    expect(page.orders).toEqual([]);
    expect(page.totalPages).toBe(0);
    expect(page.hasNextPage).toBe(false);
    expect(page.hasPreviousPage).toBe(false);
  });

  it("treats a null count from postgrest as zero rather than NaN", () => {
    const page = buildTenantOrdersPage([], null, 1, 20);

    expect(page.totalCount).toBe(0);
    expect(page.totalPages).toBe(0);
  });
});

describe("fetchTenantOrdersPage", () => {
  it("reads orders with their line items from the tenant project", async () => {
    const { client, calls } = makeFakeClient({
      data: [ORDER_ROW],
      error: null,
      count: 1,
    });

    const page = await fetchTenantOrdersPage(client, "tenant-1");

    expect(calls[0].table).toBe("orders");
    expect(calls[0].select).toContain("order_items");
    expect(page.orders).toHaveLength(1);
  });

  it("always scopes the query to the tenant", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1");

    expect(calls[0].eq).toContainEqual(["tenant_id", "tenant-1"]);
  });

  it("requests an exact count so the merchant sees a real page total", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1");

    expect(calls[0].count).toBe("exact");
  });

  it("shows newest orders first", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1");

    expect(calls[0].order).toEqual(["created_at", { ascending: false }]);
  });

  it("translates page and limit into a postgrest range", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", { page: 3, limit: 20 });

    expect(calls[0].range).toEqual([40, 59]);
  });

  it("defaults to the first page of 20 when no pagination is given", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1");

    expect(calls[0].range).toEqual([0, 19]);
  });

  it("filters by status when one is selected", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", { status: "preparing" });

    expect(calls[0].eq).toContainEqual(["status", "preparing"]);
  });

  it("treats the 'all' status as no filter", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", { status: "all" });

    expect(calls[0].eq.map(([column]) => column)).not.toContain("status");
  });

  it("filters by order type when one is selected", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", { orderType: "delivery" });

    expect(calls[0].eq).toContainEqual(["order_type", "delivery"]);
  });

  it("treats the 'all' order type as no filter", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null, count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", { orderType: "all" });

    expect(calls[0].eq.map(([column]) => column)).not.toContain("order_type");
  });

  it("throws when the tenant project rejects the read", async () => {
    const { client } = makeFakeClient({
      data: null,
      error: { message: "JWT expired" },
      count: null,
    });

    await expect(fetchTenantOrdersPage(client, "tenant-1")).rejects.toThrow(
      /JWT expired/
    );
  });

  it("returns an empty page rather than null rows when the project returns no data", async () => {
    const { client } = makeFakeClient({ data: null, error: null, count: 0 });

    const page = await fetchTenantOrdersPage(client, "tenant-1");

    expect(page.orders).toEqual([]);
  });
});

describe("fetchTenantOrderStats", () => {
  it("summarizes today's orders from the tenant project", async () => {
    const { client } = makeFakeClient({
      data: [
        { status: "pending", total: 100 },
        { status: "cancelled", total: 999 },
      ],
      error: null,
    });

    const stats = await fetchTenantOrderStats(client, "tenant-1");

    expect(stats.todayOrders).toBe(1);
    expect(stats.todayRevenue).toBe(100);
    expect(stats.pendingOrders).toBe(1);
  });

  it("only reads orders from today onward", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null });

    await fetchTenantOrderStats(client, "tenant-1");

    expect(calls[0].gte.map(([column]) => column)).toContain("created_at");
  });

  it("scopes the stats query to the tenant", async () => {
    const { client, calls } = makeFakeClient({ data: [], error: null });

    await fetchTenantOrderStats(client, "tenant-1");

    expect(calls[0].eq).toContainEqual(["tenant_id", "tenant-1"]);
  });

  it("throws when the tenant project rejects the stats read", async () => {
    const { client } = makeFakeClient({
      data: null,
      error: { message: "relation \"orders\" does not exist" },
    });

    await expect(fetchTenantOrderStats(client, "tenant-1")).rejects.toThrow(
      /does not exist/
    );
  });
});

describe("fetchTenantOrderById", () => {
  it("reads a single order with its items", async () => {
    const { client, calls } = makeFakeClient({ data: ORDER_ROW, error: null });

    const order = await fetchTenantOrderById(client, "tenant-1", "order-1");

    expect(calls[0].single).toBe(true);
    expect(calls[0].select).toContain("order_items");
    expect(order?.id).toBe("order-1");
  });

  it("scopes the lookup to the tenant so an id from another tenant cannot be read", async () => {
    const { client, calls } = makeFakeClient({ data: ORDER_ROW, error: null });

    await fetchTenantOrderById(client, "tenant-1", "order-1");

    expect(calls[0].eq).toContainEqual(["tenant_id", "tenant-1"]);
    expect(calls[0].eq).toContainEqual(["id", "order-1"]);
  });

  it("returns null when the order does not exist", async () => {
    const { client } = makeFakeClient({
      data: null,
      error: { message: "No rows found", code: "PGRST116" } as {
        message: string;
      },
      count: null,
    });

    await expect(
      fetchTenantOrderById(client, "tenant-1", "missing")
    ).resolves.toBeNull();
  });

  it("throws on a real read failure instead of pretending the order is missing", async () => {
    const { client } = makeFakeClient({
      data: null,
      error: { message: "connection refused" },
      count: null,
    });

    await expect(
      fetchTenantOrderById(client, "tenant-1", "order-1")
    ).rejects.toThrow(/connection refused/);
  });
});
