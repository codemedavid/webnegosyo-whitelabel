/**
 * The window the period selector means.
 *
 * Whole Manila days, always ending with today — never a rolling "N × 24 hours
 * ago until now". A rolling window splits today and the day at the far end
 * across bucket boundaries, so the first and last bars of every sparkline are
 * permanently short and every branch appears to be sliding.
 *
 * Pure, and takes `now` as an argument so the boundaries are testable rather
 * than dependent on when the suite happens to run.
 */

import type { KpiPeriod } from "./branch-kpis";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Philippine Standard Time. No DST, so a fixed offset is exact. */
const MANILA_OFFSET_MS = 8 * HOUR_MS;

export interface PeriodChoice {
  days: number;
  label: string;
}

/**
 * The windows offered on screen.
 *
 * Three, not six. A week is the operating cadence an owner can actually act
 * within; a month is long enough for a trend to mean something; a quarter is
 * where a seasonal pattern shows up. More choices than that turn a decision
 * into a menu.
 */
export const PERIOD_CHOICES: readonly PeriodChoice[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

/** Midnight Manila at the start of the day containing `timestampMs`. */
function manilaDayStart(timestampMs: number): number {
  return Math.floor((timestampMs + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS - MANILA_OFFSET_MS;
}

/**
 * The `days`-long window of whole Manila days ending with today.
 *
 * A non-positive day count is clamped to one day rather than producing an
 * inverted window: a screen bug must not become a query for the future.
 */
export function buildKpiPeriod(days: number, nowMs: number): KpiPeriod {
  const safeDays = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 1;
  const todayStart = manilaDayStart(nowMs);

  return {
    startMs: todayStart - (safeDays - 1) * DAY_MS,
    endMs: todayStart + DAY_MS - 1,
    days: safeDays,
  };
}
