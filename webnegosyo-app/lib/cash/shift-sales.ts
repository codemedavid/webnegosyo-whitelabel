/**
 * Shift sales: what the store sold inside one shift's window (or a named
 * service period), from the ONE sales definition on the server
 * (`report_shift_sales` / `report_period_sales`, CONTRACTS §4).
 *
 * The reply is parsed by hand — the app has no zod — with the profit
 * readers' rule (lib/profit/profit-rows.ts): a reply without the promised
 * shape throws, so the screen says "couldn't load" instead of drawing ₱0.
 * A hidden (blind) reply keeps its receipt list and counts but every peso
 * figure is `null`, and null is never shown as zero.
 *
 * Calls run as the signed-in user (the database decides who may read which
 * shift) behind a deadline, and answer a result instead of throwing.
 */

import { withDeadline } from "../offline/deadline";
import { formatDailyOrderNumber } from "../order-number";
import { supabase } from "../supabase";

/** Where a report's figures came from. `device` = counted on this tablet; `sample` = demo. */
export type ShiftSalesSource = "server" | "device" | "sample";

export type ShiftReceiptStatus = "paid" | "unpaid" | "void" | "refunded";

export const SHIFT_RECEIPT_STATUSES: readonly ShiftReceiptStatus[] = ["paid", "unpaid", "void", "refunded"];

export interface ShiftSalesSummary {
  orders: number;
  grossCents: number;
  discountCents: number;
  netCents: number;
  serviceChargeCents: number;
  deliveryCents: number;
  collectedCents: number;
  unpaidCents: number;
  overpaidCents: number;
  voidCount: number;
  voidCents: number;
  refundCents: number;
}

export interface ShiftSalesPayment {
  key: string;
  label: string;
  cents: number;
  count: number;
}

export interface ShiftSalesBreakdown {
  key: string;
  label: string;
  orders: number;
  netCents: number;
}

export interface ShiftSalesItem {
  label: string;
  quantity: number;
  netCents: number;
}

export interface ShiftSalesReceipt {
  orderId: string;
  /** "#07" — the daily order number as the app prints it, else a short id. */
  number: string;
  placedAt: string;
  orderTypeLabel: string | null;
  methodLabel: string | null;
  /** Null when hidden (blind count) or not known. */
  totalCents: number | null;
  status: ShiftReceiptStatus;
}

export interface ShiftSalesShift {
  id: string;
  staffName: string | null;
  drawerName: string | null;
  openedAt: string;
  closedAt: string | null;
  /** 'YYYY-MM-DD'; null when the server has not stamped one yet. */
  businessDay: string | null;
  servicePeriodName: string | null;
}

export interface ShiftSalesReport {
  source: ShiftSalesSource;
  /** Blind count: money hidden until the drawer is counted. */
  hidden: boolean;
  window: { from: string; to: string };
  shift: ShiftSalesShift | null;
  summary: ShiftSalesSummary | null;
  payments: ShiftSalesPayment[] | null;
  orderTypes: ShiftSalesBreakdown[] | null;
  channels: ShiftSalesBreakdown[] | null;
  items: ShiftSalesItem[] | null;
  receipts: ShiftSalesReceipt[];
  receiptsTruncated: boolean;
  firstNumber: string | null;
  lastNumber: string | null;
}

export type ShiftSalesReply = { kind: "report"; report: ShiftSalesReport } | { kind: "unavailable" };

type Row = Record<string, unknown>;

function asRow(value: unknown, what: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${what}: not an object`);
  return value as Row;
}

/** Whole numbers only; PostgREST sends bigint as a number, a numeric string is accepted too. */
function whole(row: Row, key: string): number {
  const value = row[key];
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number)) throw new Error(`${key}: not a whole number (${String(value)})`);
  return number;
}

/** Item quantities may be fractional (sold by weight); never negative. */
function quantity(row: Row, key: string): number {
  const value = row[key];
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < 0) throw new Error(`${key}: not a quantity (${String(value)})`);
  return number;
}

function wholeOrNull(row: Row, key: string): number | null {
  return row[key] === null || row[key] === undefined ? null : whole(row, key);
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`${key}: not text`);
  return value;
}

function textOrNull(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${key}: not text`);
  return value;
}

