import {
  DEFAULT_ACTIVITY_FILTERS,
  activeQuickFilter,
  activityFiltersReducer,
  filterChips,
  periodWindow,
  quickFilterOptions,
  sheetFilterCount,
  toActivityQuery,
  type ActivityFilters,
} from "./filters";

// 2026-10-12 12:41 PM in Manila.
const NOW = "2026-10-12T04:41:00.000Z";

describe("periodWindow", () => {
  it("starts Today at Manila midnight", () => {
    expect(periodWindow("today", null, NOW)).toEqual({ since: "2026-10-11T16:00:00.000Z", until: null });
  });

  it("bounds Yesterday on both sides", () => {
    expect(periodWindow("yesterday", null, NOW)).toEqual({
      since: "2026-10-10T16:00:00.000Z",
      until: "2026-10-11T16:00:00.000Z",
    });
  });

  it("counts the last 7 days including today", () => {
    expect(periodWindow("last7", null, NOW).since).toBe("2026-10-05T16:00:00.000Z");
  });

  it("starts This month on the 1st, Manila time", () => {
    expect(periodWindow("month", null, NOW).since).toBe("2026-09-30T16:00:00.000Z");
  });

  it("uses picked dates as given", () => {
    const range = { since: "2026-10-01T16:00:00.000Z", until: "2026-10-03T16:00:00.000Z" };
    expect(periodWindow("custom", range, NOW)).toEqual(range);
  });
});

describe("activityFiltersReducer", () => {
  it("narrows to one category from a quick chip, and back to everything", () => {
    const money = activityFiltersReducer(DEFAULT_ACTIVITY_FILTERS, { type: "quick", value: "money" });
    expect(money.categories).toEqual(["money"]);
    expect(money.flaggedOnly).toBe(false);
    expect(activeQuickFilter(money)).toBe("money");

    const all = activityFiltersReducer(money, { type: "quick", value: "all" });
    expect(all.categories).toEqual([]);
    expect(activeQuickFilter(all)).toBe("all");
  });

  it("shows only open flags from Needs a look", () => {
    const next = activityFiltersReducer(DEFAULT_ACTIVITY_FILTERS, { type: "quick", value: "needs_look" });
    expect(next.flaggedOnly).toBe(true);
    expect(next.categories).toEqual([]);
    expect(activeQuickFilter(next)).toBe("needs_look");
  });

  it("never mutates the state it was given", () => {
    const before = { ...DEFAULT_ACTIVITY_FILTERS, categories: ["money"] as const };
    const frozen = Object.freeze({ ...before, categories: Object.freeze([...before.categories]) }) as ActivityFilters;
    expect(() => activityFiltersReducer(frozen, { type: "toggleCategory", category: "stock" })).not.toThrow();
  });

  it("toggles categories in the sheet", () => {
    const once = activityFiltersReducer(DEFAULT_ACTIVITY_FILTERS, { type: "toggleCategory", category: "stock" });
    const twice = activityFiltersReducer(once, { type: "toggleCategory", category: "cash" });
    expect(twice.categories).toEqual(["stock", "cash"]);
    expect(activeQuickFilter(twice)).toBeNull();
    expect(activityFiltersReducer(twice, { type: "toggleCategory", category: "stock" }).categories).toEqual(["cash"]);
  });

  it("sets and clears a person, a subject and a search", () => {
    let state = activityFiltersReducer(DEFAULT_ACTIVITY_FILTERS, {
      type: "setActor",
      actor: { id: "u1", name: "Ana Reyes" },
    });
    state = activityFiltersReducer(state, {
      type: "setSubject",
      subject: { type: "ingredient", ref: "ing-1", label: "Rice" },
    });
    state = activityFiltersReducer(state, { type: "setSearch", text: "#14" });
    expect(state.actor?.id).toBe("u1");
    expect(state.subject?.ref).toBe("ing-1");
    expect(state.search).toBe("#14");

    const cleared = activityFiltersReducer(state, { type: "reset" });
    expect(cleared).toEqual(DEFAULT_ACTIVITY_FILTERS);
  });

  it("removes exactly the chip that was tapped", () => {
    let state = activityFiltersReducer(DEFAULT_ACTIVITY_FILTERS, {
      type: "setActor",
      actor: { id: "u1", name: "Ana Reyes" },
    });
    state = activityFiltersReducer(state, { type: "setPeriod", period: "today" });
    const withoutActor = activityFiltersReducer(state, { type: "removeChip", key: "actor" });
    expect(withoutActor.actor).toBeNull();
    expect(withoutActor.period).toBe("today");
    const withoutPeriod = activityFiltersReducer(state, { type: "removeChip", key: "period" });
    expect(withoutPeriod.period).toBe(DEFAULT_ACTIVITY_FILTERS.period);
  });

  it("applies a whole sheet draft at once", () => {
    const draft: ActivityFilters = { ...DEFAULT_ACTIVITY_FILTERS, includeRoutine: true, outletId: "o1" };
    expect(activityFiltersReducer(DEFAULT_ACTIVITY_FILTERS, { type: "replace", filters: draft })).toEqual(draft);
  });

  it("drops a custom range back to the default period when the range is missing", () => {
    const next = activityFiltersReducer(DEFAULT_ACTIVITY_FILTERS, { type: "setPeriod", period: "custom" });
    expect(next.period).toBe(DEFAULT_ACTIVITY_FILTERS.period);
  });
});

