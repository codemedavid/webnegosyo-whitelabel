/**
 * Date rendering for exports, in the merchant's local day.
 *
 * Uses the same fixed Manila offset as the analytics screens
 * (`lib/product-daily-analytics.ts`) so an exported day always matches the day
 * the merchant sees in the app — never the UTC day, which flips at 8am.
 */

import { DEFAULT_TZ_OFFSET_MS } from "../product-daily-analytics";
import type { DateWindow } from "../product-analytics-filters";

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" in the merchant's local day. */
export function formatExportDay(
  ms: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  const local = new Date(ms + offsetMs);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** "YYYY-MM-DD HH:mm" in the merchant's local time. */
export function formatExportDateTime(
  ms: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  const local = new Date(ms + offsetMs);
  return `${formatExportDay(ms, offsetMs)} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/**
 * "orders_2026-08-12_2026-08-18.csv" — the inclusive day range of a half-open
 * window. A single-day window collapses to one date so "today's sales" does
 * not read as a range.
 */
export function exportFileName(
  prefix: string,
  window: DateWindow,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  const firstDay = formatExportDay(window.startMs, offsetMs);
  const lastDay = formatExportDay(window.endMs - 1, offsetMs);
  const range = firstDay === lastDay ? firstDay : `${firstDay}_${lastDay}`;
  return `${prefix}_${range}.csv`;
}

export { DAY_MS };
