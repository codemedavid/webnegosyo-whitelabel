/**
 * The four periods product performance offers, as Manila calendar windows.
 *
 * Four, not a calendar: the question a merchant brings to this screen is
 * "how did it go today / yesterday / this week / this month?". Each period is
 * compared against the one of equal length right before it.
 */

import { previousBusinessDayKey, toBusinessDayKey } from "../daily-report/business-day";
import { previousReportWindow, resolveReportWindow, type ReportWindow } from "../report-window";

export type PerformancePeriodKey = "today" | "yesterday" | "7d" | "30d";

export const PERFORMANCE_PERIODS: readonly { key: PerformancePeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

export const DEFAULT_PERFORMANCE_PERIOD: PerformancePeriodKey = "7d";

export interface ResolvedPerformancePeriod {
  key: PerformancePeriodKey;
  label: string;
  window: ReportWindow;
  previous: ReportWindow;
  /** "vs yesterday", "vs the 7 days before". */
  comparisonLabel: string;
  dayCount: number;
}

export function isPerformancePeriod(value: unknown): value is PerformancePeriodKey {
  return PERFORMANCE_PERIODS.some((period) => period.key === value);
}

function windowOf(key: PerformancePeriodKey, nowMs: number): ReportWindow {
  if (key === "yesterday") {
    const todayKey = toBusinessDayKey(new Date(nowMs).toISOString());
    return resolveReportWindow({ kind: "day", dayKey: previousBusinessDayKey(todayKey) }, nowMs);
  }
  const days = key === "today" ? 1 : key === "7d" ? 7 : 30;
  return resolveReportWindow({ kind: "preset", days }, nowMs);
}

const COMPARISON_LABELS: Record<PerformancePeriodKey, string> = {
  today: "yesterday",
  yesterday: "the day before",
  "7d": "the 7 days before",
  "30d": "the 30 days before",
};

export function resolvePerformancePeriod(key: PerformancePeriodKey, nowMs: number): ResolvedPerformancePeriod {
  const window = windowOf(key, nowMs);
  const label = PERFORMANCE_PERIODS.find((period) => period.key === key)?.label ?? key;
  return {
    key,
    label,
    window,
    previous: previousReportWindow(window),
    comparisonLabel: COMPARISON_LABELS[key],
    dayCount: Math.round((window.endMs - window.startMs) / (24 * 60 * 60 * 1000)),
  };
}
