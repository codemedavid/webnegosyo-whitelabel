/**
 * Item summary: what sold in a picked period, one row per dish, from the ONE
 * sales definition on the server (`report_sales_by_item` + its totals,
 * `report_sales_summary` — the same functions behind the web Reports pages).
 * Nothing is added up from orders on the phone: the totals row IS the
 * summary's net sales, and the rows already add up to it exactly (orders
 * saved without their dishes appear as one "Items not recorded" row).
 *
 * Calls run as the signed-in user (`item-summary-client.ts`), never the service role: row-level security
 * decides which orders exist, and the functions refuse callers without the
 * `reports` key (42501). Each call covers at most 93 days (22023 otherwise),
 * so a longer period is read as consecutive windows and merged by item key.
 * Item rows are paged past the API's 1,000-row cap.
 *
 * The reply is parsed by hand (the app has no zod); a reply without the
 * promised shape fails the read instead of drawing ₱0.
 */

import { formatPeso } from "../format";
import { withDeadline } from "../offline/deadline";
import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";
import type { RefRoute } from "../backends/route";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The widest window one report call accepts (reporting.assert_access). */
export const REPORT_MAX_WINDOW_DAYS = 93;

/** PostgREST's max-rows: a set-returning RPC answers at most this many rows per request. */
export const ITEM_SUMMARY_PAGE_SIZE = 1000;

/** Long enough for a busy store's month; the report functions bound themselves too. */
const ITEM_SUMMARY_REQUEST_MS = 20_000;

/** The web's REPORT_FORBIDDEN_MESSAGE (src/lib/reports/read/report-rpc.ts). */
export const ITEM_SUMMARY_FORBIDDEN_MESSAGE = "You need the Reports permission to see this. Ask the store owner.";
export const ITEM_SUMMARY_FAILED_MESSAGE = "The item summary couldn’t load. Check the connection and try again.";
/** Same wording as Profit's (lib/profit/profit-view.ts). */
export const ITEM_SUMMARY_PLATFORM_ONLY_MESSAGE =
  "Item summary is ready for stores on the new order system. Ask WebNegosyo support to move your store over.";
/** What the "Items not recorded" row stands for (the web's items breakdown). */
export const UNRECORDED_ITEM_DETAIL = "Orders saved without their dishes";

const SUMMARY_FN = "report_sales_summary";
const ITEMS_FN = "report_sales_by_item";
const UNASSIGNED_FILTER = "__unassigned__";

export interface ItemSummaryRow {
  /** `id:<menu item>`, `name:<folded name>` or `unrecorded`. */
  key: string;
  label: string;
  quantity: number;
  orders: number;
  netCents: number;
  isUnrecorded: boolean;
}

export interface ItemSummary {
  /** Live (not voided) orders in the period. */
  orders: number;
  /** Net sales — the total the rows are measured against. */
  netCents: number;
  /** Σ rows' net; equals `netCents` unless something is off. */
  itemsNetCents: number;
  quantity: number;
  ordersWithoutLines: number;
  ordersLinesMismatch: number;
  /** Highest net first. */
  rows: ItemSummaryRow[];
}

export interface ItemSummaryRequest {
  tenantId: string;
  /** Half-open [startMs, endMs). */
  startMs: number;
  endMs: number;
  /** One branch, or null for the whole store. */
  outletId: string | null;
  /** Only the orders with no branch ("Unassigned"). */
  isUnassigned: boolean;
}

export type ItemSummaryFailureKind = "forbidden" | "invalid" | "not_set_up" | "failed";

export type ItemSummaryFetch =
  | { ok: true; summary: ItemSummary }
  | { ok: false; kind: ItemSummaryFailureKind; message: string };

export interface ItemSummaryRpcPage {
  from: number;
  to: number;
}

