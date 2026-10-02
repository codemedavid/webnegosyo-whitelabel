import { buildPairingInsights, pairStrength, type PairingLine } from "./pairings";

const CATALOG = [
  { id: "burger", name: "Burger", categoryId: "mains" },
  { id: "chicken", name: "Chicken", categoryId: "mains" },
  { id: "fries", name: "Fries", categoryId: "sides" },
  { id: "coke", name: "Coke", categoryId: "drinks" },
  { id: "rice", name: "Rice", categoryId: "sides" },
  { id: "pie", name: "Pie", categoryId: null },
];

const CATEGORIES = [
  { id: "mains", name: "Mains" },
  { id: "sides", name: "Sides" },
  { id: "drinks", name: "Drinks" },
];

/** One basket per order: `basket("o1", "burger", "fries")`. */
function basket(orderId: string, ...itemIds: string[]): PairingLine[] {
  return itemIds.map((menuItemId) => ({ orderId, menuItemId, menuItemName: `${menuItemId} (sold)` }));
}

function build(lines: PairingLine[]) {
  return buildPairingInsights({ lines, catalog: CATALOG, categories: CATEGORIES });
}

describe("pairStrength", () => {
  it("grades how often the partner rides along with the anchor", () => {
    expect(pairStrength(0.6)).toBe("always");
    expect(pairStrength(0.3)).toBe("often");
    expect(pairStrength(0.29)).toBe("sometimes");
  });
});