/** "#07" for a bare daily number, the server's own text otherwise. */
function receiptNumber(row: Row, key: string, orderId: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return formatDailyOrderNumber(value, orderId) || null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  throw new Error(`${key}: not a number or text`);
}

function listOrNull<T>(value: unknown, what: string, read: (row: Row) => T): T[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new Error(`${what}: not a list`);
  return value.map((entry) => read(asRow(entry, what)));
}

function toSummary(row: Row): ShiftSalesSummary {
  return {
    orders: whole(row, "orders"),
    grossCents: whole(row, "grossCents"),
    discountCents: whole(row, "discountCents"),
    netCents: whole(row, "netCents"),
    serviceChargeCents: whole(row, "serviceChargeCents"),
    deliveryCents: whole(row, "deliveryCents"),
    collectedCents: whole(row, "collectedCents"),
    unpaidCents: whole(row, "unpaidCents"),
    overpaidCents: whole(row, "overpaidCents"),
    voidCount: whole(row, "voidCount"),
    voidCents: whole(row, "voidCents"),
    refundCents: whole(row, "refundCents"),
  };
}

function toBreakdown(row: Row): ShiftSalesBreakdown {
  return { key: text(row, "key"), label: text(row, "label"), orders: whole(row, "orders"), netCents: whole(row, "netCents") };
}

function toStatus(value: unknown): ShiftReceiptStatus {
  if (typeof value === "string" && (SHIFT_RECEIPT_STATUSES as readonly string[]).includes(value)) {
    return value as ShiftReceiptStatus;
  }
  throw new Error(`status: unknown (${String(value)})`);
}

function toReceipt(row: Row): ShiftSalesReceipt {
  const orderId = text(row, "orderId");
  return {
    orderId,
    number: receiptNumber(row, "number", orderId) ?? formatDailyOrderNumber(null, orderId),
    placedAt: text(row, "placedAt"),
    orderTypeLabel: textOrNull(row, "orderTypeLabel"),
    methodLabel: textOrNull(row, "methodLabel"),
    totalCents: wholeOrNull(row, "totalCents"),
    status: toStatus(row.status),
  };
}

function toShift(row: Row): ShiftSalesShift {
  return {
    id: text(row, "id"),
    staffName: textOrNull(row, "staffName"),
    drawerName: textOrNull(row, "drawerName"),
    openedAt: text(row, "openedAt"),
    closedAt: textOrNull(row, "closedAt"),
    businessDay: textOrNull(row, "businessDay"),
    servicePeriodName: textOrNull(row, "servicePeriodName"),
  };
}

/** The RPC JSON → a report, or "this store's orders are not on the platform". Throws on a bad shape. */
export function parseShiftSalesReply(data: unknown): ShiftSalesReply {
  const row = asRow(data, "shift sales");
  if (row.source === "unavailable") return { kind: "unavailable" };
  if (row.source !== "server") throw new Error(`source: unknown (${String(row.source)})`);
  if (typeof row.hidden !== "boolean") throw new Error("hidden: not a boolean");
  if (typeof row.receiptsTruncated !== "boolean") throw new Error("receiptsTruncated: not a boolean");
  const window = asRow(row.window, "window");
  const receipts = listOrNull(row.receipts, "receipts", toReceipt);
  if (receipts === null) throw new Error("receipts: missing");
  return {
    kind: "report",
    report: {
      source: "server",
      hidden: row.hidden,
      window: { from: text(window, "from"), to: text(window, "to") },
      shift: row.shift === null || row.shift === undefined ? null : toShift(asRow(row.shift, "shift")),
      summary: row.summary === null || row.summary === undefined ? null : toSummary(asRow(row.summary, "summary")),
      payments: listOrNull(row.payments, "payments", (p) => ({
        key: text(p, "key"),
        label: text(p, "label"),
        cents: whole(p, "cents"),
        count: whole(p, "count"),
      })),
      orderTypes: listOrNull(row.orderTypes, "orderTypes", toBreakdown),
      channels: listOrNull(row.channels, "channels", toBreakdown),
      items: listOrNull(row.items, "items", (i) => ({
        label: text(i, "label"),
        quantity: quantity(i, "quantity"),
        netCents: whole(i, "netCents"),
      })),
      receipts,
      receiptsTruncated: row.receiptsTruncated,
      firstNumber: receiptNumber(row, "firstNumber", ""),
      lastNumber: receiptNumber(row, "lastNumber", ""),
    },
  };
}

