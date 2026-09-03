/**
 * Calendar view of the schedule — pure arithmetic over the scheduled orders
 * `scheduled-orders.ts` already selects.
 *
 * The month grid is the merchant's overview ("which days am I committed on?");
 * the day under it is the same agenda the strip used to show. Both keep the
 * strip's one rule: a missed order is today's problem, so past days fold into
 * today and the grid never asks anyone to tap a greyed-out day to find it.
 *
 * All labels are hand-rolled (no toLocaleString) so nothing drifts with the
 * device zone, matching the rest of the schedule code.
 */

import {
  buildDateStrip,
  dayLabel,
  ordersForDay,
  todayKey,
  type ScheduledOrder,
  type ScheduledSourceOrder,
} from "./scheduled-orders";
import { isPresellOrder, type PresellSourceOrder } from "./presell-orders";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;

export interface MonthCursor {
  year: number;
  /** 0-based, like `Date#getMonth`. */
  month: number;
}

export interface CalendarCell {
  /** Local "YYYY-MM-DD". */
  key: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  /** Strictly before today. */
  isPast: boolean;
}

export interface DayLoad {
  total: number;
  presell: number;
  overdue: number;
}

export type ScheduleKind = "all" | "presell" | "plain";

export interface DaySummary {
  count: number;
  presell: number;
  revenue: number;
}

export interface AgendaDay<T extends ScheduledSourceOrder> {
  key: string;
  label: string;
  orders: ScheduledOrder<T>[];
}

type ScheduledPresellOrder = ScheduledSourceOrder & PresellSourceOrder;

function keyOf(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthCursorOf(nowMs: number): MonthCursor {
  const dt = new Date(nowMs);
  return { year: dt.getFullYear(), month: dt.getMonth() };
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const absolute = cursor.year * MONTHS_PER_YEAR + cursor.month + delta;
  return {
    year: Math.floor(absolute / MONTHS_PER_YEAR),
    month: ((absolute % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR,
  };
}

export function monthTitle(cursor: MonthCursor): string {
  return `${MONTH_NAMES[cursor.month]} ${cursor.year}`;
}

/**
 * Sunday-first weeks covering the month, padded on both ends with the
 * neighbouring months' days so every row is seven cells wide. Rows are only
 * as many as the month needs (four to six).
 */
export function buildMonthGrid(cursor: MonthCursor, nowMs: number): CalendarCell[][] {
  const today = todayKey(nowMs);
  const first = new Date(cursor.year, cursor.month, 1);
  const start = new Date(cursor.year, cursor.month, 1 - first.getDay());
  const lastDay = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cellCount =
    Math.ceil((first.getDay() + lastDay) / DAYS_PER_WEEK) * DAYS_PER_WEEK;

  const cells = Array.from({ length: cellCount }, (_, offset) => {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const key = keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
    return {
      key,
      day: dt.getDate(),
      isCurrentMonth: dt.getMonth() === cursor.month,
      isToday: key === today,
      isPast: key < today,
    };
  });

  return Array.from({ length: cellCount / DAYS_PER_WEEK }, (_, row) =>
    cells.slice(row * DAYS_PER_WEEK, (row + 1) * DAYS_PER_WEEK),
  );
}

/** Per-day counts for the grid, with missed orders folded into today. */
export function loadByDay(
  scheduled: readonly ScheduledOrder<ScheduledPresellOrder>[],
  nowMs: number,
): Map<string, DayLoad> {
  const today = todayKey(nowMs);
  const load = new Map<string, DayLoad>();
  for (const order of scheduled) {
    const own = todayKey(order.scheduledAtMs);
    const bucket = own <= today ? today : own;
    const prev = load.get(bucket) ?? { total: 0, presell: 0, overdue: 0 };
    load.set(bucket, {
      total: prev.total + 1,
      presell: prev.presell + (isPresellOrder(order) ? 1 : 0),
      overdue: prev.overdue + (order.scheduledAtMs < nowMs ? 1 : 0),
    });
  }
  return load;
}

export function filterByKind<T extends ScheduledPresellOrder>(
  scheduled: readonly ScheduledOrder<T>[],
  kind: ScheduleKind,
): ScheduledOrder<T>[] {
  if (kind === "all") return [...scheduled];
  const wantPresell = kind === "presell";
  return scheduled.filter((order) => isPresellOrder(order) === wantPresell);
}

export function summarizeDay(
  orders: readonly (ScheduledPresellOrder & { total?: number })[],
): DaySummary {
  return orders.reduce<DaySummary>(
    (acc, order) => ({
      count: acc.count + 1,
      presell: acc.presell + (isPresellOrder(order) ? 1 : 0),
      revenue: acc.revenue + (Number.isFinite(order.total) ? (order.total as number) : 0),
    }),
    { count: 0, presell: 0, revenue: 0 },
  );
}

/** Every day on the strip with its orders attached — the "Schedule" list view. */
export function agendaDays<T extends ScheduledSourceOrder>(
  scheduled: readonly ScheduledOrder<T>[],
  nowMs: number,
): AgendaDay<T>[] {
  return buildDateStrip(scheduled, nowMs).map((day) => ({
    key: day.key,
    label: day.label,
    orders: ordersForDay(scheduled, day.key, nowMs),
  }));
}

/** First day after `afterKey` that carries orders, or null. */
export function nextLoadedDay(load: ReadonlyMap<string, DayLoad>, afterKey: string): string | null {
  const keys = [...load.keys()].filter((key) => key > afterKey).sort();
  return keys[0] ?? null;
}

export { dayLabel };