describe("filterChips", () => {
  const labels = { outletName: (id: string) => (id === "o1" ? "Makati branch" : null) };

  it("echoes every sheet filter as a removable chip, in words", () => {
    const state: ActivityFilters = {
      ...DEFAULT_ACTIVITY_FILTERS,
      period: "today",
      actor: { id: "u1", name: "Ana Reyes" },
      outletId: "o1",
      includeRoutine: true,
      subject: { type: "ingredient", ref: "ing-1", label: "Rice" },
      search: "#14",
    };
    expect(filterChips(state, labels).map((chip) => chip.label)).toEqual([
      "Today",
      "Ana",
      "Makati branch",
      "Rice",
      "With routine events",
      "“#14”",
    ]);
  });

  it("shows nothing for the defaults", () => {
    expect(filterChips(DEFAULT_ACTIVITY_FILTERS, labels)).toEqual([]);
    expect(sheetFilterCount(DEFAULT_ACTIVITY_FILTERS)).toBe(0);
  });

  it("counts what the sheet changed for the Filter chip", () => {
    const state: ActivityFilters = {
      ...DEFAULT_ACTIVITY_FILTERS,
      actor: { id: "u1", name: "Ana" },
      includeRoutine: true,
      categories: ["stock", "cash"],
    };
    expect(sheetFilterCount(state)).toBe(3);
  });
});

describe("quickFilterOptions", () => {
  it("offers Team only to the owner, and Needs a look only to full viewers", () => {
    const owner = quickFilterOptions({ isOwner: true, isFullViewer: true, flaggedOpen: 2 });
    expect(owner.map((option) => option.label)).toEqual([
      "All",
      "Needs a look · 2",
      "Orders",
      "Money",
      "Stock",
      "Cash",
      "Loyalty",
      "Menu",
      "Team",
    ]);
    const manager = quickFilterOptions({ isOwner: false, isFullViewer: true, flaggedOpen: 0 });
    expect(manager.map((option) => option.value)).not.toContain("team");
    expect(manager.find((option) => option.value === "needs_look")?.label).toBe("Needs a look");
    const cashier = quickFilterOptions({ isOwner: false, isFullViewer: false, flaggedOpen: 0 });
    expect(cashier.map((option) => option.value)).not.toContain("needs_look");
  });
});

describe("toActivityQuery", () => {
  it("turns the filters into an RPC query, narrowing a store-wide account to a branch", () => {
    const state: ActivityFilters = {
      ...DEFAULT_ACTIVITY_FILTERS,
      period: "today",
      categories: ["money"],
      actor: { id: "u1", name: "Ana" },
      outletId: "o1",
      subject: { type: "order", ref: "ord-1", label: "#14" },
    };
    expect(toActivityQuery(state, { tenantId: "t1", nowIso: NOW, isStoreWide: true, drilledOutletId: null })).toEqual({
      tenantId: "t1",
      since: "2026-10-11T16:00:00.000Z",
      until: null,
      categories: ["money"],
      outletId: "o1",
      actorUserId: "u1",
      flaggedOnly: false,
      includeRoutine: false,
      search: null,
      subjectType: "order",
      subjectRef: "ord-1",
    });
  });

  it("never sends a branch for a branch-locked account (the server scopes it, store-wide rows included)", () => {
    const state = { ...DEFAULT_ACTIVITY_FILTERS, outletId: "o1" };
    const query = toActivityQuery(state, { tenantId: "t1", nowIso: NOW, isStoreWide: false, drilledOutletId: "o1" });
    expect(query.outletId).toBeNull();
  });

  it("follows the branch an owner drilled into when no branch is picked", () => {
    const query = toActivityQuery(DEFAULT_ACTIVITY_FILTERS, {
      tenantId: "t1",
      nowIso: NOW,
      isStoreWide: true,
      drilledOutletId: "o2",
    });
    expect(query.outletId).toBe("o2");
  });
});
