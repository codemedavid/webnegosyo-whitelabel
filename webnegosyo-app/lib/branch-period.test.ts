/**
 * The window the period selector means.
 *
 * "Last 7 days" has to mean seven whole Manila days ending with today, not
 * "168 hours ago until now". The difference is visible and wrong: a rolling
 * 168-hour window puts half of today and half of the day eight days ago into
 * the same series, so the first and last bars of every sparkline are permanently
 * short and the trend reads as a decline that is not happening.
 */

import { buildKpiPeriod, PERIOD_CHOICES } from "./branch-period";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 2026-07-25 14:30 Manila. */
const NOW = Date.parse("2026-07-25T06:30:00.000Z");
/** 2026-07-25 00:00 Manila. */
const TODAY_START = Date.parse("2026-07-24T16:00:00.000Z");

describe("buildKpiPeriod", () => {
  it("ends at the last instant of today, Manila time", () => {
    const period = buildKpiPeriod(7, NOW);

    expect(period.endMs).toBe(TODAY_START + DAY_MS - 1);
  });

  it("starts at midnight of the first day, so the window is whole days", () => {
    const period = buildKpiPeriod(7, NOW);

    expect(period.startMs).toBe(TODAY_START - 6 * DAY_MS);
    expect(period.endMs - period.startMs + 1).toBe(7 * DAY_MS);
  });

  it("reports the day count it was asked for", () => {
    expect(buildKpiPeriod(30, NOW).days).toBe(30);
  });

  it("still includes today when it is barely past Manila midnight", () => {
    const justAfterMidnight = TODAY_START + 60 * 1000;

    const period = buildKpiPeriod(7, justAfterMidnight);

    expect(period.endMs).toBe(TODAY_START + DAY_MS - 1);
    expect(period.startMs).toBe(TODAY_START - 6 * DAY_MS);
  });

  it("treats a single day as today alone", () => {
    const period = buildKpiPeriod(1, NOW);

    expect(period.startMs).toBe(TODAY_START);
    expect(period.endMs).toBe(TODAY_START + DAY_MS - 1);
  });

  it("never produces an inverted or empty window", () => {
    for (const days of [0, -5]) {
      const period = buildKpiPeriod(days, NOW);
      expect(period.endMs).toBeGreaterThan(period.startMs);
      expect(period.days).toBeGreaterThan(0);
    }
  });

  it("offers periods long enough to see a trend but short enough to act on", () => {
    expect(PERIOD_CHOICES.map((choice) => choice.days)).toEqual([7, 30, 90]);
    for (const choice of PERIOD_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0);
    }
  });
});
