/**
 * The two windows Home reads — today and yesterday — and the change between
 * them. Pure, so the arithmetic that puts a green or red pill on the takings
 * card can be tested without a clock or a backend.
 *
 * MANILA calendar days, the same `business-day` rule every report, the daily
 * order number and the server's own "today" use. This used to read the
 * phone's timezone, so on a phone not set to Manila the takings card compared
 * against a different "yesterday" than the Analytics screen showed.
 *
 * With a business-day schedule (`useTradingDay().schedule`), "today" is the
 * store's business day: a 4 AM store's Friday runs Fri 4:00 AM – Sat 3:59 AM.
 * Without one it is the Manila calendar day, exactly as before. Both backends'
 * `getDashboardStatsByPeriod` take any inclusive range, so this works on every
 * Convex bundle.
 */

import { previousBusinessDayKey } from "./daily-report/business-day";
import { MIDNIGHT_SCHEDULE, tradingDayOf, tradingDayWindow, type CutoffSchedule } from "./business-day/trading-day";

export interface DateRange {
  startDate: number;
  /** INCLUSIVE — `getDashboardStatsByPeriod` filters `<=` on both backends. */
  endDate: number;
}

function dayRange(dayKey: string, schedule: CutoffSchedule): DateRange {
  const window = tradingDayWindow(dayKey, schedule);
  return { startDate: Date.parse(window.startIso), endDate: Date.parse(window.endIso) - 1 };
}

export function todayRange(nowMs: number, schedule: CutoffSchedule = MIDNIGHT_SCHEDULE): DateRange {
  return dayRange(tradingDayOf(new Date(nowMs).toISOString(), schedule), schedule);
}

export function yesterdayRange(nowMs: number, schedule: CutoffSchedule = MIDNIGHT_SCHEDULE): DateRange {
  return dayRange(previousBusinessDayKey(tradingDayOf(new Date(nowMs).toISOString(), schedule)), schedule);
}

/**
 * Change from `previous` to `current` as a fraction (0.12 = up 12%).
 *
 * `null` when there is nothing to compare against — yesterday not loaded yet,
 * or a zero day, which would otherwise read as infinite growth.
 */
export function revenueDelta(
  current: number | undefined,
  previous: number | undefined,
): number | null {
  if (current === undefined || previous === undefined) return null;
  if (previous <= 0) return null;
  return (current - previous) / previous;
}
