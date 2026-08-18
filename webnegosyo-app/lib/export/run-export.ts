/**
 * One call per export button: window resolution, filtering, CSV building,
 * coverage, and the share — so each screen's handler is a few lines and the
 * whole sequence stays unit-testable by injecting `share`.
 */

import { resolveDateWindow, type DateRangePreset } from "../product-analytics-filters";
import { buildCustomersCsv, type ExportCustomerInput } from "./customers-export";
import { exportFileName, formatExportDay } from "./dates";
import {
  buildOrdersCsv,
  filterOrdersForExport,
  groupItemsByOrder,
  resolveExportCoverage,
  type ExportCoverage,
  type ExportOrderInput,
  type ExportOrderItemInput,
} from "./orders-export";
import { buildDailySalesCsv, type SalesOrderInput } from "./sales-export";
import { shareCsv, type ShareCsvInput } from "./share";

type ShareFn = (input: ShareCsvInput) => Promise<string>;

function oldestCreationMs(orders: readonly { _creationTime: number }[]): number | undefined {
  if (orders.length === 0) return undefined;
  return orders.reduce((min, o) => Math.min(min, o._creationTime), Number.POSITIVE_INFINITY);
}

export interface RunOrdersExportInput {
  /** Every order the screen fetched (already branch-scoped), unfiltered. */
  orders: readonly ExportOrderInput[];
  items: readonly ExportOrderItemInput[];
  preset: DateRangePreset;
  /** Exact status to keep; omit for all. */
  status?: string;
  nowMs: number;
  /** The page cap the order fetch was issued with, for honest coverage. */
  fetchLimit: number;
  share?: ShareFn;
}

export async function runOrdersExport({
  orders,
  items,
  preset,
  status,
  nowMs,
  fetchLimit,
  share = shareCsv,
}: RunOrdersExportInput): Promise<ExportCoverage> {
  const window = resolveDateWindow(preset, nowMs);
  const coverage = resolveExportCoverage({
    fetchedCount: orders.length,
    fetchLimit,
    oldestFetchedMs: oldestCreationMs(orders),
    window,
  });
  const filtered = filterOrdersForExport(orders, { window, status });
  const csv = buildOrdersCsv(filtered, groupItemsByOrder(items));
  await share({ fileName: exportFileName("orders", window), csv });
  return coverage;
}

export interface RunSalesExportInput {
  orders: readonly (SalesOrderInput & ExportOrderInput)[] | readonly SalesOrderInput[];
  preset: DateRangePreset;
  nowMs: number;
  fetchLimit: number;
  share?: ShareFn;
}

export async function runSalesExport({
  orders,
  preset,
  nowMs,
  fetchLimit,
  share = shareCsv,
}: RunSalesExportInput): Promise<ExportCoverage> {
  const window = resolveDateWindow(preset, nowMs);
  const coverage = resolveExportCoverage({
    fetchedCount: orders.length,
    fetchLimit,
    oldestFetchedMs: oldestCreationMs(orders),
    window,
  });
  const csv = buildDailySalesCsv(orders, window);
  await share({ fileName: exportFileName("sales", window), csv });
  return coverage;
}

export interface RunCustomersExportInput {
  customers: readonly ExportCustomerInput[];
  nowMs: number;
  share?: ShareFn;
}

export async function runCustomersExport({
  customers,
  nowMs,
  share = shareCsv,
}: RunCustomersExportInput): Promise<void> {
  const csv = buildCustomersCsv(customers);
  await share({ fileName: `customers_${formatExportDay(nowMs)}.csv`, csv });
}
