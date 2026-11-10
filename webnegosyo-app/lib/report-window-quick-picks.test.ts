import {
  describeSelection,
  isSameSelection,
  lastNDaysSelection,
  resolveReportWindow,
  thisMonthSelection,
  todaySelection,
  yesterdaySelection,
} from "./report-window";
import type { CutoffSchedule } from "./business-day/trading-day";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Epoch ms of Manila wall-clock `iso` ("2026-11-04T23:59"). */
function manila(iso: string): number {
  return Date.parse(`${iso}:00.000Z`) - MANILA_OFFSET_MS;
}

/** A store whose business day starts at 4:00 AM (240 minutes after midnight). */
const FOUR_AM: CutoffSchedule = [{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }];

describe("quick picks around Manila midnight", () => {
  it("names today's Manila day one minute before midnight", () => {
    // Arrange: 23:59 Wed 4 Nov in Manila is already Wed 15:59 UTC.
    const nowMs = manila("2026-11-04T23:59");

    // Act
    const today = todaySelection(nowMs);

    // Assert
    expect(today).toEqual({ kind: "day", dayKey: "2026-11-04" });
    expect(describeSelection(today, nowMs)).toBe("Today");
  });

  it("moves to the next day at Manila midnight, not UTC midnight", () => {
    const nowMs = manila("2026-11-05T00:00");

    expect(todaySelection(nowMs)).toEqual({ kind: "day", dayKey: "2026-11-05" });
    expect(yesterdaySelection(nowMs)).toEqual({ kind: "day", dayKey: "2026-11-04" });
    expect(describeSelection(yesterdaySelection(nowMs), nowMs)).toBe("Yesterday");
  });

  it("covers seven business days counting today", () => {
    const nowMs = manila("2026-11-04T10:00");

    const selection = lastNDaysSelection(7, nowMs);
    const window = resolveReportWindow(selection, nowMs);

    expect(selection).toEqual({ kind: "range", fromKey: "2026-10-29", toKey: "2026-11-04" });
    expect(window.startMs).toBe(manila("2026-10-29T00:00"));
    expect(window.endMs).toBe(manila("2026-11-05T00:00"));
  });

  it("runs this month from the 1st to today", () => {
    const nowMs = manila("2026-11-04T10:00");

    expect(thisMonthSelection(nowMs)).toEqual({ kind: "range", fromKey: "2026-11-01", toKey: "2026-11-04" });
  });

  it("is a single day on the 1st of the month", () => {
    const nowMs = manila("2026-12-01T08:00");

    const month = thisMonthSelection(nowMs);

    expect(isSameSelection(month, todaySelection(nowMs))).toBe(true);
  });

  it("crosses a year back for yesterday on Jan 1", () => {
    const nowMs = manila("2027-01-01T00:30");

    expect(yesterdaySelection(nowMs)).toEqual({ kind: "day", dayKey: "2026-12-31" });
  });
});

describe("quick picks with a business-day cutoff", () => {
  it("keeps 2 AM on the previous business day for a 4 AM store", () => {
    // Arrange: 2:00 AM Thu 5 Nov is still Wednesday's trade.
    const nowMs = manila("2026-11-05T02:00");

    // Act
    const today = todaySelection(nowMs, FOUR_AM);
    const window = resolveReportWindow(today, nowMs, FOUR_AM);

    // Assert
    expect(today).toEqual({ kind: "day", dayKey: "2026-11-04" });
    expect(window.startMs).toBe(manila("2026-11-04T04:00"));
    expect(window.endMs).toBe(manila("2026-11-05T04:00"));
    expect(yesterdaySelection(nowMs, FOUR_AM)).toEqual({ kind: "day", dayKey: "2026-11-03" });
  });

  it("opens the new business day at the cutoff", () => {
    const nowMs = manila("2026-11-05T04:00");

    expect(todaySelection(nowMs, FOUR_AM)).toEqual({ kind: "day", dayKey: "2026-11-05" });
  });

  it("starts this month at the 1st's cutoff, and a 1st-before-cutoff still belongs to last month", () => {
    const earlyFirst = manila("2026-12-01T03:00");

    const month = thisMonthSelection(earlyFirst, FOUR_AM);

    expect(month).toEqual({ kind: "range", fromKey: "2026-11-01", toKey: "2026-11-30" });
    expect(resolveReportWindow(month, earlyFirst, FOUR_AM).startMs).toBe(manila("2026-11-01T04:00"));
  });

  it("last 7 days ends at the next cutoff", () => {
    const nowMs = manila("2026-11-05T02:00");

    const window = resolveReportWindow(lastNDaysSelection(7, nowMs, FOUR_AM), nowMs, FOUR_AM);

    expect(window.startMs).toBe(manila("2026-10-29T04:00"));
    expect(window.endMs - window.startMs).toBe(7 * 24 * HOUR_MS);
  });
});

describe("isSameSelection", () => {
  it("treats a one-day range as that day", () => {
    expect(isSameSelection({ kind: "range", fromKey: "2026-11-04", toKey: "2026-11-04" }, { kind: "day", dayKey: "2026-11-04" })).toBe(true);
  });

  it("tells different days and ranges apart", () => {
    expect(isSameSelection({ kind: "day", dayKey: "2026-11-03" }, { kind: "day", dayKey: "2026-11-04" })).toBe(false);
    expect(
      isSameSelection({ kind: "range", fromKey: "2026-11-01", toKey: "2026-11-04" }, { kind: "range", fromKey: "2026-11-02", toKey: "2026-11-04" }),
    ).toBe(false);
  });

  it("compares presets by their day count", () => {
    expect(isSameSelection({ kind: "preset", days: 7 }, { kind: "preset", days: 7 })).toBe(true);
    expect(isSameSelection({ kind: "preset", days: 1 }, { kind: "day", dayKey: "2026-11-04" })).toBe(false);
  });

  it("clamps a nonsense day count to one day", () => {
    const nowMs = manila("2026-11-04T10:00");

    expect(lastNDaysSelection(0, nowMs)).toEqual({ kind: "range", fromKey: "2026-11-04", toKey: "2026-11-04" });
  });
});
