import {
  DEFAULT_PRODUCT_FILTERS,
  buildFilterChips,
  clearChip,
  countActiveFilters,
  hasActiveFilters,
  type ProductFilterState,
} from "./product-filter-summary";

const CONTEXT = {
  categoryNameById: { "cat-1": "Drinks", "cat-2": "Rice Meals" },
  dayLabel: (key: string) => (key === "2026-07-28" ? "Today" : "Jul 4"),
};

function withFilters(overrides: Partial<ProductFilterState>): ProductFilterState {
  return { ...DEFAULT_PRODUCT_FILTERS, ...overrides };
}

describe("countActiveFilters", () => {
  it("counts nothing when every filter sits at its default", () => {
    expect(countActiveFilters(DEFAULT_PRODUCT_FILTERS)).toBe(0);
    expect(hasActiveFilters(DEFAULT_PRODUCT_FILTERS)).toBe(false);
  });

  it("ignores the search term, which has its own visible field", () => {
    // Arrange
    const state = withFilters({ search: "sisig" });

    // Act & Assert — the badge counts what is hidden in the sheet, not what
    // the merchant can already see and clear in the search box.
    expect(countActiveFilters(state)).toBe(0);
  });

  it("counts each channel separately so the badge matches the chip count", () => {
    const state = withFilters({ sources: ["pos", "web"] });

    expect(countActiveFilters(state)).toBe(2);
    expect(buildFilterChips(state, CONTEXT)).toHaveLength(2);
  });

  it("counts every non-default dimension", () => {
    const state = withFilters({
      selectedDay: "2026-07-04",
      metric: "units",
      topN: undefined,
      sources: ["pos"],
      categoryId: "cat-1",
    });

    expect(countActiveFilters(state)).toBe(5);
  });
});

describe("buildFilterChips", () => {
  it("returns no chips for a default view", () => {
    expect(buildFilterChips(DEFAULT_PRODUCT_FILTERS, CONTEXT)).toEqual([]);
  });

  it("labels a picked day the way the merchant reads it", () => {
    const chips = buildFilterChips(withFilters({ selectedDay: "2026-07-28" }), CONTEXT);

    expect(chips).toEqual([{ id: "day", kind: "day", label: "Today" }]);
  });

  it("names the ranking metric only when it is not the default", () => {
    expect(buildFilterChips(withFilters({ metric: "sales" }), CONTEXT)).toEqual([]);
    expect(buildFilterChips(withFilters({ metric: "units" }), CONTEXT)[0].label).toBe(
      "By units",
    );
    expect(buildFilterChips(withFilters({ metric: "orders" }), CONTEXT)[0].label).toBe(
      "By orders",
    );
  });

  it("names the cap, including the uncapped view", () => {
    expect(buildFilterChips(withFilters({ topN: 10 }), CONTEXT)).toEqual([]);
    expect(buildFilterChips(withFilters({ topN: 25 }), CONTEXT)[0].label).toBe("Top 25");
    expect(buildFilterChips(withFilters({ topN: undefined }), CONTEXT)[0].label).toBe(
      "All products",
    );
  });

  it("gives every selected channel its own removable chip", () => {
    const chips = buildFilterChips(withFilters({ sources: ["pos", "qr_handoff"] }), CONTEXT);

    expect(chips).toEqual([
      { id: "source:pos", kind: "source", label: "Counter", value: "pos" },
      { id: "source:qr_handoff", kind: "source", label: "QR", value: "qr_handoff" },
    ]);
  });

  it("resolves the category to its name", () => {
    const chips = buildFilterChips(withFilters({ categoryId: "cat-2" }), CONTEXT);

    expect(chips[0]).toEqual({ id: "category", kind: "category", label: "Rice Meals" });
  });

  it("survives a category that is no longer on the menu", () => {
    // A category deleted while the filter was set must not render a blank chip
    // the merchant cannot identify or trust.
    const chips = buildFilterChips(withFilters({ categoryId: "gone" }), CONTEXT);

    expect(chips[0].label).toBe("1 category");
  });

  it("orders chips the way the merchant narrowed: when, then what, then how", () => {
    const state = withFilters({
      selectedDay: "2026-07-04",
      metric: "units",
      topN: 25,
      sources: ["web"],
      categoryId: "cat-1",
    });

    expect(buildFilterChips(state, CONTEXT).map((c) => c.kind)).toEqual([
      "day",
      "category",
      "source",
      "metric",
      "topN",
    ]);
  });
});

describe("clearChip", () => {
  it("returns a new state rather than mutating the old one", () => {
    const state = withFilters({ categoryId: "cat-1" });
    const next = clearChip(state, { id: "category", kind: "category", label: "Drinks" });

    expect(next).not.toBe(state);
    expect(state.categoryId).toBe("cat-1");
    expect(next.categoryId).toBeNull();
  });

  it("returns each dimension to its default", () => {
    const state = withFilters({ selectedDay: "2026-07-04", metric: "units", topN: undefined });

    expect(clearChip(state, { id: "day", kind: "day", label: "Jul 4" }).selectedDay).toBeNull();
    expect(clearChip(state, { id: "metric", kind: "metric", label: "By units" }).metric).toBe(
      "sales",
    );
    expect(clearChip(state, { id: "topN", kind: "topN", label: "All products" }).topN).toBe(10);
  });

  it("removes only the channel that was tapped", () => {
    const state = withFilters({ sources: ["web", "pos", "qr_handoff"] });

    const next = clearChip(state, {
      id: "source:pos",
      kind: "source",
      label: "Counter",
      value: "pos",
    });

    expect(next.sources).toEqual(["web", "qr_handoff"]);
  });

  it("keeps the search term, which is cleared from its own field", () => {
    const state = withFilters({ search: "sisig", categoryId: "cat-1" });

    expect(clearChip(state, { id: "category", kind: "category", label: "Drinks" }).search).toBe(
      "sisig",
    );
  });
});
