import { buildProductPerformance, buildStorePerformance } from "./aggregate";
import type { CatalogProduct, SalesLine } from "./types";
import type { ModifierGroup } from "../modifier-groups";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function manilaMidnight(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`) - MANILA_OFFSET_MS;
}

/** Sep 21–23, and the three days before as the comparison. */
const WINDOW = { startMs: manilaMidnight("2026-09-21"), endMs: manilaMidnight("2026-09-24") };
const PREVIOUS = { startMs: manilaMidnight("2026-09-18"), endMs: manilaMidnight("2026-09-21") };

function group(id: string, name: string, maxSelect: number | null, options: [string, number][]): ModifierGroup {
  return {
    id,
    name,
    display_order: 0,
    min_select: 0,
    max_select: maxSelect,
    options: options.map(([optionName, price], index) => ({
      id: `${id}-${index}`,
      name: optionName,
      price_modifier: price,
      display_order: index,
    })),
  };
}

const CATALOG = new Map<string, CatalogProduct>([
  [
    "latte",
    {
      id: "latte",
      name: "Latte",
      groups: [
        group("size", "Size", 1, [["Regular", 0], ["Large", 20]]),
        group("extras", "Add-ons", null, [["Extra Shot", 30], ["Oat Milk", 25]]),
      ],
    },
  ],
  ["cookie", { id: "cookie", name: "Cookie", groups: [] }],
]);

let seq = 0;
function sold(day: string, overrides: Partial<SalesLine>): SalesLine {
  seq += 1;
  return {
    orderId: `o${seq}`,
    createdAtMs: manilaMidnight(day) + 10 * 60 * 60 * 1000,
    menuItemId: "latte",
    menuItemName: "Latte",
    quantity: 1,
    subtotal: 150,
    ...overrides,
  };
}

const LINES: SalesLine[] = [
  // Register: Large with an extra shot, exact prices.
  sold("2026-09-21", {
    quantity: 2,
    subtotal: 400,
    variationSelections: [
      { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
      { typeName: "Add-ons", optionName: "Extra Shot", priceAdjustment: 30 },
    ],
  }),
  // Web: Regular with oat milk, prices only on the menu.
  sold("2026-09-22", { subtotal: 175, variation: "Regular", addons: [{ name: "Oat Milk", price: 0 }] }),
  // Web: Large, nothing else.
  sold("2026-09-23", { subtotal: 170, variation: "Large" }),
  // A latte with no size recorded at all.
  sold("2026-09-23", { subtotal: 150 }),
  // A cookie in the same window.
  sold("2026-09-23", { menuItemId: "cookie", menuItemName: "Cookie", quantity: 3, subtotal: 150 }),
  // The comparison window: one regular latte.
  sold("2026-09-19", { subtotal: 150, variation: "Regular" }),
  // Outside both windows — must be ignored.
  sold("2026-09-10", { subtotal: 9999 }),
];

describe("buildProductPerformance", () => {
  const latte = buildProductPerformance({
    lines: LINES,
    catalog: CATALOG,
    menuItemId: "latte",
    window: WINDOW,
    previous: PREVIOUS,
  });

  it("totals units, sales and orders inside the window only", () => {
    expect(latte.units).toBe(5);
    expect(latte.sales).toBe(895);
    expect(latte.orders).toBe(4);
    expect(latte.avgPrice).toBeCloseTo(179);
  });

  it("compares against the previous window", () => {
    expect(latte.previousSales).toBe(150);
    expect(latte.salesChange).toBeCloseTo((895 - 150) / 150);
  });

  it("gives every day of the window a point, quiet days included", () => {
    expect(latte.daily.map((d) => [d.dateKey, d.sales])).toEqual([
      ["2026-09-21", 400],
      ["2026-09-22", 175],
      ["2026-09-23", 320],
    ]);
  });

  it("splits units across a variation group, with the unchosen remainder", () => {
    const size = latte.variationGroups.find((g) => g.groupName === "Size");

    expect(size?.options.map((o) => [o.name, o.units, o.sales])).toEqual([
      ["Large", 3, 570],
      ["Regular", 1, 175],
    ]);
    expect(size?.options[0].share).toBeCloseTo(3 / 5);
    expect(size?.unchosenUnits).toBe(1);
  });

  it("counts add-ons per unit sold, with attach rate and revenue", () => {
    const [extraShot, oatMilk] = latte.addons;

    expect(extraShot).toMatchObject({ name: "Extra Shot", units: 2, attachedUnits: 2, revenue: 60, revenueIsEstimate: false });
    expect(extraShot.attachRate).toBeCloseTo(2 / 5);
    expect(oatMilk).toMatchObject({ name: "Oat Milk", units: 1, revenue: 25, revenueIsEstimate: true });
  });

  it("totals add-on revenue and says when any of it is an estimate", () => {
    expect(latte.addonRevenue).toBe(85);
    expect(latte.addonRevenueIsEstimate).toBe(true);
  });

  it("reports no change when the previous window sold nothing", () => {
    const cookie = buildProductPerformance({
      lines: LINES,
      catalog: CATALOG,
      menuItemId: "cookie",
      window: WINDOW,
      previous: PREVIOUS,
    });

    expect(cookie.previousSales).toBe(0);
    expect(cookie.salesChange).toBeNull();
    expect(cookie.variationGroups).toEqual([]);
    expect(cookie.addons).toEqual([]);
  });

  it("has no comparison at all when none was asked for", () => {
    const noComparison = buildProductPerformance({
      lines: LINES,
      catalog: CATALOG,
      menuItemId: "latte",
      window: WINDOW,
      previous: null,
    });

    expect(noComparison.previousSales).toBeNull();
    expect(noComparison.salesChange).toBeNull();
  });
});

describe("buildStorePerformance", () => {
  const store = buildStorePerformance({ lines: LINES, catalog: CATALOG, window: WINDOW, previous: PREVIOUS });

  it("totals the store's window", () => {
    expect(store.totals).toMatchObject({ sales: 1045, units: 8, orders: 5, addonUnits: 3, addonRevenue: 85 });
  });

  it("ranks products by sales with their share of the store", () => {
    expect(store.products.map((p) => [p.menuItemId, p.sales])).toEqual([
      ["latte", 895],
      ["cookie", 150],
    ]);
    expect(store.products[0].share).toBeCloseTo(895 / 1045);
  });

  it("names each product's most-picked variation", () => {
    expect(store.products[0].topVariation).toMatchObject({ groupName: "Size", name: "Large" });
    expect(store.products[1].topVariation).toBeNull();
  });

  it("ranks add-ons store-wide by revenue, with how many orders carried them", () => {
    expect(store.addons.map((a) => [a.name, a.units, a.orders])).toEqual([
      ["Extra Shot", 2, 1],
      ["Oat Milk", 1, 1],
    ]);
    expect(store.addons[0].orderShare).toBeCloseTo(1 / 5);
    expect(store.addons[0].productNames).toEqual(["Latte"]);
  });

  it("uses the product's current menu name, not the one stored on an old line", () => {
    const renamed = buildStorePerformance({
      lines: [sold("2026-09-22", { menuItemName: "Cafe Latte (old)" })],
      catalog: CATALOG,
      window: WINDOW,
      previous: null,
    });

    expect(renamed.products[0].name).toBe("Latte");
  });

  it("merges an add-on whose menu name carries stray spaces or another case", () => {
    const merged = buildStorePerformance({
      lines: [
        sold("2026-09-22", { menuItemId: "cookie", menuItemName: "Cookie", addons: [{ name: "Plain Rice ", price: 0 }] }),
        sold("2026-09-22", { menuItemId: "cookie", menuItemName: "Cookie", addons: [{ name: "plain rice", price: 0 }] }),
      ],
      catalog: CATALOG,
      window: WINDOW,
      previous: null,
    });

    expect(merged.addons.map((a) => [a.name, a.units])).toEqual([["Plain Rice", 2]]);
  });

  it("is empty, not broken, for a window with no sales", () => {
    const empty = buildStorePerformance({
      lines: [],
      catalog: CATALOG,
      window: WINDOW,
      previous: PREVIOUS,
    });

    expect(empty.isEmpty).toBe(true);
    expect(empty.products).toEqual([]);
    expect(empty.totals.sales).toBe(0);
    expect(empty.salesChange).toBeNull();
  });

  it("keeps the window's day count for sparklines", () => {
    expect(store.dayKeys).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
    expect(store.dayKeys).toHaveLength(Math.round((WINDOW.endMs - WINDOW.startMs) / DAY_MS));
  });
});
