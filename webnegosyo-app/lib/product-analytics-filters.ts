// Filter vocabulary for the Products screen's daily view.
//
// The option catalogues and the date maths live here rather than beside the JSX
// so the screen stays presentational and every window boundary is unit-tested.
// Windows are half-open [startMs, endMs) and always land on the merchant's
// LOCAL day boundary — bucketing on UTC would shift a PH merchant's day by 8h
// and drop the first hours of trading onto the previous date.

import {
  DEFAULT_TZ_OFFSET_MS,
  productDateKey,
  type ProductMetric,
} from "./product-daily-analytics";

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type DateRangePreset = "today" | "7d" | "30d" | "90d";

export interface DateWindow {
  startMs: number;
  endMs: number;
}

interface Option<T> {
  label: string;
  value: T;
}

/** How many local days each preset covers, counting today. */
const PRESET_DAYS: Record<DateRangePreset, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const DATE_RANGE_PRESETS: readonly Option<DateRangePreset>[] = [
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "90 Days", value: "90d" },
];

/** `undefined` means "show every product", not "show none". */
export const TOP_N_OPTIONS: readonly Option<number | undefined>[] = [
  { label: "Top 10", value: 10 },
  { label: "Top 25", value: 25 },
  { label: "All", value: undefined },
];

export const METRIC_OPTIONS: readonly Option<ProductMetric>[] = [
  { label: "Sales", value: "sales" },
  { label: "Units", value: "units" },
  { label: "Orders", value: "orders" },
];

export const SOURCE_OPTIONS: readonly Option<string>[] = [
  { label: "Online", value: "web" },
  { label: "App", value: "mobile" },
  { label: "Counter", value: "pos" },
  { label: "QR", value: "qr_handoff" },
];

/** Epoch ms of 00:00 local time for the local day containing `atMs`. */
function localDayStartMs(atMs: number, offsetMs: number): number {
  return Math.floor((atMs + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
}

/**
 * The half-open window a preset covers, ending at the end of the local today so
 * sales rung up an hour ago are included.
 */
export function resolveDateWindow(
  preset: DateRangePreset,
  nowMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): DateWindow {
  const todayStart = localDayStartMs(nowMs, offsetMs);
  const days = PRESET_DAYS[preset] ?? 1;
  return {
    startMs: todayStart - (days - 1) * DAY_MS,
    endMs: todayStart + DAY_MS,
  };
}

/** The half-open window covering one picked local day ("YYYY-MM-DD"). */
export function resolveSingleDayWindow(
  dateKey: string,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): DateWindow {
  const startMs = Date.parse(`${dateKey}T00:00:00.000Z`) - offsetMs;
  return { startMs, endMs: startMs + DAY_MS };
}

interface DatedOrder {
  id: string;
  createdAtMs: number;
  status: string;
}

/**
 * The distinct local days that actually have (non-cancelled) orders, newest
 * first — the day picker offers only these so it never lands on an empty day.
 */
export function listAvailableDays(
  orders: readonly DatedOrder[],
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string[] {
  const days = new Set<string>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    days.add(productDateKey(order.createdAtMs, offsetMs));
  }
  return [...days].sort((a, b) => b.localeCompare(a));
}

/** "Today" / "Yesterday" / "Jul 4" — relative to the merchant's local today. */
export function formatDayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";

  const parsed = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return dateKey;

  const todayParsed = Date.parse(`${todayKey}T00:00:00.000Z`);
  if (!Number.isNaN(todayParsed) && todayParsed - parsed === DAY_MS) {
    return "Yesterday";
  }

  const date = new Date(parsed);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
