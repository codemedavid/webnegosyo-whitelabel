/**
 * Pre-sold orders on the merchant app: which scheduled orders were sold
 * against per-date presell stock, and for which date.
 *
 * The date rides the order two ways and both are read, mirroring how the
 * schedule itself is read (scheduled-orders.ts): `customerData.presell_date`
 * is stamped by the web checkout on every backend; `items[].presellDate` is
 * the Convex v25 column and is only a fallback. Formatting is hand-rolled so
 * the label cannot drift with the device zone.
 */

import { todayKey } from "./scheduled-orders";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The slice of an order this module reads, as either backend delivers it. */
export interface PresellSourceOrder {
  customerData?: Record<string, unknown> | null;
  items?: readonly { presellDate?: string | null }[] | null;
}

export function getPresellDate(order: PresellSourceOrder): string | null {
  const stamped = order.customerData?.presell_date;
  if (typeof stamped === "string" && DATE_KEY_PATTERN.test(stamped)) return stamped;
  for (const item of order.items ?? []) {
    if (typeof item.presellDate === "string" && DATE_KEY_PATTERN.test(item.presellDate)) {
      return item.presellDate;
    }
  }
  return null;
}

export function isPresellOrder(order: PresellSourceOrder): boolean {
  return getPresellDate(order) !== null;
}

/**
 * Pre-sold orders per agenda day, bucketed exactly like `buildDateStrip`:
 * a missed pre-order folds into today, so the chip that carries it is the
 * one the merchant is already looking at.
 */
export function presellCountsByDay(
  scheduled: readonly (PresellSourceOrder & { scheduledAtMs: number })[],
  nowMs: number,
): Map<string, number> {
  const today = todayKey(nowMs);
  const counts = new Map<string, number>();
  for (const order of scheduled) {
    if (!isPresellOrder(order)) continue;
    const key = todayKey(order.scheduledAtMs);
    const bucket = key <= today ? today : key;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
}

/** "Sat, Jun 20" from a YYYY-MM-DD key, without touching the device zone. */
export function formatPresellDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const day = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[day.getDay()]}, ${MONTHS[day.getMonth()]} ${day.getDate()}`;
}
