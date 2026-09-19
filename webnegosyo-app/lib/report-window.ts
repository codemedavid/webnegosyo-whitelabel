/**
 * The one vocabulary every report uses to say WHICH DAYS it is about.
 *
 * Reports used to speak only in `daysBack`: a window that always ends at this
 * instant. That answers "how is the last week going?" and nothing else — a
 * merchant could not ask how the 3rd went, or how the first fortnight of the
 * month compared with the second, because there was no way to say it.
 *
 * A selection here is what the merchant PICKED (a preset, a day, or a range);
 * a window is the pair of instants that picking implies. Keeping the two apart
 * is what lets the same choice drive a label, a query, and a CSV file name
 * without each of them re-deriving the dates and disagreeing at the edges.
 *
 * Day boundaries are NOT redefined here. They come from
 * `daily-report/business-day.ts`, so this module, the daily inventory report
 * and `assign_daily_order_number` in Postgres all agree on where a merchant's
 * day starts. A fifth implementation of "what is a day" is exactly how the
 * takings and the stock end up describing slightly different Tuesdays.
 */

import {
  nextBusinessDayKey,
  resolveBusinessDayWindow,
  toBusinessDayKey,
} from "./daily-report/business-day";

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * The widest span a report may ask for.
 *
 * Not a taste limit: both backends cap a read at 10 000 rows, so past roughly
 * a year a busy store's window comes back truncated and the figure reads short
 * while still looking authoritative. Refusing the span is honest; showing two
 * thirds of a year and calling it a year is not.
 */
export const MAX_RANGE_DAYS = 366;

/** What the merchant picked. `dayKey`s are "YYYY-MM-DD" local (Manila) days. */
export type ReportSelection =
  | { kind: "preset"; days: number }
  | { kind: "day"; dayKey: string }
  /** Inclusive of BOTH ends, the way a person reads "Sep 1 to Sep 14". */
  | { kind: "range"; fromKey: string; toKey: string };

/** Half-open `[startMs, endMs)`, so consecutive windows tile without overlap. */
export interface ReportWindow {
  startMs: number;
  endMs: number;
}

/**
 * What a screen puts on the wire.
 *
 * A union rather than one optional-everything shape, because which arm is sent
 * is a load-bearing decision — see `selectionToQueryArgs`.
 */
export type ReportQueryArgs = { daysBack: number } | { startMs: number; endMs: number };

/** Epoch ms of the Manila midnight that opens `dayKey`. Throws on a bad key. */
function dayStartMs(dayKey: string): number {
  return Date.parse(resolveBusinessDayWindow(dayKey).startIso);
}

function isRealDayKey(value: string): boolean {
  try {
    resolveBusinessDayWindow(value);
    return true;
  } catch {
    return false;
  }
}

function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 1;
  return Math.min(Math.max(Math.round(days), 1), MAX_RANGE_DAYS);
}

/** How many days `from`..`to` spans, counting both ends. */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((dayStartMs(toKey) - dayStartMs(fromKey)) / DAY_MS) + 1;
}

/** The day `count - 1` days after `fromKey`. */
function dayKeyAfter(fromKey: string, count: number): string {
  let key = fromKey;
  for (let i = 1; i < count; i += 1) key = nextBusinessDayKey(key);
  return key;
}

/** The instants a selection covers. Throws if a day key is not a real date. */
export function resolveReportWindow(selection: ReportSelection, nowMs: number): ReportWindow {
  const todayKey = toBusinessDayKey(new Date(nowMs).toISOString());

  if (selection.kind === "day") {
    const startMs = dayStartMs(selection.dayKey);
    return { startMs, endMs: startMs + DAY_MS };
  }

  if (selection.kind === "range") {
    return {
      startMs: dayStartMs(selection.fromKey),
      // The day AFTER the last one, because the window is half-open: a merchant
      // who asks for Sep 1–14 means the 14th's trade counts.
      endMs: dayStartMs(nextBusinessDayKey(selection.toKey)),
    };
  }

  // A preset ends at the end of the local today, so a sale rung up an hour ago
  // is in the window, and covers `days` CALENDAR days counting today.
  const endMs = dayStartMs(nextBusinessDayKey(todayKey));
  return { startMs: endMs - clampDays(selection.days) * DAY_MS, endMs };
}

/**
 * A selection made safe to act on.
 *
 * Selections arrive from taps and from persisted state, so they can be stale,
 * reversed, or nonsense. A report is a read: bad input is a reason to show a
 * sensible day, not to fail the screen.
 */