interface RpcReply {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

export interface ItemSummaryRpcClient {
  rpc(fn: string, args: Record<string, unknown>, page?: ItemSummaryRpcPage): PromiseLike<RpcReply>;
}

// ---------------------------------------------------------------------------
// Pure parts

/** Consecutive windows of at most `maxDays`, tiling [startMs, endMs) exactly. */
export function splitReportWindow(
  startMs: number,
  endMs: number,
  maxDays: number = REPORT_MAX_WINDOW_DAYS,
): { startMs: number; endMs: number }[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const span = maxDays * DAY_MS;
  const count = Math.ceil((endMs - startMs) / span);
  return Array.from({ length: count }, (_, index) => ({
    startMs: startMs + index * span,
    endMs: Math.min(startMs + (index + 1) * span, endMs),
  }));
}

/** The Orders tab's branch pill → the report's branch arguments. */
export function itemSummaryBranchArgs(viewOutletId: string | null): { outletId: string | null; isUnassigned: boolean } {
  if (viewOutletId === UNASSIGNED_FILTER) return { outletId: null, isUnassigned: true };
  return { outletId: viewOutletId, isUnassigned: false };
}

export type ItemSummaryAccess = "hidden" | "unavailable" | "available";

/**
 * Whether the Orders tab offers the summary, and what it shows.
 *
 * Owner decision: whole-store sales need `reports`; without it the toggle is
 * not drawn at all (no locked tab to tease). Stores whose orders are not on
 * the platform get the toggle and an explanation — never ₱0.
 */
export function resolveItemSummaryAccess(input: {
  holder: StaffPermissionHolder;
  route: RefRoute;
  isDated: boolean;
}): ItemSummaryAccess {
  if (!input.isDated || input.route === "idle") return "hidden";
  if (!hasPermission(input.holder, "reports")) return "hidden";
  return input.route === "platform" ? "available" : "unavailable";
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** What the rows leave out or had to adjust, said above them (the web's LineCoverageNotes). */
export function itemSummaryNotes(summary: ItemSummary): string[] {
  const notes: string[] = [];
  const missing = summary.ordersWithoutLines;
  if (missing > 0) {
    notes.push(
      `${missing} ${plural(missing, "order was saved without its dishes. Its", "orders were saved without their dishes. Their")} ` +
        "sales are listed as “Items not recorded”, so the rows still add up to net sales.",
    );
  }
  const edited = summary.ordersLinesMismatch;
  if (edited > 0) {
    notes.push(
      `${edited} edited ${plural(edited, "order had", "orders had")} dish prices that no longer matched the bill. ` +
        `${plural(edited, "Its", "Their")} dishes were scaled to the bill, so items add up to net sales exactly.`,
    );
  }
  const gap = summary.itemsNetCents - summary.netCents;
  if (gap !== 0) {
    notes.push(
      `The dishes add up to ${formatPeso(summary.itemsNetCents / 100)}, ${formatPeso(Math.abs(gap) / 100)} ` +
        `${gap < 0 ? "less" : "more"} than net sales.`,
    );
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Parsing

function wholeNumber(row: Record<string, unknown>, key: string): number {
  const raw = row[key];
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`item summary: ${key} is not a whole number`);
  return value;
}

function asRows(data: unknown, what: string): Record<string, unknown>[] {
  if (!Array.isArray(data)) throw new Error(`item summary: ${what} is not a list`);
  return data.map((row) => {
    if (typeof row !== "object" || row === null) throw new Error(`item summary: ${what} row is not an object`);
    return row as Record<string, unknown>;
  });
}

interface WindowTotals {
  orders: number;
  netCents: number;
  ordersWithoutLines: number;
  ordersLinesMismatch: number;
}

function parseTotals(data: unknown): WindowTotals {
  const [row] = asRows(data, "summary");
  if (!row) throw new Error("item summary: the summary has no row");
  return {
    orders: wholeNumber(row, "orders"),
    netCents: wholeNumber(row, "net_cents"),
    ordersWithoutLines: wholeNumber(row, "orders_without_lines"),
    ordersLinesMismatch: wholeNumber(row, "orders_lines_mismatch"),
  };
}

function parseItem(row: Record<string, unknown>): ItemSummaryRow {
  if (typeof row.item_key !== "string" || row.item_key === "") throw new Error("item summary: item_key missing");
  const isUnrecorded = row.is_unrecorded === true;
  return {
    key: row.item_key,
    label: typeof row.label === "string" && row.label.trim() !== "" ? row.label : isUnrecorded ? "Items not recorded" : "Unnamed item",
    quantity: wholeNumber(row, "quantity"),
    orders: wholeNumber(row, "orders"),
    netCents: wholeNumber(row, "net_cents"),
    isUnrecorded,
  };
}

/** Same dish in two windows: figures add, the NEWER window's name wins (as the server names it). */
function mergeRows(older: ItemSummaryRow, newer: ItemSummaryRow): ItemSummaryRow {
  return {
    ...newer,
    quantity: older.quantity + newer.quantity,
    orders: older.orders + newer.orders,
    netCents: older.netCents + newer.netCents,
    isUnrecorded: older.isUnrecorded || newer.isUnrecorded,
  };
}

function byNetThenLabel(a: ItemSummaryRow, b: ItemSummaryRow): number {
  if (b.netCents !== a.netCents) return b.netCents - a.netCents;
  if (a.isUnrecorded !== b.isUnrecorded) return a.isUnrecorded ? 1 : -1;
  return a.label.localeCompare(b.label);
}

function combine(windows: readonly { totals: WindowTotals; rows: ItemSummaryRow[] }[]): ItemSummary {
  const byKey = windows
    .flatMap((window) => window.rows)
    .reduce((acc, row) => {
      const seen = acc.get(row.key);
      return new Map(acc).set(row.key, seen ? mergeRows(seen, row) : row);
    }, new Map<string, ItemSummaryRow>());
  const rows = [...byKey.values()].sort(byNetThenLabel);
  const sum = (pick: (totals: WindowTotals) => number) => windows.reduce((total, window) => total + pick(window.totals), 0);
  return {
    orders: sum((t) => t.orders),
    netCents: sum((t) => t.netCents),
    itemsNetCents: rows.reduce((total, row) => total + row.netCents, 0),
    quantity: rows.reduce((total, row) => total + row.quantity, 0),
    ordersWithoutLines: sum((t) => t.ordersWithoutLines),
    ordersLinesMismatch: sum((t) => t.ordersLinesMismatch),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Calls

type Step<T> = { ok: true; value: T } | { ok: false; kind: ItemSummaryFailureKind; message: string };

function fail(kind: ItemSummaryFailureKind, message: string): { ok: false; kind: ItemSummaryFailureKind; message: string } {
  return { ok: false, kind, message };
}

async function call<T>(
  client: ItemSummaryRpcClient,
  fn: string,
  args: Record<string, unknown>,
  parse: (data: unknown) => T,
  page?: ItemSummaryRpcPage,
): Promise<Step<T>> {
  let reply: RpcReply;
  try {
    reply = await withDeadline(Promise.resolve(client.rpc(fn, args, page)), ITEM_SUMMARY_REQUEST_MS);
  } catch {
    return fail("failed", ITEM_SUMMARY_FAILED_MESSAGE);
  }
  if (reply.error) {
    const { code, message } = reply.error;
    if (code === "42501") return fail("forbidden", ITEM_SUMMARY_FORBIDDEN_MESSAGE);
    // The functions' own range sentences are written for staff.
    if (code === "22023") return fail("invalid", message || ITEM_SUMMARY_FAILED_MESSAGE);
    if (code === "PGRST202" || code === "42883") return fail("not_set_up", ITEM_SUMMARY_FAILED_MESSAGE);
    console.warn(`[item-summary] ${fn} failed`, code, message);
    return fail("failed", ITEM_SUMMARY_FAILED_MESSAGE);
  }
  try {
    return { ok: true, value: parse(reply.data) };
  } catch (error) {
    console.warn(`[item-summary] ${fn} returned an unexpected shape`, error);
    return fail("failed", ITEM_SUMMARY_FAILED_MESSAGE);
  }
}

async function readItemPages(
  client: ItemSummaryRpcClient,
  args: Record<string, unknown>,
  from = 0,
  collected: readonly ItemSummaryRow[] = [],
): Promise<Step<ItemSummaryRow[]>> {
  const page = await call(client, ITEMS_FN, args, (data) => asRows(data, "items").map(parseItem), {
    from,
    to: from + ITEM_SUMMARY_PAGE_SIZE - 1,
  });
  if (!page.ok) return page;
  const rows = [...collected, ...page.value];
  if (page.value.length < ITEM_SUMMARY_PAGE_SIZE) return { ok: true, value: rows };
  return readItemPages(client, args, from + ITEM_SUMMARY_PAGE_SIZE, rows);
}

function windowArgs(request: ItemSummaryRequest, window: { startMs: number; endMs: number }): Record<string, unknown> {
  return {
    p_tenant: request.tenantId,
    p_from: new Date(window.startMs).toISOString(),
    p_to: new Date(window.endMs).toISOString(),
    // Defaults are left out, not sent as null: the functions' own defaults apply.
    ...(request.outletId ? { p_outlet: request.outletId } : {}),
    ...(request.isUnassigned && !request.outletId ? { p_unassigned: true } : {}),
  };
}

/** One window: its totals and every item row, read together. */
async function readWindow(
  client: ItemSummaryRpcClient,
  args: Record<string, unknown>,
): Promise<Step<{ totals: WindowTotals; rows: ItemSummaryRow[] }>> {
  const [totals, rows] = await Promise.all([call(client, SUMMARY_FN, args, parseTotals), readItemPages(client, args)]);
  if (!totals.ok) return totals;
  if (!rows.ok) return rows;
  return { ok: true, value: { totals: totals.value, rows: rows.value } };
}

/**
 * The item summary for a period. Windows are read one after another (the
 * platform database is shared by every store), and the first failure stops it.
 */
export async function fetchItemSummary(
  request: ItemSummaryRequest,
  client: ItemSummaryRpcClient,
): Promise<ItemSummaryFetch> {
  const windows = splitReportWindow(request.startMs, request.endMs);
  if (windows.length === 0) return fail("invalid", "Pick the days to add up.");
  const read: { totals: WindowTotals; rows: ItemSummaryRow[] }[] = [];
  for (const window of windows) {
    const result = await readWindow(client, windowArgs(request, window));
    if (!result.ok) return result;
    read.push(result.value);
  }
  return { ok: true, summary: combine(read) };
}
