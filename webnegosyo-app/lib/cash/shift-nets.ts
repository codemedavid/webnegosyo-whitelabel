/**
 * Net sales per shift for the cashier's "My shifts" list, from
 * `report_shift_nets` (20261104140000): each shift's OWN sales (cashier
 * scope, the same figures as her shift report), one call for the page.
 * A shift the database left out (not hers, not readable) has no row; the
 * list then says nothing about its money rather than ₱0.
 */

import { callReportRpc, liveReportClient, type ReportRpcResult, type ShiftSalesRpcClient } from "./shift-sales";

export type ShiftNetStatus = "ok" | "hidden" | "unavailable" | "too_long";

const STATUSES: readonly ShiftNetStatus[] = ["ok", "hidden", "unavailable", "too_long"];

export interface ShiftNet {
  status: ShiftNetStatus;
  /** Null unless status is ok. */
  orders: number | null;
  netCents: number | null;
}

/** The database answers at most this many shifts per call. */
export const SHIFT_NETS_LIMIT = 31;

type Row = Record<string, unknown>;

function wholeOrNull(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number)) throw new Error(`${key}: not a whole number (${String(value)})`);
  return number;
}

/** `{shifts: [...]}` → shift id → its net. Throws on a bad shape. */
export function parseShiftNets(data: unknown): ReadonlyMap<string, ShiftNet> {
  if (!data || typeof data !== "object" || !Array.isArray((data as Row).shifts)) throw new Error("shift nets: no shifts list");
  const rows = (data as { shifts: unknown[] }).shifts;
  return new Map(
    rows.map((entry) => {
      if (!entry || typeof entry !== "object") throw new Error("shift nets: not an object");
      const row = entry as Row;
      if (typeof row.shiftId !== "string") throw new Error("shiftId: not text");
      if (!(STATUSES as readonly unknown[]).includes(row.status)) throw new Error(`status: unknown (${String(row.status)})`);
      const status = row.status as ShiftNetStatus;
      const orders = wholeOrNull(row, "orders");
      const netCents = wholeOrNull(row, "netCents");
      return [row.shiftId, status === "ok" ? { status, orders, netCents } : { status, orders: null, netCents: null }];
    }),
  );
}

/** The nets of up to SHIFT_NETS_LIMIT shifts (the first ones given). No shifts = no call. */
export async function fetchShiftNets(
  shiftIds: readonly string[],
  client: ShiftSalesRpcClient = liveReportClient,
): Promise<ReportRpcResult<ReadonlyMap<string, ShiftNet>>> {
  if (shiftIds.length === 0) return { ok: true, value: new Map() };
  return callReportRpc(client, "report_shift_nets", { p_shift_ids: shiftIds.slice(0, SHIFT_NETS_LIMIT) }, parseShiftNets);
}
