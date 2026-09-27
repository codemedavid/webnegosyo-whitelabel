import {
  MAX_RANGE_DAYS,
  clampSelection,
  describeSelection,
  rangeDayCount,
  resolveReportWindow,
  selectionToQueryArgs,
  supportsBoundedWindow,
  ordersInWindowArgs,
  BOUNDED_WINDOW_SCHEMA_VERSION,
  LEGACY_ORDER_PAGE,
  WINDOWED_ORDER_LIMIT,
  type ReportSelection,
} from "./report-window";

// Fri 19 Sep 2026, 13:00 in Manila — deliberately an instant whose UTC date
// (the 19th) and Manila date agree, with a sibling case below that does not.
const NOW = Date.parse("2026-09-19T05:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Epoch ms of Manila midnight opening `dayKey`. */
function manilaMidnight(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`) - MANILA_OFFSET_MS;
}

describe("resolveReportWindow", () => {
  it("covers exactly one 24h Manila day for a single picked day", () => {
    // Arrange
    const selection: ReportSelection = { kind: "day", dayKey: "2026-09-03" };

    // Act
    const window = resolveReportWindow(selection, NOW);

    // Assert
    expect(window.startMs).toBe(manilaMidnight("2026-09-03"));
    expect(window.endMs - window.startMs).toBe(DAY_MS);
  });

  it("starts a picked day at 16:00 UTC the previous day, not UTC midnight", () => {
    // The whole point of the Manila rule: 8pm Manila is already tomorrow in UTC,
    // so a UTC boundary would push the busiest hours onto the wrong date.
    const window = resolveReportWindow({ kind: "day", dayKey: "2026-09-03" }, NOW);

    expect(new Date(window.startMs).toISOString()).toBe("2026-09-02T16:00:00.000Z");
  });

  it("tiles consecutive days without overlap or gap", () => {
    const first = resolveReportWindow({ kind: "day", dayKey: "2026-09-03" }, NOW);
    const second = resolveReportWindow({ kind: "day", dayKey: "2026-09-04" }, NOW);

    expect(first.endMs).toBe(second.startMs);
  });

  it("includes BOTH end days of a range", () => {
    // Arrange — a merchant asking for "Sep 1 to Sep 14" means 14 days of trade,
    // not 13; an exclusive upper end silently drops the last day's takings.
    const selection: ReportSelection = {
      kind: "range",
      fromKey: "2026-09-01",
      toKey: "2026-09-14",
    };

    // Act
    const window = resolveReportWindow(selection, NOW);

    // Assert
    expect(window.startMs).toBe(manilaMidnight("2026-09-01"));
    expect(window.endMs).toBe(manilaMidnight("2026-09-15"));
    expect((window.endMs - window.startMs) / DAY_MS).toBe(14);
  });

  it("spans a single day when a range has the same start and end", () => {
    const window = resolveReportWindow(
      { kind: "range", fromKey: "2026-09-03", toKey: "2026-09-03" },
      NOW
    );

    expect(window.endMs - window.startMs).toBe(DAY_MS);
  });

  it("crosses a month boundary correctly", () => {
    const window = resolveReportWindow(
      { kind: "range", fromKey: "2026-08-30", toKey: "2026-09-02" },
      NOW
    );

    expect((window.endMs - window.startMs) / DAY_MS).toBe(4);
  });

  it("ends a preset window at the end of the local today", () => {
    const window = resolveReportWindow({ kind: "preset", days: 7 }, NOW);

    expect(window.endMs).toBe(manilaMidnight("2026-09-20"));
    expect((window.endMs - window.startMs) / DAY_MS).toBe(7);
  });

  it("refuses a day that is not a real calendar date", () => {
    expect(() => resolveReportWindow({ kind: "day", dayKey: "2026-13-45" }, NOW)).toThrow();
    expect(() => resolveReportWindow({ kind: "day", dayKey: "not-a-day" }, NOW)).toThrow();
  });
});

describe("selectionToQueryArgs", () => {
  it("sends only daysBack for a preset, so a stale backend keeps working", () => {
    // The compatibility rule: a deployment that has never heard of startMs
    // rejects the whole query. Presets must therefore look exactly as they do
    // today on the wire.
    const args = selectionToQueryArgs({ kind: "preset", days: 14 }, NOW);

    expect(args).toEqual({ daysBack: 14 });
    expect(args).not.toHaveProperty("startMs");
    expect(args).not.toHaveProperty("endMs");
  });

  it("sends a bounded window for a picked day", () => {
    const args = selectionToQueryArgs({ kind: "day", dayKey: "2026-09-03" }, NOW);

    expect(args).toEqual({
      startMs: manilaMidnight("2026-09-03"),
      endMs: manilaMidnight("2026-09-04"),
    });
  });

  it("sends a bounded window for a range", () => {
    const args = selectionToQueryArgs(
      { kind: "range", fromKey: "2026-09-01", toKey: "2026-09-14" },
      NOW
    );

    expect(args).toEqual({
      startMs: manilaMidnight("2026-09-01"),
      endMs: manilaMidnight("2026-09-15"),
    });
  });
});

describe("selectionToQueryArgs on a backend that serves bounded windows", () => {
  it("sends a preset as whole Manila calendar days ending tonight", () => {
    // "Last 7 days" means today and the six days before it — the same days the
    // Trends bars, Branches and the product view count — never now-minus-168h,
    // which starts mid-afternoon eight days ago.
    const args = selectionToQueryArgs({ kind: "preset", days: 7 }, NOW, true);

    expect(args).toEqual({
      startMs: manilaMidnight("2026-09-13"),
      endMs: manilaMidnight("2026-09-20"),
    });
  });

  it("sends Today as the Manila day, matching the Home takings", () => {
    const args = selectionToQueryArgs({ kind: "preset", days: 1 }, NOW, true);

    expect(args).toEqual({
      startMs: manilaMidnight("2026-09-19"),
      endMs: manilaMidnight("2026-09-20"),
    });
  });

  it("still sends a picked day exactly", () => {
    const args = selectionToQueryArgs({ kind: "day", dayKey: "2026-09-18" }, NOW, true);

    expect(args).toEqual({
      startMs: manilaMidnight("2026-09-18"),
      endMs: manilaMidnight("2026-09-19"),
    });
  });
});

describe("supportsBoundedWindow", () => {
  it("is true for the platform backend, whatever its Convex version", () => {
    expect(supportsBoundedWindow("platform", null)).toBe(true);
  });

  it("is true for a Convex store deployed at or past the bounded-window bundle", () => {
    expect(supportsBoundedWindow("convex", BOUNDED_WINDOW_SCHEMA_VERSION)).toBe(true);
    expect(supportsBoundedWindow("convex", 34)).toBe(true);
  });

  it("is false for an older or unknown Convex bundle, which would reject startMs", () => {
    expect(supportsBoundedWindow("convex", 28)).toBe(false);
    expect(supportsBoundedWindow("convex", null)).toBe(false);
    expect(supportsBoundedWindow("convex", undefined)).toBe(false);
  });

  it("is false while the route is unresolved", () => {
    expect(supportsBoundedWindow("idle", 40)).toBe(false);
    expect(supportsBoundedWindow("unsupported", 40)).toBe(false);
  });
});

describe("ordersInWindowArgs", () => {
  const window = { startMs: manilaMidnight("2026-09-13"), endMs: manilaMidnight("2026-09-20") };

  it("reads exactly the window when the backend can bound it", () => {
    expect(ordersInWindowArgs(window, true)).toEqual({ ...window, limit: WINDOWED_ORDER_LIMIT });
  });

  it("keeps the old most-recent page on a backend that would reject startMs", () => {
    expect(ordersInWindowArgs(window, false)).toEqual({ limit: LEGACY_ORDER_PAGE });
    expect(ordersInWindowArgs(window, false, 1000)).toEqual({ limit: 1000 });
  });
});

describe("clampSelection", () => {
  it("pulls a future day back to today", () => {
    // An empty future report is indistinguishable from a day whose data went
    // missing, so it is never offered.
    const clamped = clampSelection({ kind: "day", dayKey: "2027-01-01" }, NOW);

    expect(clamped).toEqual({ kind: "day", dayKey: "2026-09-19" });
  });

  it("leaves today alone", () => {
    const selection: ReportSelection = { kind: "day", dayKey: "2026-09-19" };

    expect(clampSelection(selection, NOW)).toEqual(selection);
  });

  it("swaps a range entered back to front", () => {
    // Tapping the later day first is the normal way to use a calendar.
    const clamped = clampSelection(
      { kind: "range", fromKey: "2026-09-14", toKey: "2026-09-01" },
      NOW
    );

    expect(clamped).toEqual({ kind: "range", fromKey: "2026-09-01", toKey: "2026-09-14" });
  });

  it("pulls a range's future end back to today", () => {
    const clamped = clampSelection(
      { kind: "range", fromKey: "2026-09-01", toKey: "2027-03-01" },
      NOW
    );

    expect(clamped).toEqual({ kind: "range", fromKey: "2026-09-01", toKey: "2026-09-19" });
  });

  it("caps a range wider than the fetch ceiling can honestly serve", () => {
    const clamped = clampSelection(
      { kind: "range", fromKey: "2020-01-01", toKey: "2026-09-19" },
      NOW
    );

    expect(rangeDayCount(clamped)).toBe(MAX_RANGE_DAYS);
  });

  it("keeps a preset within the servable range", () => {
    expect(clampSelection({ kind: "preset", days: 0 }, NOW)).toEqual({ kind: "preset", days: 1 });
    expect(clampSelection({ kind: "preset", days: 99999 }, NOW)).toEqual({
      kind: "preset",
      days: MAX_RANGE_DAYS,
    });
  });

  it("falls back to a sane day rather than throwing on a malformed key", () => {
    // The selection can arrive from persisted state, so it can be stale or
    // nonsense. A report is a read: bad input means show a sensible day.
    expect(clampSelection({ kind: "day", dayKey: "garbage" }, NOW)).toEqual({
      kind: "day",
      dayKey: "2026-09-19",
    });
  });
});

describe("describeSelection", () => {
  it("names the presets the way the pills do", () => {
    expect(describeSelection({ kind: "preset", days: 7 }, NOW)).toBe("Last 7 days");
    expect(describeSelection({ kind: "preset", days: 1 }, NOW)).toBe("Today");
  });

  it("names today and yesterday relatively", () => {
    expect(describeSelection({ kind: "day", dayKey: "2026-09-19" }, NOW)).toBe("Today");
    expect(describeSelection({ kind: "day", dayKey: "2026-09-18" }, NOW)).toBe("Yesterday");
  });

  it("names an older day by its date", () => {
    expect(describeSelection({ kind: "day", dayKey: "2026-09-03" }, NOW)).toBe("Sep 3");
  });

  it("names a day in an earlier year with that year", () => {
    expect(describeSelection({ kind: "day", dayKey: "2025-12-25" }, NOW)).toBe("Dec 25, 2025");
  });

  it("names a range by both ends", () => {
    expect(
      describeSelection({ kind: "range", fromKey: "2026-09-01", toKey: "2026-09-14" }, NOW)
    ).toBe("Sep 1 – Sep 14");
  });

  it("names a one-day range as that day", () => {
    expect(
      describeSelection({ kind: "range", fromKey: "2026-09-03", toKey: "2026-09-03" }, NOW)
    ).toBe("Sep 3");
  });
});

describe("rangeDayCount", () => {
  it("counts both ends of a range", () => {
    expect(rangeDayCount({ kind: "range", fromKey: "2026-09-01", toKey: "2026-09-14" })).toBe(
      14
    );
  });

  it("counts a single day as one", () => {
    expect(rangeDayCount({ kind: "day", dayKey: "2026-09-03" })).toBe(1);
  });

  it("counts a preset as its span", () => {
    expect(rangeDayCount({ kind: "preset", days: 30 })).toBe(30);
  });
});