// ---------------------------------------------------------------------------
// Calls

/** Long enough for a busy night's window; the report functions bound themselves too. */
const SHIFT_SALES_REQUEST_MS = 20_000;

export const SHIFT_SALES_FAILED_MESSAGE = "Shift sales couldn’t load. Check the connection and try again.";
export const SHIFT_SALES_LOCKED_MESSAGE = "You can see your own shift's sales. Ask the owner for “Cash & day close” to see other shifts.";

export interface ShiftSalesRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

const liveClient: ShiftSalesRpcClient = { rpc: (fn, args) => supabase.rpc(fn, args) };

/** `not_set_up` = the function is not on this database yet: count on the tablet instead. */
export type ShiftSalesFailureKind = "forbidden" | "invalid" | "not_set_up" | "failed";

export type ShiftSalesFetch =
  | { ok: true; reply: ShiftSalesReply }
  | { ok: false; kind: ShiftSalesFailureKind; message: string };

async function callShiftSales(client: ShiftSalesRpcClient, fn: string, args: Record<string, unknown>): Promise<ShiftSalesFetch> {
  let answer: { data: unknown; error: { code?: string; message?: string } | null };
  try {
    answer = await withDeadline(Promise.resolve(client.rpc(fn, args)), SHIFT_SALES_REQUEST_MS);
  } catch {
    return { ok: false, kind: "failed", message: SHIFT_SALES_FAILED_MESSAGE };
  }
  if (answer.error) {
    const { code, message } = answer.error;
    if (code === "42501") return { ok: false, kind: "forbidden", message: SHIFT_SALES_LOCKED_MESSAGE };
    if (code === "22023" || code === "P0002") return { ok: false, kind: "invalid", message: message || "That shift can’t be read." };
    if (code === "PGRST202" || code === "42883") return { ok: false, kind: "not_set_up", message: SHIFT_SALES_FAILED_MESSAGE };
    console.warn(`[shift-sales] ${fn} failed`, code, message);
    return { ok: false, kind: "failed", message: SHIFT_SALES_FAILED_MESSAGE };
  }
  try {
    return { ok: true, reply: parseShiftSalesReply(answer.data) };
  } catch (error) {
    console.warn(`[shift-sales] ${fn} returned an unexpected shape`, error);
    return { ok: false, kind: "failed", message: SHIFT_SALES_FAILED_MESSAGE };
  }
}

/** One shift's sales: the holder, or a cash manager with reach to its branch. */
export function fetchShiftSales(shiftId: string, client: ShiftSalesRpcClient = liveClient): Promise<ShiftSalesFetch> {
  return callShiftSales(client, "report_shift_sales", { p_shift_id: shiftId });
}

export interface PeriodSalesWindow {
  tenantId: string;
  /** ISO instants, half-open [from, to). */
  from: string;
  to: string;
  /** Null = the whole store. */
  outletId: string | null;
}

/** A window's sales (a past service period, the day close's split). Needs `reports`. */
export function fetchPeriodSales(window: PeriodSalesWindow, client: ShiftSalesRpcClient = liveClient): Promise<ShiftSalesFetch> {
  return callShiftSales(client, "report_period_sales", {
    p_tenant: window.tenantId,
    p_from: window.from,
    p_to: window.to,
    // Left out, not sent as null, so the function's own default applies.
    ...(window.outletId ? { p_outlet: window.outletId } : {}),
  });
}
