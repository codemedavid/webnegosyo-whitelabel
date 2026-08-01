import {
  DATE_RANGE_PRESETS,
  METRIC_OPTIONS,
  SOURCE_OPTIONS,
  TOP_N_OPTIONS,
  formatDayLabel,
  listAvailableDays,
  resolveDateWindow,
  resolveSingleDayWindow,
} from "./product-analytics-filters";

const DAY_MS = 24 * 60 * 60 * 1000;
// 2026-07-28T02:00:00Z === 2026-07-28 10:00 Manila
const NOW = Date.UTC(2026, 6, 28, 2, 0, 0);
// 00:00 Manila on 2026-07-28 === 2026-07-27T16:00:00Z
const JUL_28_LOCAL_START = Date.UTC(2026, 6, 27, 16, 0, 0);

describe("filter option catalogues", () => {
  it("offers the top-N caps the merchant asked for, including an uncapped view", () => {
    expect(TOP_N_OPTIONS.map((o) => o.value)).toEqual([10, 25, undefined]);
  });

  it("offers units, sales, and order-count as ranking metrics", () => {
    expect(METRIC_OPTIONS.map((o) => o.value)).toEqual(["sales", "units", "orders"]);
  });

  it("offers every order channel the platform writes", () => {
    expect(SOURCE_OPTIONS.map((o) => o.value).sort()).toEqual([
      "mobile",
      "pos",
      "qr_handoff",
      "web",
    ]);
  });

  it("offers today plus the rolling ranges", () => {
    expect(DATE_RANGE_PRESETS.map((p) => p.value)).toEqual(["today", "7d", "30d", "90d"]);
  });
});

describe("resolveDateWindow", () => {
  it("bounds 'today' to the merchant's local day, not the UTC day", () => {
    const window = resolveDateWindow("today", NOW);

    expect(window.startMs).toBe(JUL_28_LOCAL_START);
    expect(window.endMs).toBe(JUL_28_LOCAL_START + DAY_MS);
  });

  it("covers seven local days including today for the 7d preset", () => {
    const window = resolveDateWindow("7d", NOW);

    expect(window.endMs - window.startMs).toBe(7 * DAY_MS);
    expect(window.endMs).toBe(JUL_28_LOCAL_START + DAY_MS);
  });

  it("covers thirty local days for the 30d preset", () => {
    const window = resolveDateWindow("30d", NOW);
    expect(window.endMs - window.startMs).toBe(30 * DAY_MS);
  });

  it("always ends at the end of today so today's sales are included", () => {
    for (const preset of DATE_RANGE_PRESETS) {
      const window = resolveDateWindow(preset.value, NOW);
      expect(window.endMs).toBeGreaterThan(NOW);
    }
  });
});

describe("resolveSingleDayWindow", () => {
  it("bounds a picked date key to that local day", () => {
    const window = resolveSingleDayWindow("2026-07-28");

    expect(window.startMs).toBe(JUL_28_LOCAL_START);
    expect(window.endMs).toBe(JUL_28_LOCAL_START + DAY_MS);
  });

  it("round-trips with resolveDateWindow('today')", () => {
    expect(resolveSingleDayWindow("2026-07-28")).toEqual(resolveDateWindow("today", NOW));
  });
});

describe("listAvailableDays", () => {
  it("lists the distinct local days that have orders, newest first", () => {
    const orders = [
      { id: "a", createdAtMs: Date.UTC(2026, 6, 26, 2), status: "delivered" },
      { id: "b", createdAtMs: Date.UTC(2026, 6, 28, 2), status: "delivered" },
      { id: "c", createdAtMs: Date.UTC(2026, 6, 28, 5), status: "delivered" },
    ];

    expect(listAvailableDays(orders)).toEqual(["2026-07-28", "2026-07-26"]);
  });

  it("ignores cancelled orders so the picker offers no dead days", () => {
    const orders = [
      { id: "a", createdAtMs: Date.UTC(2026, 6, 26, 2), status: "cancelled" },
      { id: "b", createdAtMs: Date.UTC(2026, 6, 28, 2), status: "delivered" },
    ];

    expect(listAvailableDays(orders)).toEqual(["2026-07-28"]);
  });

  it("returns nothing for an empty order list", () => {
    expect(listAvailableDays([])).toEqual([]);
  });
});

describe("formatDayLabel", () => {
  it("names today and yesterday rather than printing a bare date", () => {
    expect(formatDayLabel("2026-07-28", "2026-07-28")).toBe("Today");
    expect(formatDayLabel("2026-07-27", "2026-07-28")).toBe("Yesterday");
  });

  it("prints a short month/day label for older days", () => {
    expect(formatDayLabel("2026-07-04", "2026-07-28")).toBe("Jul 4");
  });

  it("returns the raw key when it is not a parseable date", () => {
    expect(formatDayLabel("not-a-date", "2026-07-28")).toBe("not-a-date");
  });
});
