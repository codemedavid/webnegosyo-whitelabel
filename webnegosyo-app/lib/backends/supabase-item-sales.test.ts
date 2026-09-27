import { ITEM_SALES_LIMIT, readItemSales } from "./supabase-item-sales";
import { isPlatformAnalyticsRef, runPlatformAnalyticsQuery } from "./supabase-analytics";
import { eqFiltersOn, fakePlatformClient, opsOf } from "./testing/fake-platform-client";

/**
 * `analytics:getItemSales` — the sold lines of a window with their options,
 * which the product performance screens slice into variations and add-ons.
 */

const TENANT = "tenant-1";
const MENU_ITEM = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const START = Date.parse("2026-09-20T16:00:00.000Z");
const END = Date.parse("2026-09-23T16:00:00.000Z");

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    order_id: "o1",
    menu_item_id: MENU_ITEM,
    menu_item_name: "Latte",
    quantity: 2,
    subtotal: "340.00",
    variation: "Large",
    variation_selections: null,
    addons: ["Extra Shot ×2"],
    orders: { tenant_id: TENANT, created_at: "2026-09-21T02:00:00.000Z", status: "delivered", source: "web", outlet_id: null },
    ...overrides,
  };
}

describe("analytics:getItemSales", () => {
  it("is served by the platform backend", () => {
    expect(isPlatformAnalyticsRef("analytics:getItemSales")).toBe(true);
  });

  it("returns each line with its order's time and options, numbers coerced", async () => {
    // Arrange
    const { client } = fakePlatformClient({ order_items: [{ data: [itemRow()], error: null }] });

    // Act
    const result = await runPlatformAnalyticsQuery(client, TENANT, "analytics:getItemSales", {
      startMs: START,
      endMs: END,
    });

    // Assert
    expect(result).toEqual({
      lines: [
        {
          orderId: "o1",
          createdAtMs: Date.parse("2026-09-21T02:00:00.000Z"),
          source: "web",
          menuItemId: MENU_ITEM,
          menuItemName: "Latte",
          quantity: 2,
          subtotal: 340,
          variation: "Large",
          variationSelections: undefined,
          addons: [{ name: "Extra Shot ×2", price: 0 }],
        },
      ],
      isTruncated: false,
    });
  });

  it("scopes to the tenant, the window and live orders on the joined order", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({ order_items: [{ data: [], error: null }] });

    // Act
    await readItemSales(client, TENANT, { kind: "all" }, { startMs: START, endMs: END });

    // Assert
    expect(eqFiltersOn(calls, "order_items")).toContainEqual(["orders.tenant_id", TENANT]);
    expect(opsOf(calls, "gte")).toContainEqual(["orders.created_at", new Date(START).toISOString()]);
    expect(opsOf(calls, "lt")).toContainEqual(["orders.created_at", new Date(END).toISOString()]);
    expect(opsOf(calls, "neq")).toContainEqual(["orders.status", "cancelled"]);
  });

  it("narrows to one product when asked", async () => {
    const { client, calls } = fakePlatformClient({ order_items: [{ data: [], error: null }] });

    await readItemSales(client, TENANT, { kind: "all" }, { startMs: START, endMs: END, menuItemId: MENU_ITEM });

    expect(eqFiltersOn(calls, "order_items")).toContainEqual(["menu_item_id", MENU_ITEM]);
  });

  it("narrows to the branch in view through the parent order", async () => {
    const { client, calls } = fakePlatformClient({ order_items: [{ data: [], error: null }] });

    await readItemSales(client, TENANT, { kind: "branch", outletId: "b1" }, { startMs: START, endMs: END });

    expect(eqFiltersOn(calls, "order_items")).toContainEqual(["orders.outlet_id", "b1"]);
  });

  it("refuses a product id the database cannot hold rather than reading every product", async () => {
    const { client } = fakePlatformClient({});

    await expect(
      runPlatformAnalyticsQuery(client, TENANT, "analytics:getItemSales", {
        startMs: START,
        endMs: END,
        menuItemId: "not-a-uuid",
      })
    ).rejects.toThrow(/product/i);
  });

  it("requires an explicit window", async () => {
    const { client } = fakePlatformClient({});

    await expect(
      runPlatformAnalyticsQuery(client, TENANT, "analytics:getItemSales", { daysBack: 7 })
    ).rejects.toThrow(/window/i);
  });

  it("says when the read hit its cap, so the screen can say the figures are partial", async () => {
    // Arrange: every page full until the cap.
    const pages = Math.ceil(ITEM_SALES_LIMIT / 1000);
    const full = Array.from({ length: 1000 }, (_, i) => itemRow({ id: `i${i}` }));
    const { client } = fakePlatformClient({
      order_items: Array.from({ length: pages }, () => ({ data: full, error: null })),
    });

    // Act
    const result = await readItemSales(client, TENANT, { kind: "all" }, { startMs: START, endMs: END });

    // Assert
    expect(result.isTruncated).toBe(true);
    expect(result.lines).toHaveLength(ITEM_SALES_LIMIT);
  });
});
