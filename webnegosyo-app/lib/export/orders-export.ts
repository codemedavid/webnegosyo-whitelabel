/**
 * Orders → CSV rows.
 *
 * Pure functions only: the screens fetch orders through the existing
 * backend-routed reads (`orders:getOrders` / `orders:getAllOrderItems`, served
 * by Convex or the platform Supabase adapter alike) and hand the results here.
 * The input types are structural subsets of `OrderDto` / `OrderItemDto` in
 * `lib/backends/supabase-orders.ts`, which the Convex documents also satisfy —
 * so one exporter serves both backends without knowing which answered.
 */

import { toCsv } from "./csv";
import { formatExportDateTime } from "./dates";
import { DEFAULT_TZ_OFFSET_MS } from "../product-daily-analytics";
import type { DateWindow } from "../product-analytics-filters";

export interface ExportOrderInput {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact?: string;
  total: number;
  itemCount: number;
  status: string;
  source?: string;
  orderType?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  deliveryFee?: number;
  amountPaid?: number;
}

export interface ExportOrderItemInput {
  orderId: string;
  menuItemName: string;
  quantity: number;
  subtotal: number;
  variation?: string;
}

export interface OrdersExportFilters {
  window: DateWindow;
  /** Exact status to keep; omit for all statuses. */
  status?: string;
}

/** Orders inside the half-open window, optionally narrowed to one status. */
export function filterOrdersForExport<T extends ExportOrderInput>(
  orders: readonly T[],
  { window, status }: OrdersExportFilters
): T[] {
  return orders.filter((order) => {
    if (order._creationTime < window.startMs) return false;
    if (order._creationTime >= window.endMs) return false;
    if (status && order.status !== status) return false;
    return true;
  });
}

/** "2x Burger (Large); 1x Coke" — one cell summarizing an order's lines. */
export function summarizeItems(items: readonly ExportOrderItemInput[]): string {
  return items
    .map((item) => {
      const variation = item.variation ? ` (${item.variation})` : "";
      return `${item.quantity}x ${item.menuItemName}${variation}`;
    })
    .join("; ");
}

/** Line items indexed by their order, preserving fetch order within each. */
export function groupItemsByOrder(
  items: readonly ExportOrderItemInput[]
): Map<string, ExportOrderItemInput[]> {
  const grouped = new Map<string, ExportOrderItemInput[]>();
  for (const item of items) {
    const existing = grouped.get(item.orderId);
    if (existing) {
      grouped.set(item.orderId, [...existing, item]);
    } else {
      grouped.set(item.orderId, [item]);
    }
  }
  return grouped;
}

const ORDER_HEADERS = [
  "Order ID",
  "Date",
  "Time",
  "Status",
  "Type",
  "Source",
  "Customer",
  "Contact",
  "Items",
  "Item Count",
  "Payment Method",
  "Payment Status",
  "Delivery Fee",
  "Total",
  "Amount Paid",
] as const;

/** One CSV row per order, newest first. */
export function buildOrdersCsv(
  orders: readonly ExportOrderInput[],
  itemsByOrder: ReadonlyMap<string, ExportOrderItemInput[]>,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  const sorted = [...orders].sort((a, b) => b._creationTime - a._creationTime);
  const rows = sorted.map((order) => {
    const [date, time] = formatExportDateTime(order._creationTime, offsetMs).split(" ");
    return [
      order._id,
      date,
      time,
      order.status,
      order.orderType,
      order.source,
      order.customerName,
      order.customerContact,
      summarizeItems(itemsByOrder.get(order._id) ?? []),
      order.itemCount,
      order.paymentMethod,
      order.paymentStatus,
      order.deliveryFee,
      order.total,
      order.amountPaid,
    ];
  });
  return toCsv(ORDER_HEADERS, rows);
}

export interface ExportCoverageInput {
  /** How many orders the backend returned. */
  fetchedCount: number;
  /** The page cap the read was issued with. */
  fetchLimit: number;
  /** `_creationTime` of the oldest fetched order; undefined when none. */
  oldestFetchedMs: number | undefined;
  window: DateWindow;
}

export interface ExportCoverage {
  /** False when the fetch cap cut into the requested window. */
  isComplete: boolean;
  /** Where the export's coverage really starts — the honest label. */
  effectiveStartMs: number;
}

/**
 * Whether a capped fetch actually covered the requested window.
 *
 * The order reads return the most recent N. If exactly N came back and the
 * oldest of them is inside the window, older orders existed but were not
 * fetched — the export must say "since <date>" rather than claim the range.
 */
export function resolveExportCoverage({
  fetchedCount,
  fetchLimit,
  oldestFetchedMs,
  window,
}: ExportCoverageInput): ExportCoverage {
  const hitCap = fetchedCount >= fetchLimit && fetchedCount > 0;
  const truncated =
    hitCap && oldestFetchedMs !== undefined && oldestFetchedMs > window.startMs;
  return {
    isComplete: !truncated,
    effectiveStartMs: truncated ? oldestFetchedMs : window.startMs,
  };
}
