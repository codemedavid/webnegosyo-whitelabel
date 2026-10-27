/**
 * Branches, Portfolio and the staff leaderboard on a 4 AM business day.
 * The existing `branch-period.test.ts` / `branch-kpis.test.ts` pin that no
 * schedule is the old Manila-midnight behaviour (and the same period shape).
 */
import { buildKpiPeriod, kpiFetchWindow } from "../branch-period";
import { buildBranchKpis } from "../branch-kpis";
import type { CutoffSchedule } from "./trading-day";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FOUR_AM: CutoffSchedule = [{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }];
const manila = (local: string): number => Date.parse(`${local}+08:00`);

/** Sat Oct 25, 1:30 AM Manila: still Friday's trade on a 4 AM store. */
const LATE_NIGHT = manila("2026-10-25T01:30:00.000");

describe("buildKpiPeriod on a 4 AM day", () => {
  it("covers whole business days ending with today's (Friday's, at 1:30 AM Saturday)", () => {
    const period = buildKpiPeriod(7, LATE_NIGHT, FOUR_AM);
    expect(period.startMs).toBe(manila("2026-10-18T04:00:00.000"));
    expect(period.endMs).toBe(manila("2026-10-25T04:00:00.000") - 1);
    expect(period.days).toBe(7);
  });

  it("keeps the old shape (no schedule field) with no cutoff", () => {
    expect(buildKpiPeriod(7, LATE_NIGHT)).toEqual({
      startMs: manila("2026-10-19T00:00:00.000"),
      endMs: manila("2026-10-26T00:00:00.000") - 1,
      days: 7,
    });
    expect(buildKpiPeriod(7, LATE_NIGHT, [])).toEqual(buildKpiPeriod(7, LATE_NIGHT));
  });

  it("does not assume 24-hour days on the day the cutoff changes", () => {
    const change: CutoffSchedule = [{ effectiveFrom: "2026-10-25", cutoffMinutes: 240 }];
    const period = buildKpiPeriod(2, manila("2026-10-25T12:00:00.000"), change);
    expect(period.startMs).toBe(manila("2026-10-24T00:00:00.000"));
    expect(period.endMs).toBe(manila("2026-10-26T04:00:00.000") - 1);
    expect(kpiFetchWindow(period).endMs).toBe(manila("2026-10-26T04:00:00.000"));
  });
});

describe("buildBranchKpis on a 4 AM day", () => {
  const outlets = [{ id: "o1", name: "North" }];
  const sale = (at: number, total: number) => ({ _id: String(at), _creationTime: at, total, status: "delivered", outletId: "o1" });

  it("puts a 1:30 AM sale on the night before's bar", () => {
    const period = buildKpiPeriod(2, LATE_NIGHT, FOUR_AM);
    const [row] = buildBranchKpis(
      [sale(manila("2026-10-24T20:00:00.000"), 100), sale(LATE_NIGHT, 50)],
      outlets,
      period,
    );
    // Thursday, Friday (Friday includes the 1:30 AM Saturday sale).
    expect(row.dailyRevenue).toEqual([0, 150]);
    expect(row.revenue).toBe(150);
  });

  it("is the Manila calendar split with no cutoff", () => {
    const period = buildKpiPeriod(2, LATE_NIGHT);
    const [row] = buildBranchKpis([sale(manila("2026-10-24T20:00:00.000"), 100), sale(LATE_NIGHT, 50)], outlets, period);
    expect(row.dailyRevenue).toEqual([100, 50]);
  });

  it("measures the previous window by the same business days", () => {
    const period = buildKpiPeriod(1, LATE_NIGHT, FOUR_AM);
    const [row] = buildBranchKpis([sale(manila("2026-10-24T02:00:00.000"), 70)], outlets, period);
    // Fri 2 AM is Thursday's business day: the previous period's money.
    expect(row.previousRevenue).toBe(70);
    expect(row.revenue).toBe(0);
    expect(period.endMs - period.startMs + 1).toBe(DAY_MS);
  });
});
