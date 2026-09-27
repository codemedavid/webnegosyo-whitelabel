import { PERFORMANCE_PERIODS, isPerformancePeriod, resolvePerformancePeriod } from "./period";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
function manilaMidnight(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`) - MANILA_OFFSET_MS;
}

// 13:00 Manila on Thu 24 Sep 2026.
const NOW = Date.parse("2026-09-24T05:00:00.000Z");

describe("resolvePerformancePeriod", () => {
  it("reads Today as the Manila day, against yesterday", () => {
    const period = resolvePerformancePeriod("today", NOW);

    expect(period.window).toEqual({ startMs: manilaMidnight("2026-09-24"), endMs: manilaMidnight("2026-09-25") });
    expect(period.previous).toEqual({ startMs: manilaMidnight("2026-09-23"), endMs: manilaMidnight("2026-09-24") });
    expect(period.comparisonLabel).toBe("yesterday");
  });

  it("reads Yesterday as the whole of yesterday, against the day before", () => {
    const period = resolvePerformancePeriod("yesterday", NOW);

    expect(period.window).toEqual({ startMs: manilaMidnight("2026-09-23"), endMs: manilaMidnight("2026-09-24") });
    expect(period.previous).toEqual({ startMs: manilaMidnight("2026-09-22"), endMs: manilaMidnight("2026-09-23") });
    expect(period.comparisonLabel).toBe("the day before");
  });

  it("reads 7 days as today and the six before it", () => {
    const period = resolvePerformancePeriod("7d", NOW);

    expect(period.window).toEqual({ startMs: manilaMidnight("2026-09-18"), endMs: manilaMidnight("2026-09-25") });
    expect(period.previous?.startMs).toBe(manilaMidnight("2026-09-11"));
    expect(period.comparisonLabel).toBe("the 7 days before");
  });

  it("covers 30 whole days", () => {
    const period = resolvePerformancePeriod("30d", NOW);

    expect(period.window.startMs).toBe(manilaMidnight("2026-08-26"));
    expect(period.dayCount).toBe(30);
  });
});

describe("isPerformancePeriod", () => {
  it("accepts only the offered keys, so a stale route param falls back", () => {
    for (const period of PERFORMANCE_PERIODS) expect(isPerformancePeriod(period.key)).toBe(true);
    expect(isPerformancePeriod("90d")).toBe(false);
    expect(isPerformancePeriod(undefined)).toBe(false);
  });
});
