/**
 * The floor, derived. A table's state is never stored: it is read off the
 * party sitting there (an open seating) and the orders that name the table.
 *
 * Orders name a table by LABEL — `customer_data.table_number`, normalized —
 * not by key, because both order backends already carry that field and the
 * Convex deployments are not touched for this feature. The join is done here,
 * on the client, from the same bounded recent-orders page the queue reads.
 *
 * Pure: no React, no I/O, no clock — the caller passes `nowMs`.
 */

import { getOrderOutletId } from "../branch-scope";
import { isOrderUnpaid } from "../order-paid-state";
import { getOrderTableNumber, normalizeTableNumber } from "../order-table-number";

export type TableShape = "round" | "square" | "rect";
export type TableSize = "sm" | "md" | "lg";

/** The quarter turns a table can be set at. A floor plan needs no finer. */
export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export function normalizeRotation(value: unknown): Rotation {
  const degrees = typeof value === "number" ? value : Number(value);
  return (ROTATIONS as readonly number[]).includes(degrees) ? (degrees as Rotation) : 0;
}

/** The next quarter turn, wrapping back to upright. */
export function nextRotation(rotation: Rotation): Rotation {
  return ROTATIONS[(ROTATIONS.indexOf(rotation) + 1) % ROTATIONS.length];
}

export interface DiningTable {
  id: string;
  tenantId: string;
  /** The branch whose floor this is; null for a single-location store. */
  outletId: string | null;
  label: string;
  seats: number;
  shape: TableShape;
  size: TableSize;
  zone: string | null;
  /** Node centre as a fraction of the canvas, 0..1. */
  posX: number;
  posY: number;
  /** Which way the table faces, in quarter turns clockwise. */
  rotation: Rotation;
  sortOrder: number;
  isActive: boolean;
}

export interface TableSeating {
  id: string;
  tableId: string;
  partySize: number;
  /** Epoch ms. */
  seatedAt: number;
  note: string | null;
}

/** The slice of an order DTO the floor reads. Both backends' DTOs satisfy it. */
export interface TableOrderLike {
  _id: string;
  _creationTime: number;
  status: string;
  total: number;
  paymentStatus?: string | null;
  amountPaid?: number | null;
  customerData?: Record<string, unknown>;
  outlet_id?: string | null;
  outletId?: string | null;
}

export type TableStatus = "available" | "seated" | "ordered" | "ready" | "billing";

export const TABLE_STATUSES: readonly TableStatus[] = [
  "available",
  "seated",
  "ordered",
  "ready",
  "billing",
];

export interface TableView<O extends TableOrderLike = TableOrderLike> {
  table: DiningTable;
  seating: TableSeating | null;
  /** Newest first. */
  orders: O[];
  status: TableStatus;
  /** Every matched order's total, paid or not. */
  runningBill: number;
  /** Only what is still owed. */
  unpaidTotal: number;
  covers: number;
  seatedForMs: number | null;
}

export interface FloorSummary {
  total: number;
  byStatus: Record<TableStatus, number>;
  covers: number;
  seatsFree: number;
}

/**
 * How far back an order can be and still count as "on the table". A table
 * with no seating has no arrival time to anchor on, so without this a
 * lunch order would still light the table at dinner.
 */
export const TABLE_ORDER_LOOKBACK_MS = 12 * 60 * 60 * 1000;

/**
 * Orders rung shortly BEFORE the party was marked seated still belong to it:
 * the host often seats in the app a minute after the server took the order.
 */
export const SEATING_GRACE_MS = 5 * 60 * 1000;

const COOKING_STATUSES: readonly string[] = ["pending", "confirmed", "preparing"];
const SERVED_STATUSES: readonly string[] = ["delivered", "completed"];

export interface OrdersForTableOptions {
  nowMs: number;
  /** The open seating's arrival, or null when nobody is marked seated. */
  seatedAt: number | null;
  /** The table's branch; an order from another branch never matches. */
  outletId?: string | null;
}

export function ordersForTable<O extends TableOrderLike>(
  label: string,
  orders: readonly O[],
  options: OrdersForTableOptions,
): O[] {
  const wanted = normalizeTableNumber(label);
  if (wanted === "") return [];

  const since = options.seatedAt === null
    ? options.nowMs - TABLE_ORDER_LOOKBACK_MS
    : options.seatedAt - SEATING_GRACE_MS;

  return orders
    .filter((order) => {
      if (order.status === "cancelled") return false;
      if (order._creationTime < since) return false;
      if (getOrderTableNumber(order.customerData) !== wanted) return false;
      if (options.outletId) {
        const orderOutlet = getOrderOutletId(order);
        if (orderOutlet !== null && orderOutlet !== options.outletId) return false;
      }
      return true;
    })
    .sort((a, b) => b._creationTime - a._creationTime);
}

export function resolveTableStatus(
  seating: TableSeating | null,
  orders: readonly TableOrderLike[],
): TableStatus {
  if (orders.some((order) => order.status === "ready")) return "ready";
  if (orders.some((order) => COOKING_STATUSES.includes(order.status))) return "ordered";
  if (orders.some((order) => SERVED_STATUSES.includes(order.status) && isOrderUnpaid(order))) {
    return "billing";
  }
  return seating ? "seated" : "available";
}

function compareTables(a: DiningTable, b: DiningTable): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.label.localeCompare(b.label, undefined, { numeric: true });
}

export function buildTableViews<O extends TableOrderLike>(
  tables: readonly DiningTable[],
  seatings: readonly TableSeating[],
  orders: readonly O[],
  nowMs: number,
): TableView<O>[] {
  const seatingByTable = new Map(seatings.map((seating) => [seating.tableId, seating]));

  return tables
    .filter((table) => table.isActive)
    .slice()
    .sort(compareTables)
    .map((table) => {
      const seating = seatingByTable.get(table.id) ?? null;
      const matched = ordersForTable(table.label, orders, {
        nowMs,
        seatedAt: seating?.seatedAt ?? null,
        outletId: table.outletId,
      });
      return {
        table,
        seating,
        orders: matched,
        status: resolveTableStatus(seating, matched),
        runningBill: matched.reduce((sum, order) => sum + order.total, 0),
        unpaidTotal: matched
          .filter((order) => isOrderUnpaid(order))
          .reduce((sum, order) => sum + order.total, 0),
        covers: seating?.partySize ?? 0,
        seatedForMs: seating ? Math.max(0, nowMs - seating.seatedAt) : null,
      };
    });
}

export function summarizeFloor(views: readonly TableView[]): FloorSummary {
  const byStatus: Record<TableStatus, number> = {
    available: 0,
    seated: 0,
    ordered: 0,
    ready: 0,
    billing: 0,
  };
  let covers = 0;
  let seatsFree = 0;
  for (const view of views) {
    byStatus[view.status] += 1;
    covers += view.covers;
    if (view.status === "available") seatsFree += view.table.seats;
  }
  return { total: views.length, byStatus, covers, seatsFree };
}

export function filterViews<O extends TableOrderLike>(
  views: readonly TableView<O>[],
  status: TableStatus | "all",
): TableView<O>[] {
  return status === "all" ? [...views] : views.filter((view) => view.status === status);
}
