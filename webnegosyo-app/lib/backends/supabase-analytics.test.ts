import {
  isPlatformAnalyticsRef,
  runPlatformAnalyticsQuery,
} from "./supabase-analytics";
import { eqFiltersOn, fakePlatformClient, opsOf } from "./testing/fake-platform-client";

/**
 * The analytics half of the platform adapter. Beyond the figures (covered by
 * `analytics-compute.test.ts`), what matters here is the query SHAPE: every
 * read is scoped to the tenant — a superadmin's RLS policy grants every
 * tenant's rows, so an unscoped read inside an impersonated store would chart
 * another merchant's revenue — and arguments from the screen are validated
 * before they reach PostgREST.
 */

const TENANT = "tenant-1";
const NOW = Date.parse("2026-09-05T02:00:00.000Z");

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    created_at: "2026-09-05T01:00:00.000Z",
    status: "completed",
    total: "250.00",
    source: "web",
    order_type: "Delivery",
    payment_method_name: "GCash",
    customer_name: "Ana",
    customer_contact: "09171234567",
    customer_data: null,
    outlet_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("isPlatformAnalyticsRef", () => {
  it("claims every analytics ref the Analytics, Trends and Growth screens send", () => {
    for (const ref of [
      "analytics:getUpsellAnalytics",
      "analytics:getBundleAnalytics",
      "analytics:getTopItems",
      "analytics:getTrends",
      "analytics:getRevenueBreakdown",
      "analytics:getUpsellTrends",
      "analytics:getSalesAnalytics",
      "analytics:getPaymentMethodAnalytics",
      "analytics:getOrderHeatmap",
      "analytics:getCustomerInsights",
      "productAnalytics:getAll",
      "productAnalytics:getPortfolioSummary",
    ]) {
      expect(isPlatformAnalyticsRef(ref)).toBe(true);
    }
  });

  it("does not claim refs it cannot serve", () => {
    expect(isPlatformAnalyticsRef("analytics:trackEvent")).toBe(false);
    expect(isPlatformAnalyticsRef("orders:getOrders")).toBe(false);
  });
});

