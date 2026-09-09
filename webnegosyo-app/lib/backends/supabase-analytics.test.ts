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

    for (const call of calls) {
      expect(call.ops.some((op) => op.method === "limit")).toBe(true);
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

  it("asks PostgREST for the cancelled-order exclusion rather than filtering after the cap", async () => {
    const { client, calls } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    await runPlatformAnalyticsQuery(client, TENANT, "analytics:getTrends", { daysBack: 30 });

    expect(opsOf(calls, "neq")).toContainEqual(["status", "cancelled"]);
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