describe("buildPairingInsights", () => {
  it("returns an empty summary when nothing sold", () => {
    // Arrange / Act
    const result = build([]);

    // Assert
    expect(result.orderCount).toBe(0);
    expect(result.multiItemShare).toBe(0);
    expect(result.itemPairs).toEqual([]);
    expect(result.categoryPairs).toEqual([]);
    expect(result.partnersByItem).toEqual([]);
  });

  it("counts orders, not lines, so a repeated item in one basket counts once", () => {
    // Arrange
    const lines = [
      ...basket("o1", "burger", "burger", "fries"),
      ...basket("o2", "burger", "fries"),
      ...basket("o3", "coke"),
    ];

    // Act
    const result = build(lines);

    // Assert
    expect(result.orderCount).toBe(3);
    expect(result.multiItemOrders).toBe(2);
    expect(result.multiItemShare).toBeCloseTo(2 / 3, 4);
    expect(result.avgItemsPerOrder).toBeCloseTo(5 / 3, 4);
    expect(result.itemPairs).toHaveLength(1);
    expect(result.itemPairs[0]).toMatchObject({ together: 2 });
  });

  it("orients each pair toward the item whose orders most often hold the partner", () => {
    // Arrange: fries is in every burger order, burger in only 2 of 4 fries orders.
    const lines = [
      ...basket("o1", "burger", "fries"),
      ...basket("o2", "burger", "fries"),
      ...basket("o3", "fries", "coke"),
      ...basket("o4", "fries"),
      ...basket("o5", "coke"),
      ...basket("o6", "chicken"),
    ];

    // Act
    const [pair] = build(lines).itemPairs;

    // Assert
    expect(pair.anchor).toEqual({ id: "burger", name: "Burger" });
    expect(pair.partner).toEqual({ id: "fries", name: "Fries" });
    expect(pair.share).toBe(1);
    expect(pair.reverseShare).toBe(0.5);
    expect(pair.strength).toBe("always");
    expect(pair.suggestion).toBe("combo");
  });

  it("drops pairs that meet no more often than chance", () => {
    // Arrange: rice is in every order, so it shares an order with everything.
    const lines = [
      ...basket("o1", "rice", "burger"),
      ...basket("o2", "rice", "burger"),
      ...basket("o3", "rice", "chicken"),
      ...basket("o4", "rice", "chicken"),
    ];

    // Act
    const result = build(lines);

    // Assert
    expect(result.itemPairs).toEqual([]);
  });

  it("ignores a pair seen in only one order", () => {
    const result = build([...basket("o1", "burger", "coke"), ...basket("o2", "chicken")]);

    expect(result.itemPairs).toEqual([]);
  });

  it("pairs categories across baskets and never pairs a category with itself", () => {
    // Arrange
    const lines = [
      ...basket("o1", "burger", "chicken", "coke"),
      ...basket("o2", "burger", "coke"),
      ...basket("o3", "chicken", "fries"),
      ...basket("o4", "chicken", "fries", "coke"),
    ];

    // Act
    const result = build(lines);

    // Assert
    expect(result.categoryPairs.map((pair) => [pair.anchor.name, pair.partner.name, pair.together])).toEqual([
      ["Drinks", "Mains", 3],
      ["Sides", "Mains", 2],
      ["Sides", "Drinks", 1],
    ]);
    const drinksMains = result.categoryPairs[0];
    // Every Drinks order held a Main; 3 of 4 Mains orders held a Drink.
    expect(drinksMains.share).toBe(1);
    expect(drinksMains.reverseShare).toBe(0.75);
  });

  it("files items without a category under 'Uncategorized'", () => {
    const lines = [...basket("o1", "pie", "coke"), ...basket("o2", "pie", "coke")];

    const [pair] = build(lines).categoryPairs;

    expect([pair.anchor.name, pair.partner.name].sort()).toEqual(["Drinks", "Uncategorized"]);
  });

  it("names a product that left the menu from what the order recorded", () => {
    const lines = [
      ...basket("o1", "gone", "coke"),
      ...basket("o2", "gone", "coke"),
      ...basket("o3", "burger"),
    ];

    const result = build(lines);

    const names = [result.itemPairs[0].anchor.name, result.itemPairs[0].partner.name].sort();
    expect(names).toEqual(["Coke", "gone (sold)"]);
    expect(result.categoryPairs.some((pair) => pair.anchor.name === "Uncategorized" || pair.partner.name === "Uncategorized")).toBe(true);
  });

  it("lists each popular item with what is most often ordered alongside it", () => {
    // Arrange
    const lines = [
      ...basket("o1", "burger", "fries", "coke"),
      ...basket("o2", "burger", "fries"),
      ...basket("o3", "burger", "coke"),
      ...basket("o4", "burger", "fries"),
      ...basket("o5", "chicken"),
    ];

    // Act
    const result = build(lines);

    // Assert
    const burger = result.partnersByItem.find((entry) => entry.item.id === "burger");
    expect(burger).toBeDefined();
    expect(burger?.orders).toBe(4);
    expect(burger?.categoryName).toBe("Mains");
    expect(burger?.partners.map((partner) => [partner.name, partner.together, partner.share])).toEqual([
      ["Fries", 3, 0.75],
      ["Coke", 2, 0.5],
    ]);
    // An item never ordered with anything has no partners to show.
    expect(result.partnersByItem.some((entry) => entry.item.id === "chicken")).toBe(false);
    // Most-ordered first.
    expect(result.partnersByItem[0].item.id).toBe("burger");
  });

  it("caps the lists it returns", () => {
    // Arrange: 30 distinct items, every pair seen twice and above chance.
    const ids = Array.from({ length: 30 }, (_, i) => `x${i}`);
    const lines: PairingLine[] = [];
    ids.forEach((id, i) => {
      const next = ids[(i + 1) % ids.length];
      lines.push(...basket(`a${i}`, id, next), ...basket(`b${i}`, id, next));
    });

    // Act
    const result = buildPairingInsights({
      lines,
      catalog: CATALOG,
      categories: CATEGORIES,
      limits: { itemPairs: 5, partnersByItem: 4, partnersPerItem: 1 },
    });

    // Assert
    expect(result.itemPairs).toHaveLength(5);
    expect(result.partnersByItem).toHaveLength(4);
    expect(result.partnersByItem.every((entry) => entry.partners.length === 1)).toBe(true);
  });
});
