/**
 * Daily sales summary → CSV.
 *
 * Same conventions as the in-app analytics (`lib/product-daily-analytics.ts`):
 * days are Manila days, cancelled orders count toward nothing, and the series
 * has a row for every day in the window so a merchant pasting it into a sheet
 * gets a gapless date axis.
 */

import { toCsv } from "./csv";
import { DAY_MS, formatExportDay } from "./dates";
import { DEFAULT_TZ_OFFSET_MS } from "../product-daily-analytics";
import type { DateWindow } from "../product-analytics-filters";

export interface SalesOrderInput {
  _id: string;
  _creationTime: number;
  total: number;
  itemCount: number;
  status: string;
}

export interface DailySalesRow {
  date: string;
  orders: number;
  units: number;
  grossSales: number;
  avgOrderValue: number;
}

const EXCLUDED_STATUS = "cancelled";

function toCentavos(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One row per Manila day in the window, oldest first, zero-filled. */
export function buildDailySalesRows(
  orders: readonly SalesOrderInput[],
  window: DateWindow,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): DailySalesRow[] {
  const totals = new Map<string, { orders: number; units: number; grossSales: number }>();

  for (let dayStart = window.startMs; dayStart < window.endMs; dayStart += DAY_MS) {
    totals.set(formatExportDay(dayStart, offsetMs), { orders: 0, units: 0, grossSales: 0 });
  }

  for (const order of orders) {
    if (order.status === EXCLUDED_STATUS) continue;
    if (order._creationTime < window.startMs || order._creationTime >= window.endMs) continue;
    const day = totals.get(formatExportDay(order._creationTime, offsetMs));
    if (!day) continue;
    day.orders += 1;
    day.units += order.itemCount;
    day.grossSales += order.total;
  }

  return [...totals.entries()].map(([date, day]) => ({
    date,
    orders: day.orders,
    units: day.units,
    grossSales: toCentavos(day.grossSales),
    avgOrderValue: day.orders === 0 ? 0 : toCentavos(day.grossSales / day.orders),
  }));
}

const SALES_HEADERS = ["Date", "Orders", "Units", "Gross Sales", "Avg Order Value"] as const;

/** The day rows plus a TOTAL row across the whole window. */
export function buildDailySalesCsv(
  orders: readonly SalesOrderInput[],
  window: DateWindow,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  const rows = buildDailySalesRows(orders, window, offsetMs);
  const total = rows.reduce(
    (acc, row) => ({
      orders: acc.orders + row.orders,
      units: acc.units + row.units,
      grossSales: acc.grossSales + row.grossSales,
    }),
    { orders: 0, units: 0, grossSales: 0 }
  );
  const totalRow = [
    "TOTAL",
    total.orders,
    total.units,
    toCentavos(total.grossSales),
    total.orders === 0 ? 0 : toCentavos(total.grossSales / total.orders),
  ];
  return toCsv(SALES_HEADERS, [
    ...rows.map((row) => [row.date, row.orders, row.units, row.grossSales, row.avgOrderValue]),
    totalRow,
  ]);
}
