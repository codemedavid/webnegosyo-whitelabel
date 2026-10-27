/**
 * "Your late orders belong to the night before": the one-tap suggestion on
 * the business-day setting (CONTRACTS §1.1).
 *
 * Read from the existing `report_sales_by_hour` RPC (platform stores, caller
 * holds `reports`): 30 days, at most 7 × 24 aggregated rows, the same bounded
 * report read the web uses. Any refusal or other backend simply means no card;
 * the setting itself never depends on it.
 */

import { withDeadline } from "../offline/deadline";
import type { CashDb } from "./settings";

const REQUEST_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
/** Below this, a few late orders say nothing about the store. */
const MIN_ORDERS = 30;
/** Late orders must be at least this share before the card is worth showing. */
const MIN_LATE_SHARE = 0.05;
/** An hour counts as "still trading" at this share of all orders. */
const BUSY_HOUR_SHARE = 0.01;
/** The suggestion never goes past 6 AM: the last chip. */
const LATEST_SUGGESTED_HOUR = 6;

export interface HourBucket {
  hour: number;
  orders: number;
}

export interface CutoffSuggestion {
  cutoffMinutes: number;
  /** Share of all orders placed between midnight and 6 AM. */
  lateShare: number;
  lateOrders: number;
}

export function suggestCutoff(hours: readonly HourBucket[], currentCutoffMinutes: number): CutoffSuggestion | null {
  const total = hours.reduce((sum, bucket) => sum + bucket.orders, 0);
  if (total < MIN_ORDERS) return null;
  const late = hours.filter((bucket) => bucket.hour < LATEST_SUGGESTED_HOUR);
  const lateOrders = late.reduce((sum, bucket) => sum + bucket.orders, 0);
  if (lateOrders / total < MIN_LATE_SHARE) return null;
  const busy = late.filter((bucket) => bucket.orders >= Math.max(2, total * BUSY_HOUR_SHARE));
  if (busy.length === 0) return null;
  const lastBusyHour = Math.max(...busy.map((bucket) => bucket.hour));
  const cutoffMinutes = Math.min(LATEST_SUGGESTED_HOUR, lastBusyHour + 1) * 60;
  if (currentCutoffMinutes >= cutoffMinutes) return null;
  return { cutoffMinutes, lateShare: lateOrders / total, lateOrders };
}

export interface SuggestionWindow {
  fromIso: string;
  toIso: string;
}

export function suggestionWindow(nowMs: number): SuggestionWindow {
  return { fromIso: new Date(nowMs - WINDOW_DAYS * DAY_MS).toISOString(), toIso: new Date(nowMs).toISOString() };
}

interface HourRow {
  hour: number | string;
  orders: number | string;
}

/** Orders per Manila hour of day over the window. THROWS on refusal. */
export async function fetchOrderHours(db: CashDb, tenantId: string, window: SuggestionWindow): Promise<HourBucket[]> {
  const { data, error } = await withDeadline(
    Promise.resolve(
      db.rpc("report_sales_by_hour", { p_tenant: tenantId, p_from: window.fromIso, p_to: window.toIso, p_tz: "Asia/Manila" }),
    ),
    REQUEST_MS,
  );
  if (error) throw new Error(error.message ?? "The order hours could not be read.");
  const totals = new Array<number>(24).fill(0);
  for (const row of (Array.isArray(data) ? data : []) as HourRow[]) {
    const hour = Number(row.hour);
    const orders = Number(row.orders);
    if (Number.isInteger(hour) && hour >= 0 && hour < 24 && Number.isFinite(orders)) totals[hour] += orders;
  }
  return totals.map((orders, hour) => ({ hour, orders }));
}
