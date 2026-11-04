jest.mock("./supabase", () => ({ supabase: {} }));

import { filterRegisterItems } from "./pos-grid-filter";

const item = (name: string, categoryId: string, soldOutReason: string | null = null) => ({
  product: { name, category_id: categoryId },
  soldOutReason,
});

const ITEMS = [
  item("Iced Latte", "c-drinks"),
  item("Iced Mocha", "c-drinks", "Marked sold out."),
  item("Cheesecake", "c-desserts", "Marked sold out."),
];

describe("filterRegisterItems", () => {
  it("keeps sold-out tiles with no filter", () => {
    expect(filterRegisterItems(ITEMS, null, "")).toHaveLength(3);
  });

  it("keeps sold-out tiles inside a category", () => {
    expect(filterRegisterItems(ITEMS, "c-drinks", "").map((i) => i.product.name)).toEqual(["Iced Latte", "Iced Mocha"]);
    expect(filterRegisterItems(ITEMS, "c-desserts", "").map((i) => i.soldOutReason)).toEqual(["Marked sold out."]);
  });

  it("keeps sold-out tiles in search results, case-insensitively", () => {
    expect(filterRegisterItems(ITEMS, null, "MOCHA").map((i) => i.product.name)).toEqual(["Iced Mocha"]);
    expect(filterRegisterItems(ITEMS, "c-drinks", "iced")).toHaveLength(2);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterRegisterItems(ITEMS, "c-desserts", "latte")).toEqual([]);
  });
});
