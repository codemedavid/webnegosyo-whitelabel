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
 */

import { useEffect, useMemo, useState } from "react";

import { toBusinessDayKey } from "./daily-report/business-day";
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

const DAY_CHECK_INTERVAL_MS = 60_000;

/** Any report ref — they all route together, so one stands for the screen. */
const REPORT_ROUTE_REF = "analytics:getSalesAnalytics";

function businessDayOf(atMs: number): string {
  return toBusinessDayKey(new Date(atMs).toISOString());
}

/**
 * An instant that stays fixed for the whole Manila day and moves once the day
 * changes. State only updates on a new day key, so the minute tick costs no
 * render the rest of the time.
 */
export function useBusinessDayAnchor(): { todayKey: string; anchorMs: number } {
  const [anchor, setAnchor] = useState(() => {
    const nowMs = Date.now();
    return { todayKey: businessDayOf(nowMs), anchorMs: nowMs };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const nowMs = Date.now();
      const todayKey = businessDayOf(nowMs);
      setAnchor((current) => (current.todayKey === todayKey ? current : { todayKey, anchorMs: nowMs }));
    }, DAY_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return anchor;
}

export interface ReportWindowState {
  selection: ReportSelection;
  setSelection: (selection: ReportSelection) => void;
  /** The instant windows are resolved against; moves at Manila midnight. */
  nowMs: number;
  /** Spread into every query on the screen. */
  windowArgs: ReportQueryArgs;
  periodLabel: string;
  /** False on a Convex bundle too old for bounded windows. */
  canBound: boolean;
}

/** Whether this store's backend can answer a bounded report window. */
export function useCanBoundReports(): boolean {
  const route = useRefRoute(REPORT_ROUTE_REF);
  const convexSchemaVersion = useAuthStore((s) => s.convexSchemaVersion);
  return supportsBoundedWindow(route, convexSchemaVersion);
}

export function useReportWindow(defaultDays: number): ReportWindowState {
  const [selection, setSelection] = useState<ReportSelection>(() => defaultSelection(defaultDays));
  const { anchorMs } = useBusinessDayAnchor();
  const canBound = useCanBoundReports();

  const windowArgs = useMemo(
    () => selectionToQueryArgs(selection, anchorMs, canBound),
    [selection, anchorMs, canBound]
  );

  return {
    selection,
    setSelection,
    nowMs: anchorMs,
    windowArgs,
    periodLabel: describeSelection(selection, anchorMs),
    canBound,
  };
}
