/**
 * The app's Profit windows and trend bars on a 4 AM business day, matching
 * the profit SQL since 20261027180000 (facts dated by business_day_of).
 * `lib/profit/profit-period.test.ts` pins that no schedule is the old
 * Manila-midnight window, field for field.
 */
import {
  bucketKeys,
  checkCustomRange,
  previousFullWindow,
  resolveProfitWindow,
  trendPlan,
} from "../profit/profit-period";
import { lastReadDay } from "../profit/profit-links";
import type { CutoffSchedule } from "./trading-day";

const FOUR_AM: CutoffSchedule = [{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }];
const manila = (local: string): number => Date.parse(`${local}+08:00`);

/** Sat Nov 1, 1:30 AM Manila: still Friday Oct 31's trade on a 4 AM store. */
const LATE_NIGHT = manila("2026-11-01T01:30:00.000");

describe("Profit windows on a 4 AM day", () => {
  it("keeps 'This month' on October until the 4 AM cutoff, opening at 4 AM on the 1st", () => {
    const w = resolveProfitWindow({ preset: "this_month" }, LATE_NIGHT, FOUR_AM);
    expect(w.fromKey).toBe("2026-10-01");
    expect(w.start).toBe(manila("2026-10-01T04:00:00.000"));
    expect(w.fullEnd).toBe(manila("2026-11-01T04:00:00.000"));
    expect(w.end).toBe(LATE_NIGHT);
    expect(lastReadDay(w)).toBe("2026-10-31");
  });

  it("is the old window, with no schedule field, without a cutoff", () => {
    const plain = resolveProfitWindow({ preset: "this_month" }, LATE_NIGHT);
    expect(plain.fromKey).toBe("2026-11-01");
    expect(plain.start).toBe(manila("2026-11-01T00:00:00.000"));
    expect(plain).not.toHaveProperty("schedule");
    expect(resolveProfitWindow({ preset: "this_month" }, LATE_NIGHT, [])).toEqual(plain);
  });

  it("compares a month with the previous one at its own business-day start", () => {
    const w = resolveProfitWindow({ preset: "this_month" }, LATE_NIGHT, FOUR_AM);
    expect(previousFullWindow(w)).toEqual({ start: manila("2026-09-01T04:00:00.000"), end: w.start });
  });

  it("refuses tomorrow's business day as not started yet", () => {
    expect(checkCustomRange("2026-11-01", "2026-11-01", LATE_NIGHT, FOUR_AM).ok).toBe(false);
    expect(checkCustomRange("2026-10-31", "2026-10-31", LATE_NIGHT, FOUR_AM).ok).toBe(true);
  });

  it("draws the trend bars on business days, through the day still running", () => {
    const w = resolveProfitWindow({ preset: "custom", fromKey: "2026-10-29", toKey: "2026-10-31" }, LATE_NIGHT, FOUR_AM);
    expect(bucketKeys(w, "day")).toEqual(["2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(trendPlan(w).start).toBe(manila("2026-10-29T04:00:00.000"));
    const weeks = trendPlan(resolveProfitWindow({ preset: "this_week" }, LATE_NIGHT, FOUR_AM));
    expect(weeks.start).toBe(manila("2026-09-21T04:00:00.000"));
  });
});
