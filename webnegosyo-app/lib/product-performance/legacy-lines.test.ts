import { coverageStartMs, joinLegacyLines } from "./legacy-lines";

const WINDOW = { startMs: 1_000, endMs: 5_000 };

const ORDERS = [
  { _id: "o1", _creationTime: 2_000, status: "delivered", source: "pos" },
  { _id: "o2", _creationTime: 3_000, status: "cancelled", source: "web" },
  { _id: "o3", _creationTime: 9_000, status: "delivered", source: "web" },
  // Rung up offline at 4_000, synced later — the sale time wins.
  { _id: "o4", _creationTime: 8_000, saleOccurredAt: 4_000, status: "delivered", source: "pos" },
];

const ITEMS = [
  { orderId: "o1", menuItemId: "latte", menuItemName: "Latte", quantity: 1, subtotal: 150, variation: "Large", addons: [{ name: "Extra Shot", price: 30 }] },
  { orderId: "o2", menuItemId: "latte", menuItemName: "Latte", quantity: 1, subtotal: 150 },
  { orderId: "o3", menuItemId: "latte", menuItemName: "Latte", quantity: 1, subtotal: 150 },
  { orderId: "o4", menuItemId: "cookie", menuItemName: "Cookie", quantity: 2, subtotal: 100 },
  { orderId: "o1", menuItemId: null, menuItemName: "Deleted", quantity: 1, subtotal: 50 },
];

describe("joinLegacyLines", () => {
  it("keeps live orders' lines inside the window, dated by the sale", () => {
    // Act
    const lines = joinLegacyLines(ORDERS, ITEMS, { window: WINDOW });

    // Assert
    expect(lines.map((line) => [line.orderId, line.menuItemId, line.createdAtMs])).toEqual([
      ["o1", "latte", 2_000],
      ["o4", "cookie", 4_000],
    ]);
    expect(lines[0]).toMatchObject({
      source: "pos",
      variation: "Large",
      addons: [{ name: "Extra Shot", price: 30 }],
    });
  });

  it("narrows to one product when asked", () => {
    const lines = joinLegacyLines(ORDERS, ITEMS, { window: WINDOW, menuItemId: "cookie" });

    expect(lines.map((line) => line.menuItemId)).toEqual(["cookie"]);
  });

  it("is empty until both reads have landed", () => {
    expect(joinLegacyLines(undefined, ITEMS, { window: WINDOW })).toEqual([]);
    expect(joinLegacyLines(ORDERS, undefined, { window: WINDOW })).toEqual([]);
  });
});

describe("coverageStartMs", () => {
  it("is the requested start when the read was complete", () => {
    expect(coverageStartMs([{ createdAtMs: 3_000 }], false, 1_000)).toBe(1_000);
  });

  it("is the oldest line returned when the read hit its cap", () => {
    // Newest-first reads drop the OLDEST lines past the cap, so everything
    // before the oldest line that did arrive is unknown, not zero.
    expect(coverageStartMs([{ createdAtMs: 3_000 }, { createdAtMs: 2_500 }], true, 1_000)).toBe(2_500);
  });
});
