/**
 * Splitting an order's lines into loose items and bundles, for the detail
 * screen. Extracted from the screen so the grouping (and its immutability —
 * the previous version pushed into and summed on objects held in the cache)
 * is pinned here.
 */
import { groupBundleItems, type BundleOrderItem } from "./order-bundle-groups";

function line(overrides: Partial<BundleOrderItem> & { menuItemName: string }): BundleOrderItem {
  return { quantity: 1, subtotal: 10, ...overrides };
}

describe("groupBundleItems", () => {
  it("keeps loose items in order and groups bundle lines by bundle id", () => {
    const items = [
      line({ menuItemName: "Coke" }),
      line({ menuItemName: "Burger", isBundleItem: true, bundleId: "b1", bundleName: "Meal", subtotal: 100 }),
      line({ menuItemName: "Fries" }),
      line({ menuItemName: "Drink", isBundleItem: true, bundleId: "b1", subtotal: 20 }),
      line({ menuItemName: "Cake", isBundleItem: true, bundleId: "b2", bundleName: "Dessert", subtotal: 60 }),
    ];

    const { regularItems, bundles } = groupBundleItems(items);

    expect(regularItems.map((i) => i.menuItemName)).toEqual(["Coke", "Fries"]);
    expect(bundles).toEqual([
      { bundleId: "b1", bundleName: "Meal", items: [items[1], items[3]], total: 120 },
      { bundleId: "b2", bundleName: "Dessert", items: [items[4]], total: 60 },
    ]);
  });

  it("names an unnamed bundle 'Bundle' and treats a bundle line without an id as loose", () => {
    const items = [
      line({ menuItemName: "A", isBundleItem: true, bundleId: "b1" }),
      line({ menuItemName: "B", isBundleItem: true }),
    ];

    const { regularItems, bundles } = groupBundleItems(items);

    expect(bundles[0].bundleName).toBe("Bundle");
    expect(regularItems.map((i) => i.menuItemName)).toEqual(["B"]);
  });

  it("returns the same grouping for the same input without mutating it", () => {
    const items = [
      line({ menuItemName: "A", isBundleItem: true, bundleId: "b1", subtotal: 5 }),
      line({ menuItemName: "B", isBundleItem: true, bundleId: "b1", subtotal: 7 }),
    ];
    const snapshot = JSON.stringify(items);

    const first = groupBundleItems(items);
    const second = groupBundleItems(items);

    expect(first).toEqual(second);
    expect(first.bundles[0].total).toBe(12);
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it("is empty for no items", () => {
    expect(groupBundleItems([])).toEqual({ regularItems: [], bundles: [] });
  });
});
