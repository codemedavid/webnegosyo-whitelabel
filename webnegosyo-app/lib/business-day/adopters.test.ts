/**
 * The app's day-based screens on a 4 AM business day.
 *
 * Each adopter takes an optional schedule; the existing suites
 * (`report-window`, `home-period`, `drawer-day`, `supabase-orders`) pin that
 * passing nothing is the old Manila-midnight behaviour. These pin what a
 * 4 AM store sees, and that midnight is still what an empty schedule gives.
 */
import { drawerDayWindow } from "../drawer-day";
import { todayRange, yesterdayRange } from "../home-period";
import {
  clampSelection,
  describeSelection,
  rangeDayCount,
  resolveReportWindow,
  selectionToQueryArgs,
} from "../report-window";
import { localDayStartMs } from "../backends/supabase-orders";
import { computeTrends, type AnalyticsOrder } from "../backends/analytics-compute";
import { beginDraft, tapDay } from "../report-range-picker";
import { resolvePerformancePeriod } from "../product-performance/period";
import { cachedCutoffSchedule } from "./cached-schedule";
import { cutoffScheduleKey } from "./schedule-key";
import { MIDNIGHT_SCHEDULE, type CutoffSchedule } from "./trading-day";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FOUR_AM: CutoffSchedule = [{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }];
const manila = (local: string): number => Date.parse(`${local}+08:00`);

/** Sat Oct 25, 1:30 AM Manila: still Friday's trade on a 4 AM store. */
const LATE_NIGHT = manila("2026-10-25T01:30:00.000");

describe("report-window on a 4 AM day", () => {
  it("opens a picked day at 4:00 AM and closes it at the next 4:00 AM", () => {
    expect(resolveReportWindow({ kind: "day", dayKey: "2026-10-24" }, LATE_NIGHT, FOUR_AM)).toEqual({
      startMs: manila("2026-10-24T04:00:00.000"),
      endMs: manila("2026-10-25T04:00:00.000"),
    });
  });

  it("ends a preset at the end of TODAY's business day, which is still Friday at 1:30 AM", () => {
    expect(resolveReportWindow({ kind: "preset", days: 7 }, LATE_NIGHT, FOUR_AM)).toEqual({
      startMs: manila("2026-10-18T04:00:00.000"),
      endMs: manila("2026-10-25T04:00:00.000"),
    });
  });

  it("calls Friday 'Today' at 1:30 AM Saturday", () => {
    expect(describeSelection({ kind: "day", dayKey: "2026-10-24" }, LATE_NIGHT, FOUR_AM)).toBe("Today");
    expect(describeSelection({ kind: "day", dayKey: "2026-10-24" }, LATE_NIGHT, MIDNIGHT_SCHEDULE)).toBe("Yesterday");
  });

  it("refuses Saturday as a future day until 4:00 AM", () => {
    expect(clampSelection({ kind: "day", dayKey: "2026-10-25" }, LATE_NIGHT, FOUR_AM)).toEqual({
      kind: "day",
      dayKey: "2026-10-24",
    });
  });

  it("does not assume 24-hour days on the day the cutoff changes", () => {
    const change: CutoffSchedule = [{ effectiveFrom: "2026-10-25", cutoffMinutes: 240 }];
    const window = resolveReportWindow({ kind: "day", dayKey: "2026-10-24" }, manila("2026-10-27T12:00:00.000"), change);
    expect(window.endMs - window.startMs).toBe(28 * HOUR_MS);
    expect(rangeDayCount({ kind: "range", fromKey: "2026-10-20", toKey: "2026-10-26" })).toBe(7);
  });

  it("keeps sending daysBack to a backend that cannot bound a window", () => {
    expect(selectionToQueryArgs({ kind: "preset", days: 7 }, LATE_NIGHT, false, FOUR_AM)).toEqual({ daysBack: 7 });
  });

  it("is unchanged with no schedule", () => {
    expect(resolveReportWindow({ kind: "preset", days: 7 }, LATE_NIGHT)).toEqual({
      startMs: manila("2026-10-26T00:00:00.000") - 7 * DAY_MS,
      endMs: manila("2026-10-26T00:00:00.000"),
    });
  });
});

