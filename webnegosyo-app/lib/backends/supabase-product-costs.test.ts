import {
  isPlatformProductCostRef,
  runPlatformProductCostMutation,
  runPlatformProductCostQuery,
} from "./supabase-product-costs";
import { eqFiltersOn, fakePlatformClient, opsOf } from "./testing/fake-platform-client";

/**
 * Product costs (`productCosts:*`) on the platform backend. The product editor
 * and the product list read them; the editor and the BCG screen write them.
 * Same guard as everywhere else in the adapter: tenant-scoped on both sides,
 * with the write validated before it reaches PostgREST.
 */

const TENANT = "tenant-1";

describe("isPlatformProductCostRef", () => {
  it("claims the three product cost refs", () => {
    expect(isPlatformProductCostRef("productCosts:getCost")).toBe(true);
    expect(isPlatformProductCostRef("productCosts:getAllCosts")).toBe(true);
    expect(isPlatformProductCostRef("productCosts:setCost")).toBe(true);
    expect(isPlatformProductCostRef("productCosts:deleteCost")).toBe(false);
  });
});

describe("runPlatformProductCostQuery", () => {
  it("returns one item's cost in the Convex shape, scoped to the tenant", async () => {
    const { client, calls } = fakePlatformClient({
      product_costs: [
        {
          data: {
            id: "c1",
            menu_item_id: "m1",
            cost_price: "45.50",
            cost_notes: null,
            created_at: "2026-09-01T00:00:00.000Z",
            updated_at: "2026-09-02T00:00:00.000Z",
          },
          error: null,
        },
      ],
    });

    const cost = await runPlatformProductCostQuery(client, TENANT, "productCosts:getCost", {
      menuItemId: "m1",
    });

    expect(cost).toEqual({
      _id: "c1",
      _creationTime: Date.parse("2026-09-01T00:00:00.000Z"),
      menuItemId: "m1",
      costPrice: 45.5,
      costNotes: undefined,
      createdAt: Date.parse("2026-09-01T00:00:00.000Z"),
      updatedAt: Date.parse("2026-09-02T00:00:00.000Z"),
    });
    expect(eqFiltersOn(calls, "product_costs")).toEqual([
      ["tenant_id", TENANT],
      ["menu_item_id", "m1"],
    ]);
  });

  it("returns null when an item has no cost yet", async () => {
    const { client } = fakePlatformClient({ product_costs: [{ data: null, error: null }] });

    const cost = await runPlatformProductCostQuery(client, TENANT, "productCosts:getCost", {
      menuItemId: "m1",
    });

    expect(cost).toBeNull();
  });

  it("lists every cost for the tenant", async () => {
    const { client, calls } = fakePlatformClient({
      product_costs: [
        {
          data: [
            { id: "c1", menu_item_id: "m1", cost_price: 10, cost_notes: "x", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
          ],
          error: null,
        },
      ],
    });

    const costs = (await runPlatformProductCostQuery(client, TENANT, "productCosts:getAllCosts", {})) as {
      menuItemId: string;
      costPrice: number;
    }[];

    expect(costs).toEqual([expect.objectContaining({ menuItemId: "m1", costPrice: 10, costNotes: "x" })]);
    expect(eqFiltersOn(calls, "product_costs")).toEqual([["tenant_id", TENANT]]);
  });

  it("rejects a getCost with no menu item id", async () => {
    const { client } = fakePlatformClient({});

    await expect(
      runPlatformProductCostQuery(client, TENANT, "productCosts:getCost", {})
    ).rejects.toThrow(/menu item/i);
  });
});

describe("runPlatformProductCostMutation", () => {
  it("upserts one row per tenant and item, keyed on the unique constraint", async () => {
    const { client, calls } = fakePlatformClient({
      product_costs: [{ data: { id: "c1" }, error: null }],
    });

    const id = await runPlatformProductCostMutation(client, TENANT, "productCosts:setCost", {
      menuItemId: "m1",
      costPrice: 42,
      costNotes: "supplier A",
    });

    expect(id).toBe("c1");
    const [row, options] = opsOf(calls, "upsert")[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(row).toMatchObject({ tenant_id: TENANT, menu_item_id: "m1", cost_price: 42, cost_notes: "supplier A" });
    expect(options).toEqual({ onConflict: "tenant_id,menu_item_id" });
  });

  it("refuses a negative or non-numeric cost before it reaches the database", async () => {
    const { client, calls } = fakePlatformClient({});

    await expect(
      runPlatformProductCostMutation(client, TENANT, "productCosts:setCost", { menuItemId: "m1", costPrice: -1 })
    ).rejects.toThrow(/cost/i);
    await expect(
      runPlatformProductCostMutation(client, TENANT, "productCosts:setCost", { menuItemId: "m1", costPrice: "abc" })
    ).rejects.toThrow(/cost/i);
    expect(calls).toHaveLength(0);
  });

  it("refuses a missing menu item id", async () => {
    const { client } = fakePlatformClient({});

    await expect(
      runPlatformProductCostMutation(client, TENANT, "productCosts:setCost", { costPrice: 10 })
    ).rejects.toThrow(/menu item/i);
  });

  it("surfaces a database refusal instead of reporting success", async () => {
    const { client } = fakePlatformClient({
      product_costs: [{ data: null, error: { message: "permission denied" } }],
    });

    await expect(
      runPlatformProductCostMutation(client, TENANT, "productCosts:setCost", { menuItemId: "m1", costPrice: 10 })
    ).rejects.toThrow(/permission denied/);
  });
});