describe("runPlatformAnalyticsQuery — tenant guard", () => {
  it("scopes every order read to the tenant", async () => {
    const { client, calls } = fakePlatformClient({ orders: [{ data: [orderRow()], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getSalesAnalytics", { daysBack: 7 });

    for (const call of calls.filter((c) => c.table === "orders")) {
      expect(call.ops).toContainEqual({ method: "eq", args: ["tenant_id", TENANT] });
    }
  });

  it("scopes line-item reads through their parent order's tenant", async () => {
    const { client, calls } = fakePlatformClient({
      orders: [{ data: [orderRow()], error: null }],
      order_items: [{ data: [], error: null }],
    });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getTopItems", { daysBack: 7 });

    expect(eqFiltersOn(calls, "order_items")).toContainEqual(["orders.tenant_id", TENANT]);
  });

  it("scopes event reads to the tenant", async () => {
    const { client, calls } = fakePlatformClient({ analytics_events: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getUpsellAnalytics", { daysBack: 7 });

    expect(eqFiltersOn(calls, "analytics_events")).toContainEqual(["tenant_id", TENANT]);
  });

  it("scopes product cost reads to the tenant", async () => {
    const { client, calls } = fakePlatformClient({
      orders: [{ data: [], error: null }],
      order_items: [{ data: [], error: null }],
      product_costs: [{ data: [], error: null }],
    });

    await runPlatformAnalyticsQuery(client, TENANT, "productAnalytics:getAll", { period: "30d" });

    expect(eqFiltersOn(calls, "product_costs")).toContainEqual(["tenant_id", TENANT]);
  });

  it("refuses to run without a tenant", async () => {
    const { client } = fakePlatformClient({});

    await expect(
      runPlatformAnalyticsQuery(client, "", "analytics:getTrends", {})
    ).rejects.toThrow(/No tenant/);
  });

  it("narrows order reads to the account's branch when one is set", async () => {
    const { client, calls } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(
      client,
      TENANT,
      "analytics:getOrderHeatmap",
      { daysBack: 30 },
      { kind: "branch", outletId: "north" }
    );

    expect(eqFiltersOn(calls, "orders")).toContainEqual(["outlet_id", "north"]);
  });

  it("narrows item reads by the parent order's branch when one is set", async () => {
    const { client, calls } = fakePlatformClient({
      orders: [{ data: [], error: null }],
      order_items: [{ data: [], error: null }],
    });

    await runPlatformAnalyticsQuery(
      client,
      TENANT,
      "analytics:getUpsellTrends",
      { daysBack: 7 },
      { kind: "branch", outletId: "north" }
    );

    expect(eqFiltersOn(calls, "order_items")).toContainEqual(["orders.outlet_id", "north"]);
  });
});

describe("runPlatformAnalyticsQuery — argument validation", () => {
  it("clamps an absurd daysBack instead of scanning the whole table", async () => {
    const { client, calls } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getTrends", { daysBack: 99999 });

    const [, since] = opsOf(calls, "gte")[0] as [string, string];
    const windowDays = (NOW - Date.parse(since)) / (24 * 60 * 60 * 1000);
    expect(windowDays).toBeLessThanOrEqual(366);
  });

  it("falls back to the Convex default window on a malformed daysBack", async () => {
    const { client, calls } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getSalesAnalytics", { daysBack: "7; drop" });

    const [, since] = opsOf(calls, "gte")[0] as [string, string];
    expect(NOW - Date.parse(since)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("caps every read so a busy store cannot pull an unbounded scan", async () => {
    const { client, calls } = fakePlatformClient({
      orders: [{ data: [], error: null }],
      order_items: [{ data: [], error: null }],
    });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getTopItems", { daysBack: 7, limit: 10 });

    // Paged rather than `limit`ed: every request names a bounded row range.
    for (const call of calls) {
      const ranges = call.ops.filter((op) => op.method === "range");
      expect(ranges).toHaveLength(1);
      const [from, to] = ranges[0].args as [number, number];
      expect(to - from + 1).toBeLessThanOrEqual(1000);
    }
  });

  it("rejects a ref it does not serve", async () => {
    const { client } = fakePlatformClient({});

    await expect(
      runPlatformAnalyticsQuery(client, TENANT, "analytics:trackEvent", {})
    ).rejects.toThrow(/not supported/);
  });
});

describe("runPlatformAnalyticsQuery — figures", () => {
  it("excludes cancelled orders from revenue trends and coerces numeric strings", async () => {
    const { client } = fakePlatformClient({
      orders: [
        {
          data: [orderRow(), orderRow({ id: "o2", status: "cancelled", total: "999" })],
          error: null,
        },
      ],
    });

    const trends = (await runPlatformAnalyticsQuery(client, TENANT, "analytics:getTrends", {
      daysBack: 30,
    })) as { date: string; totalRevenue: number }[];

    expect(trends).toEqual([
      { date: "2026-09-05", totalOrders: 1, totalRevenue: 250, avgOrderValue: 250 },
    ]);
  });

  it("reads the previous period separately for sales growth", async () => {
    const { client, calls } = fakePlatformClient({
      orders: [
        { data: [orderRow({ total: "200" })], error: null },
        { data: [orderRow({ id: "p", total: "100" })], error: null },
      ],
    });

    const sales = (await runPlatformAnalyticsQuery(client, TENANT, "analytics:getSalesAnalytics", {
      daysBack: 7,
    })) as { revenueGrowth: number };

    expect(calls.filter((c) => c.table === "orders")).toHaveLength(2);
    expect(sales.revenueGrowth).toBe(1);
  });

  it("classifies live from orders, items and costs for the product matrix", async () => {
    const { client } = fakePlatformClient({
      orders: [{ data: [orderRow()], error: null }],
      order_items: [
        {
          data: [
            { order_id: "o1", menu_item_id: "m1", menu_item_name: "Adobo", quantity: 3, subtotal: "300" },
          ],
          error: null,
        },
      ],
      product_costs: [{ data: [{ menu_item_id: "m1", cost_price: "50.00" }], error: null }],
    });

    const rows = (await runPlatformAnalyticsQuery(client, TENANT, "productAnalytics:getAll", {
      period: "30d",
    })) as { menuItemId: string; totalRevenue: number; marginPercent?: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].menuItemId).toBe("m1");
    expect(rows[0].totalRevenue).toBe(300);
    expect(rows[0].marginPercent).toBe(50);
  });
});

describe('branch funnel events', () => {
  it('filters events by the branch in metadata', async () => {
    const { client, calls } = fakePlatformClient({ analytics_events: [{ data: [], error: null }] });
    await runPlatformAnalyticsQuery(client, TENANT, 'analytics:getUpsellAnalytics', {}, { kind: 'branch', outletId: 'north' });
    expect(opsOf(calls, 'or')).toContainEqual(['metadata->>outlet_id.eq."north",and(metadata->>outlet_id.is.null,metadata->>outletId.eq."north")']);
  });
});

/**
 * Bounded windows: a report asked for ONE DAY or a custom RANGE, not the
 * rolling "since N days ago" every analytics query used to assume.
 *
 * What matters here is that the upper bound reaches PostgREST on every table a
 * query reads. An unbounded read still returns the right FIRST day and then
 * every day after it, so a merchant looking at Sep 3 would be shown Sep 3
 * onwards and told it was Sep 3 — a wrong figure that looks authoritative.
 */
describe("runPlatformAnalyticsQuery — bounded windows", () => {
  const START = Date.parse("2026-09-02T16:00:00.000Z"); // Manila midnight, Sep 3
  const END = START + 24 * 60 * 60 * 1000;

  /** The window a table was read with, as [gte, lte-or-lt] ISO strings. */
  function boundsOn(
    calls: readonly { table: string; ops: readonly { method: string; args: readonly unknown[] }[] }[],
    table: string
  ) {
    const ops = calls.filter((c) => c.table === table).flatMap((c) => c.ops);
    return {
      lower: ops.filter((o) => o.method === "gte").map((o) => o.args[1]),
      upper: ops.filter((o) => o.method === "lte" || o.method === "lt").map((o) => o.args[1]),
    };
  }

  it("bounds the orders read at BOTH ends for a picked day", async () => {
    const { client, calls } = fakePlatformClient({ orders: [{ data: [orderRow()], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getPaymentMethodAnalytics", {
      startMs: START,
      endMs: END,
    });

    const bounds = boundsOn(calls, "orders");
    expect(bounds.lower).toContain(new Date(START).toISOString());
    expect(bounds.upper).toContain(new Date(END).toISOString());
  });

  it("bounds the ITEMS read at both ends, so a picked day cannot count later days", async () => {
    const { client, calls } = fakePlatformClient({ order_items: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getTopItems", {
      startMs: START,
      endMs: END,
    });

    const bounds = boundsOn(calls, "order_items");
    expect(bounds.lower).toContain(new Date(START).toISOString());
    expect(bounds.upper).toContain(new Date(END).toISOString());
  });

  it("bounds the EVENTS read at both ends", async () => {
    const { client, calls } = fakePlatformClient({ analytics_events: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getUpsellAnalytics", {
      startMs: START,
      endMs: END,
    });

    const bounds = boundsOn(calls, "analytics_events");
    expect(bounds.lower).toContain(new Date(START).toISOString());
    expect(bounds.upper).toContain(new Date(END).toISOString());
  });

  it("compares a bounded window against the window of equal length before it", async () => {
    const { client, calls } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getSalesAnalytics", {
      startMs: START,
      endMs: END,
    });

    // Two reads: the picked day, and the day before it.
    const bounds = boundsOn(calls, "orders");
    expect(bounds.lower).toContain(new Date(START - (END - START)).toISOString());
    expect(bounds.upper).toContain(new Date(START).toISOString());
  });

  it("keeps the rolling window when only daysBack is sent", async () => {
    const { client, calls } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getPaymentMethodAnalytics", {
      daysBack: 7,
    });

    const bounds = boundsOn(calls, "orders");
    expect(bounds.lower).toContain(new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString());
    expect(bounds.upper).toHaveLength(0);
  });

  it("refuses a window that is not a pair of finite instants", async () => {
    const { client } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    await expect(
      runPlatformAnalyticsQuery(client, TENANT, "analytics:getTrends", {
        startMs: "yesterday",
        endMs: END,
      })
    ).rejects.toThrow(/epoch milliseconds/i);
  });

  it("refuses a window whose end precedes its start", async () => {
    const { client } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    await expect(
      runPlatformAnalyticsQuery(client, TENANT, "analytics:getTrends", {
        startMs: END,
        endMs: START,
      })
    ).rejects.toThrow();
  });
});

describe("runPlatformAnalyticsQuery — split tenders", () => {
  const split = orderRow({ id: "split", total: "300.00", payment_method_name: "Cash" });
  const ledger = [
    { order_id: "split", kind: "charge", amount: "120.00", payment_method_name: "GCash" },
    { order_id: "split", kind: "charge", amount: "180.00", payment_method_name: "Cash" },
  ];

  it("splits revenue by payment method using the settlement ledger", async () => {
    const { client } = fakePlatformClient({
      orders: [{ data: [split], error: null }],
      order_payments: [{ data: ledger, error: null }],
    });

    const result = (await runPlatformAnalyticsQuery(client, TENANT, "analytics:getRevenueBreakdown", {
      daysBack: 7,
    })) as { byPaymentMethod: unknown };

    expect(result.byPaymentMethod).toEqual([
      { method: "Cash", revenue: 180, count: 1 },
      { method: "GCash", revenue: 120, count: 1 },
    ]);
  });

  it("feeds the ledger to the payment method detail too", async () => {
    const { client } = fakePlatformClient({
      orders: [{ data: [split], error: null }],
      order_payments: [{ data: ledger, error: null }],
    });

    const result = (await runPlatformAnalyticsQuery(client, TENANT, "analytics:getPaymentMethodAnalytics", {
      daysBack: 7,
    })) as { methods: { method: string; revenue: number }[] };

    expect(result.methods.map((m) => [m.method, m.revenue])).toEqual([
      ["Cash", 180],
      ["GCash", 120],
    ]);
  });

  it("reads the ledger scoped to the tenant, the branch and the orders' window", async () => {
    const { client, calls } = fakePlatformClient({
      orders: [{ data: [split], error: null }],
      order_payments: [{ data: [], error: null }],
    });

    await runPlatformAnalyticsQuery(
      client,
      TENANT,
      "analytics:getRevenueBreakdown",
      { daysBack: 7 },
      { kind: "branch", outletId: "north" }
    );

    const payments = calls.filter((c) => c.table === "order_payments");
    expect(payments.length).toBeGreaterThan(0);
    const eqs = eqFiltersOn(calls, "order_payments");
    expect(eqs).toContainEqual(["tenant_id", TENANT]);
    expect(eqs).toContainEqual(["orders.tenant_id", TENANT]);
    expect(eqs).toContainEqual(["orders.outlet_id", "north"]);
    const ops = payments.flatMap((c) => c.ops);
    expect(ops).toContainEqual({ method: "neq", args: ["orders.status", "cancelled"] });
    expect(ops).toContainEqual({ method: "range", args: expect.any(Array) });
  });
});

/**
 * A busy store's Analytics screen used to time out: its nine queries each
 * downloaded the same window (five copies of the orders alone), whole
 * `customer_data` blobs included, one 1000-row page after another.
 */
describe("runPlatformAnalyticsQuery — one download per window", () => {
  const START = Date.parse("2026-09-02T16:00:00.000Z");
  const END = START + 7 * 24 * 60 * 60 * 1000;
  const WINDOW = { startMs: START, endMs: END };

  it("reads the window's orders, lines, payments and events once for the whole screen", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({
      orders: [
        { data: [orderRow()], error: null },
        { data: [], error: null },
      ],
      order_items: [{ data: [], error: null }],
      order_payments: [{ data: [], error: null }],
      analytics_events: [{ data: [], error: null }],
    });
    const refs = [
      "analytics:getSalesAnalytics",
      "analytics:getRevenueBreakdown",
      "analytics:getPaymentMethodAnalytics",
      "analytics:getOrderHeatmap",
      "analytics:getCustomerInsights",
      "analytics:getTopItems",
      "analytics:getUpsellTrends",
      "analytics:getUpsellAnalytics",
    ];

    // Act
    await Promise.all(refs.map((ref) => runPlatformAnalyticsQuery(client, TENANT, ref, WINDOW)));

    // Assert
    const reads = (table: string) => calls.filter((call) => call.table === table).length;
    expect(reads("orders")).toBe(2); // the window, and the one before it for growth
    expect(reads("order_items")).toBe(1);
    expect(reads("order_payments")).toBe(1);
    expect(reads("analytics_events")).toBe(1);
  });

  it("shares rolling windows asked for a few milliseconds apart", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({ orders: [{ data: [orderRow()], error: null }] });
    const now = jest.spyOn(Date, "now");

    // Act
    now.mockReturnValueOnce(NOW + 3);
    const heatmap = runPlatformAnalyticsQuery(client, TENANT, "analytics:getOrderHeatmap", { daysBack: 30 });
    now.mockReturnValueOnce(NOW + 9);
    const insights = runPlatformAnalyticsQuery(client, TENANT, "analytics:getCustomerInsights", { daysBack: 30 });
    await Promise.all([heatmap, insights]);

    // Assert
    expect(calls.filter((call) => call.table === "orders")).toHaveLength(1);
  });

  it("still leaves cancelled orders out of the figures that never counted them", async () => {
    // Arrange
    const { client } = fakePlatformClient({
      orders: [
        { data: [orderRow(), orderRow({ id: "x", status: "cancelled", total: "999" })], error: null },
        { data: [], error: null },
      ],
      order_payments: [{ data: [], error: null }],
    });

    // Act
    const [sales, breakdown] = (await Promise.all([
      runPlatformAnalyticsQuery(client, TENANT, "analytics:getSalesAnalytics", WINDOW),
      runPlatformAnalyticsQuery(client, TENANT, "analytics:getRevenueBreakdown", WINDOW),
    ])) as [{ cancelledOrders: number }, { byOrderType: { revenue: number; count: number }[] }];

    // Assert
    expect(sales.cancelledOrders).toBe(1);
    expect(breakdown.byOrderType).toEqual([expect.objectContaining({ revenue: 250, count: 1 })]);
  });

  it("downloads only the identity keys of customer_data, and still recognises the guest", async () => {
    // Arrange
    const blobGuest = { customer_contact: null, cd_phone: "0917 123 4567" };
    const { client, calls } = fakePlatformClient({
      orders: [
        {
          data: [orderRow({ id: "a", ...blobGuest }), orderRow({ id: "b", ...blobGuest })],
          error: null,
        },
      ],
    });

    // Act
    const insights = (await runPlatformAnalyticsQuery(
      client,
      TENANT,
      "analytics:getCustomerInsights",
      WINDOW
    )) as { totalCustomers: number; returningCustomers: number };

    // Assert
    const [columns] = opsOf(calls, "select")[0] as [string];
    expect(columns.split(",").map((column) => column.trim())).not.toContain("customer_data");
    expect(columns).toContain("cd_phone:customer_data->phone");
    expect(insights).toMatchObject({ totalCustomers: 1, returningCustomers: 1 });
  });

  it("reads every window oldest first, so a sale rung up mid-read cannot shift a page", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({
      orders: [{ data: [], error: null }],
      order_items: [{ data: [], error: null }],
    });

    // Act
    await Promise.all([
      runPlatformAnalyticsQuery(client, TENANT, "analytics:getOrderHeatmap", WINDOW),
      runPlatformAnalyticsQuery(client, TENANT, "analytics:getTopItems", WINDOW),
    ]);

    // Assert
    for (const call of calls) {
      const orderings = call.ops.filter((op) => op.method === "order").map((op) => op.args[1]);
      expect(orderings).toEqual([{ ascending: true }, { ascending: true }]);
    }
  });

  it("lets one query give up without cancelling the read another query shares", async () => {
    // Arrange
    const { client } = fakePlatformClient({ orders: [{ data: [orderRow()], error: null }] });
    const quitter = new AbortController();

    // Act
    const abandoned = runPlatformAnalyticsQuery(
      client, TENANT, "analytics:getOrderHeatmap", WINDOW, undefined, quitter.signal
    );
    const kept = runPlatformAnalyticsQuery(
      client, TENANT, "analytics:getCustomerInsights", WINDOW, undefined, new AbortController().signal
    );
    quitter.abort();

    // Assert
    await expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    await expect(kept).resolves.toMatchObject({ totalCustomers: 1 });
  });
});
