import {
  MAX_PROFIT_DAYS,
  checkCustomRange,
  customDays,
  manilaMidnight,
  recurringCompareWindow,
  resolveProfitWindow,
  trendPlan,
  windowAt,
} from "./profit-period";

// Wed 2026-10-21 12:00 in Manila.
const NOW = Date.parse("2026-10-21T04:00:00Z");
const HOUR = 3600_000;

describe("a window read again later", () => {
  it("reads a running period up to the new now, not the first read's end", () => {
    // Arrange
    const w = resolveProfitWindow({ preset: "this_month" }, NOW);

    // Act
    const later = windowAt(w, NOW + 3 * HOUR);

    // Assert
    expect(later.end).toBe(NOW + 3 * HOUR);
    expect(later).toMatchObject({ start: w.start, fromKey: w.fromKey, toKey: w.toKey, isPartial: true });
  });

  it("reads a period that has since ended whole, and says it is over", () => {
    const w = resolveProfitWindow({ preset: "this_week" }, NOW);

    const nextWeek = windowAt(w, NOW + 7 * 24 * HOUR);

    expect(nextWeek).toMatchObject({ end: w.fullEnd, isPartial: false });
  });

  it("leaves a finished period alone", () => {
    const w = resolveProfitWindow({ preset: "last_month" }, NOW);

    expect(windowAt(w, NOW + HOUR)).toEqual(w);
  });
});

describe("missing-bill comparison", () => {
  it("compares a month with the month before", () => {
    const w = resolveProfitWindow({ preset: "this_month" }, NOW);

    expect(recurringCompareWindow(w)).toEqual({ start: manilaMidnight("2026-09-01"), end: manilaMidnight("2026-10-01") });
  });

  it("never compares a week: rent paid last week is not missing this week", () => {
    expect(recurringCompareWindow(resolveProfitWindow({ preset: "this_week" }, NOW))).toBeNull();
  });

  it("compares only month-long custom ranges", () => {
    const short = resolveProfitWindow({ preset: "custom", fromKey: "2026-10-01", toKey: "2026-10-14" }, NOW);
    const long = resolveProfitWindow({ preset: "custom", fromKey: "2026-09-01", toKey: "2026-09-30" }, NOW);

    expect(recurringCompareWindow(short)).toBeNull();
    expect(recurringCompareWindow(long)).toEqual({ start: manilaMidnight("2026-08-02"), end: manilaMidnight("2026-09-01") });
  });
});

describe("the trend plan", () => {
  it("shows a week beside the five before it, in one read", () => {
    const w = resolveProfitWindow({ preset: "this_week" }, NOW);

    const plan = trendPlan(w);

    expect(plan).toMatchObject({ grain: "week", title: "Last 6 weeks", windowKey: "2026-10-19", start: manilaMidnight("2026-09-14") });
    expect(plan.keys).toEqual(["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("shows a month beside the two before it, within the 93-day cap", () => {
    const w = resolveProfitWindow({ preset: "this_month" }, NOW);

    const plan = trendPlan(w);

    expect(plan).toMatchObject({ grain: "month", title: "Last 3 months", windowKey: "2026-10-01", start: manilaMidnight("2026-08-01") });
    expect(plan.keys).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
  });

  it("never asks for more than 93 days, whichever month is chosen", () => {
    // Every month of a year (and across the year end), read whole.
    for (let month = 1; month <= 13; month += 1) {
      const day = month === 13 ? "2027-01-15" : `2026-${String(month).padStart(2, "0")}-15`;
      const now = Date.parse(`${day}T04:00:00Z`);
      const w = resolveProfitWindow({ preset: "last_month" }, now);
      const days = (w.end - trendPlan(w).start) / (24 * HOUR);
      expect(days).toBeLessThanOrEqual(MAX_PROFIT_DAYS);
    }
  });

  it("crosses the year end", () => {
    const w = resolveProfitWindow({ preset: "this_month" }, Date.parse("2027-01-10T04:00:00Z"));

    expect(trendPlan(w).keys).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("keeps a custom range to its own days", () => {
    const w = resolveProfitWindow({ preset: "custom", fromKey: "2026-10-01", toKey: "2026-10-05" }, NOW);

    const plan = trendPlan(w);

    expect(plan).toMatchObject({ grain: "day", title: "Day by day", start: w.start, windowKey: "2026-10-01" });
    expect(plan.keys).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
  });
});

describe("custom range refusals", () => {
  it("names what is wrong instead of always asking for a shorter range", () => {
    expect(checkCustomRange("2026-10-05", "2026-10-01", NOW)).toMatchObject({ ok: false, title: "Check the days" });
    expect(checkCustomRange("2026-06-01", "2026-10-01", NOW)).toMatchObject({ ok: false, title: "Pick a shorter range" });
    expect(checkCustomRange("2026-10-25", "2026-10-26", NOW)).toMatchObject({ ok: false, title: "Pick an earlier range" });
    expect(customDays("2026-10-25", "2026-10-26")).toBe(2);
  });
});