export function clampSelection(selection: ReportSelection, nowMs: number): ReportSelection {
  const todayKey = toBusinessDayKey(new Date(nowMs).toISOString());

  if (selection.kind === "preset") {
    return { kind: "preset", days: clampDays(selection.days) };
  }

  if (selection.kind === "day") {
    if (!isRealDayKey(selection.dayKey)) return { kind: "day", dayKey: todayKey };
    // A future day would render empty, which is indistinguishable from a day
    // whose data went missing.
    return { kind: "day", dayKey: selection.dayKey > todayKey ? todayKey : selection.dayKey };
  }

  const from = isRealDayKey(selection.fromKey) ? selection.fromKey : todayKey;
  const to = isRealDayKey(selection.toKey) ? selection.toKey : todayKey;

  // Tapping the later day first is the normal way to use a calendar.
  let fromKey = from <= to ? from : to;
  let toKey = from <= to ? to : from;

  if (toKey > todayKey) toKey = todayKey;
  if (fromKey > toKey) fromKey = toKey;

  // Trim from the START: the recent end of a too-wide range is the half a
  // merchant is actually looking at.
  if (daysBetween(fromKey, toKey) > MAX_RANGE_DAYS) {
    fromKey = dayKeyAfter(fromKey, daysBetween(fromKey, toKey) - MAX_RANGE_DAYS + 1);
  }

  return { kind: "range", fromKey, toKey };
}

/**
 * The arguments a query carries for this selection.
 *
 * THE COMPATIBILITY RULE. Every store runs its own Convex deployment and they
 * are re-pushed in bulk, so at any moment plenty of them are several bundles
 * behind this app. An old validator does not ignore an argument it has never
 * heard of — it rejects the whole query. So a preset sends exactly what it
 * sends today and keeps working everywhere; only a picked day or range sends
 * the new bounded window. A store that is behind therefore fails at the moment
 * the merchant uses the new feature, where `isStaleBundleError` already turns
 * it into "this store needs a backend update" — never on the screens that
 * worked yesterday.
 */
export function selectionToQueryArgs(
  selection: ReportSelection,
  nowMs: number
): ReportQueryArgs {
  if (selection.kind === "preset") return { daysBack: clampDays(selection.days) };
  return resolveReportWindow(selection, nowMs);
}

/** True when this selection needs a backend that understands bounded windows. */
export function needsBoundedWindow(selection: ReportSelection): boolean {
  return selection.kind !== "preset";
}

/** "Sep 3", or "Dec 25, 2025" once the year stops being obvious. */
function formatDay(dayKey: string, todayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  const label = `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
  const year = dayKey.slice(0, 4);
  return year === todayKey.slice(0, 4) ? label : `${label}, ${year}`;
}

/** What the picker pill and the screen subtitle say. */
export function describeSelection(selection: ReportSelection, nowMs: number): string {
  const todayKey = toBusinessDayKey(new Date(nowMs).toISOString());

  if (selection.kind === "preset") {
    const days = clampDays(selection.days);
    return days === 1 ? "Today" : `Last ${days} days`;
  }

  if (selection.kind === "range" && selection.fromKey !== selection.toKey) {
    return `${formatDay(selection.fromKey, todayKey)} – ${formatDay(selection.toKey, todayKey)}`;
  }

  const dayKey = selection.kind === "day" ? selection.dayKey : selection.fromKey;
  if (dayKey === todayKey) return "Today";
  if (nextBusinessDayKey(dayKey) === todayKey) return "Yesterday";
  return formatDay(dayKey, todayKey);
}

/** How many days the selection covers, counting both ends. */
export function rangeDayCount(selection: ReportSelection, nowMs: number): number {
  if (selection.kind === "preset") return clampDays(selection.days);
  if (selection.kind === "day") return 1;
  return daysBetween(selection.fromKey, selection.toKey);
}

/** The window of equal length immediately before this one, for "vs previous". */
export function previousReportWindow(window: ReportWindow): ReportWindow {
  return { startMs: window.startMs - (window.endMs - window.startMs), endMs: window.startMs };
}

/** The day counts the report pills offer. Unchanged from what they shipped. */
export const REPORT_PRESETS: readonly number[] = [7, 14, 30];

/** The default every report opens on — unchanged from what the pills shipped. */
export function defaultSelection(days: number): ReportSelection {
  return { kind: "preset", days: clampDays(days) };
}

export { toBusinessDayKey as reportTodayKey };
