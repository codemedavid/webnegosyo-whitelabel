/**
 * The one "which days?" state every report screen holds.
 *
 * Two defects this closes, both of which made the same day read differently
 * on different screens:
 *
 * - "Now" was pinned when a screen first mounted. Tab screens mount once and
 *   stay mounted, so a report opened last night still believed it was last
 *   night: "Yesterday" named the day before yesterday, and today was refused
 *   as a future day. The anchor here moves when the MANILA day changes — and
 *   only then, so the query arguments are not rebuilt (and re-fetched) every
 *   minute.
 * - Presets went out as `daysBack`, which every backend reads as now-minus-N×24h.
 *   A backend that can take a bounded window now gets the calendar days the
 *   label names (see `selectionToQueryArgs`).
 *
 * The day is the store's BUSINESS day (`useTradingDay`): with a 4 AM cutoff,
 * "Today" opens at 4:00 AM and the anchor moves at 4:00 AM. Until the schedule
 * loads, or if it cannot be read, it is the Manila calendar day; the screen can
 * say so through `isScheduleFallback`.
 */

import { useMemo, useState } from "react";

import { useTradingDay } from "./business-day/use-trading-day";
import type { CutoffSchedule } from "./business-day/trading-day";
import { useRefRoute } from "./hooks";
import {
  defaultSelection,
  describeSelection,
  selectionToQueryArgs,
  supportsBoundedWindow,
  type ReportQueryArgs,
  type ReportSelection,
} from "./report-window";
import { useAuthStore } from "../stores/auth-store";

/** Any report ref — they all route together, so one stands for the screen. */
const REPORT_ROUTE_REF = "analytics:getSalesAnalytics";

/**
 * An instant that stays fixed for the whole business day and moves once the
 * day changes (at the store's cutoff). State only updates on a new day key, so
 * the minute tick costs no render the rest of the time.
 */
export function useBusinessDayAnchor(): { todayKey: string; anchorMs: number } {
  const { todayKey, anchorMs } = useTradingDay();
  return useMemo(() => ({ todayKey, anchorMs }), [todayKey, anchorMs]);
}

export interface ReportWindowState {
  selection: ReportSelection;
  setSelection: (selection: ReportSelection) => void;
  /** The instant windows are resolved against; moves at the business-day cutoff. */
  nowMs: number;
  /** Spread into every query on the screen. */
  windowArgs: ReportQueryArgs;
  periodLabel: string;
  /** False on a Convex bundle too old for bounded windows. */
  canBound: boolean;
  /** The store's business-day schedule the windows were built on. */
  schedule: CutoffSchedule;
  /** True when the schedule could not be read and midnight stands in for it. */
  isScheduleFallback: boolean;
}

/** Whether this store's backend can answer a bounded report window. */
export function useCanBoundReports(): boolean {
  const route = useRefRoute(REPORT_ROUTE_REF);
  const convexSchemaVersion = useAuthStore((s) => s.convexSchemaVersion);
  return supportsBoundedWindow(route, convexSchemaVersion);
}

export function useReportWindow(defaultDays: number): ReportWindowState {
  const [selection, setSelection] = useState<ReportSelection>(() => defaultSelection(defaultDays));
  const { anchorMs, schedule, isFallback } = useTradingDay();
  const canBound = useCanBoundReports();

  const windowArgs = useMemo(
    () => selectionToQueryArgs(selection, anchorMs, canBound, schedule),
    [selection, anchorMs, canBound, schedule]
  );

  return {
    selection,
    setSelection,
    nowMs: anchorMs,
    windowArgs,
    periodLabel: describeSelection(selection, anchorMs, schedule),
    canBound,
    schedule,
    isScheduleFallback: isFallback,
  };
}