describe("home-period on a 4 AM day", () => {
  it("compares Friday so far with Thursday", () => {
    expect(todayRange(LATE_NIGHT, FOUR_AM)).toEqual({
      startDate: manila("2026-10-24T04:00:00.000"),
      endDate: manila("2026-10-25T04:00:00.000") - 1,
    });
    expect(yesterdayRange(LATE_NIGHT, FOUR_AM)).toEqual({
      startDate: manila("2026-10-23T04:00:00.000"),
      endDate: manila("2026-10-24T04:00:00.000") - 1,
    });
  });

  it("is the Manila calendar day with no schedule", () => {
    expect(todayRange(LATE_NIGHT)).toEqual({
      startDate: manila("2026-10-25T00:00:00.000"),
      endDate: manila("2026-10-26T00:00:00.000") - 1,
    });
  });
});

describe("drawerDayWindow", () => {
  it("keeps the 1 AM sales in tonight's drawer on a 4 AM store", () => {
    expect(drawerDayWindow(LATE_NIGHT, FOUR_AM)).toEqual({
      sinceMs: manila("2026-10-24T04:00:00.000"),
      untilMs: manila("2026-10-25T04:00:00.000"),
    });
  });

  it("starts at Manila midnight with no schedule, as the Drawer always has", () => {
    expect(drawerDayWindow(LATE_NIGHT)).toEqual({
      sinceMs: localDayStartMs(LATE_NIGHT),
      untilMs: localDayStartMs(LATE_NIGHT) + DAY_MS,
    });
  });
});

describe("localDayStartMs with a schedule", () => {
  it("opens the business day at the cutoff", () => {
    expect(localDayStartMs(LATE_NIGHT, undefined, FOUR_AM)).toBe(manila("2026-10-24T04:00:00.000"));
  });

  it("is the old midnight formula with an empty schedule", () => {
    expect(localDayStartMs(LATE_NIGHT, undefined, MIDNIGHT_SCHEDULE)).toBe(manila("2026-10-25T00:00:00.000"));
  });
});

describe("cachedCutoffSchedule (adapter reads outside React)", () => {
  const cacheOf = (entries: Record<string, unknown>) => ({
    getQueryData: (key: readonly unknown[]) => entries[JSON.stringify(key)],
  });

  it("reads the schedule useTradingDay put in the cache", () => {
    const cache = cacheOf({ [JSON.stringify(cutoffScheduleKey("t1"))]: FOUR_AM });
    expect(cachedCutoffSchedule("t1", cache)).toEqual(FOUR_AM);
  });

  it("answers midnight before the schedule is loaded, for no store, or for a copy it cannot trust", () => {
    expect(cachedCutoffSchedule("t1", cacheOf({}))).toEqual([]);
    expect(cachedCutoffSchedule(null, cacheOf({}))).toEqual([]);
    const bad = cacheOf({ [JSON.stringify(cutoffScheduleKey("t1"))]: [{ effectiveFrom: "x", cutoffMinutes: 1 }] });
    expect(cachedCutoffSchedule("t1", bad)).toEqual([]);
  });
});

describe("computeTrends on a 4 AM day", () => {
  const order = (createdAtMs: number): AnalyticsOrder => ({
    id: String(createdAtMs),
    createdAtMs,
    status: "delivered",
    total: 100,
    customerName: "",
    customerContact: "",
    customerData: null,
  });

  it("puts a 1:30 AM sale on the night before", () => {
    expect(computeTrends([order(LATE_NIGHT)], FOUR_AM).map((row) => row.date)).toEqual(["2026-10-24"]);
    expect(computeTrends([order(LATE_NIGHT)]).map((row) => row.date)).toEqual(["2026-10-25"]);
  });
});

describe("report range picker on a 4 AM day", () => {
  it("does not let Saturday be picked before Saturday's business day starts", () => {
    const draft = beginDraft({ kind: "preset", days: 7 }, LATE_NIGHT, FOUR_AM);
    expect(tapDay(draft, "2026-10-25", LATE_NIGHT, FOUR_AM)).toBe(draft);
    expect(tapDay(draft, "2026-10-24", LATE_NIGHT, FOUR_AM)).toEqual({
      mode: "day",
      fromKey: "2026-10-24",
      toKey: "2026-10-24",
    });
    expect(tapDay(draft, "2026-10-25", LATE_NIGHT)).not.toBe(draft);
  });
});

describe("product performance periods on a 4 AM day", () => {
  it("reads 'Yesterday' at 1:30 AM Saturday as Thursday 4 AM to Friday 4 AM", () => {
    expect(resolvePerformancePeriod("yesterday", LATE_NIGHT, FOUR_AM).window).toEqual({
      startMs: manila("2026-10-23T04:00:00.000"),
      endMs: manila("2026-10-24T04:00:00.000"),
    });
  });
});
