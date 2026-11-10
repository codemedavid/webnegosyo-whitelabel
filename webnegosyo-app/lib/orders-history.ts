/**
 * The Orders tab as Order History: which days a merchant can pick in one tap,
 * what a picked period reads, and how it is named on a file. Pure.
 *
 * The live queue stays the tab's default; a quick pick turns the screen into
 * "the orders of these days". Every pick is a picked DAY (or range of days),
 * never a `daysBack` preset, so it means the store's business days on every
 * backend — see `selectionToQueryArgs` in report-window.ts.
 */

import { MIDNIGHT_SCHEDULE, type CutoffSchedule } from "./business-day/trading-day";
import {
  LEGACY_ORDER_PAGE,
  WINDOWED_ORDER_LIMIT,
  lastNDaysSelection,
  thisMonthSelection,
  todaySelection,
  yesterdaySelection,
  type ReportQuickPick,
  type ReportSelection,
  type ReportWindow,
} from "./report-window";

const LAST_WEEK_DAYS = 7;

export const ORDER_HISTORY_QUICK_PICK_LABELS = ["Today", "Yesterday", "Last 7 days", "This month"] as const;

/** Today · Yesterday · Last 7 days · This month, on the store's business day. */
export function orderHistoryQuickPicks(
  nowMs: number,
  schedule: CutoffSchedule = MIDNIGHT_SCHEDULE,
): ReportQuickPick[] {
  return [
    { key: "today", label: "Today", selection: todaySelection(nowMs, schedule) },
    { key: "yesterday", label: "Yesterday", selection: yesterdaySelection(nowMs, schedule) },
    { key: "last7", label: "Last 7 days", selection: lastNDaysSelection(LAST_WEEK_DAYS, nowMs, schedule) },
    { key: "month", label: "This month", selection: thisMonthSelection(nowMs, schedule) },
  ];
}

export interface DatedOrdersArgs {
  startMs: number;
  endMs: number;
  limit: number;
}

/**
 * `orders:getOrders` arguments for a picked period.
 *
 * The window always travels — the screen has shown picked days that way since
 * the calendar shipped, and an older Convex bundle already says "needs an
 * update" for it. Where the backend can bound a read, it gets the windowed
 * cap (the platform pages to it); an older one keeps its 2,000 page.
 */
export function datedOrdersArgs(window: ReportWindow, canBound: boolean): DatedOrdersArgs {
  return {
    startMs: window.startMs,
    endMs: window.endMs,
    limit: canBound ? WINDOWED_ORDER_LIMIT : LEGACY_ORDER_PAGE,
  };
}

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Said above the list when the read came back FULL: the newest `limit`
 * orders are shown and older ones in the period are not. Null otherwise.
 */
export function orderHistoryCapNotice(fetchedCount: number | undefined, limit: number): string | null {
  if (fetchedCount === undefined || fetchedCount < limit) return null;
  return `Showing the first ${groupThousands(limit)} orders (newest first). Pick fewer days to see the rest.`;
}

/**
 * "orders_2026-10-29_2026-11-04.csv" from the picked business days. Named from
 * the days, not the window's instants: a 4 AM store's Nov 4 ends at 3:59 AM on
 * the 5th and is still Nov 4. Null for a preset (the export names its own).
 */
export function orderHistoryExportFileName(selection: ReportSelection): string | null {
  if (selection.kind === "preset") return null;
  const [fromKey, toKey] = selection.kind === "day" ? [selection.dayKey, selection.dayKey] : [selection.fromKey, selection.toKey];
  return fromKey === toKey ? `orders_${fromKey}.csv` : `orders_${fromKey}_${toKey}.csv`;
}
