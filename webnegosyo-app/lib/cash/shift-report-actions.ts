/**
 * What the "Print shift report" buttons say, and what each row of My shifts
 * shows. Pure: the components print and read; this words it.
 */

import { formatPeso } from "../expenses/keypad";
import { formatClock, formatDayLabel } from "../staff-format";
import type { ShiftRecord } from "../shift-service";
import type { ShiftNet } from "./shift-nets";
import type { ShiftSalesFetch, ShiftSalesReport } from "./shift-sales";

export type PrintState =
  | { status: "idle" }
  | { status: "printing" }
  | { status: "printed" }
  | { status: "failed"; message: string };

export const PRINTED_TEXT = "Printed. Sign it and hand it over with the cash.";
/** After reprinting an OLD shift there is no cash to hand over. */
export const REPRINTED_TEXT = "Printed.";
export const PRINTING_TEXT = "Printing…";

/** The line under the button; null when there is nothing to say. */
export function printStateText(state: PrintState, printedText: string = PRINTED_TEXT): string | null {
  if (state.status === "printing") return PRINTING_TEXT;
  if (state.status === "printed") return printedText;
  if (state.status === "failed") return state.message;
  return null;
}

/** "3 sales · ₱1,170.50", or why there are no pesos — never ₱0 for unknown. */
export function reportSummaryLine(report: ShiftSalesReport): string {
  if (report.hidden) return "Totals show once you count the drawer.";
  if (!report.summary) return "Sales totals are not available here.";
  const { orders, netCents } = report.summary;
  return `${orders} ${orders === 1 ? "sale" : "sales"} · ${formatPeso(netCents)}`;
}

/**
 * Whether the server answered with a report this card can print on the spot.
 * Anything else (store not on the platform, database not updated yet, no
 * connection) opens the Shift sales screen, which counts her sales on the
 * tablet and prints from there.
 */
export function printableReport(fetch: ShiftSalesFetch | null): ShiftSalesReport | null {
  if (!fetch || !fetch.ok || fetch.reply.kind !== "report") return null;
  return fetch.reply.report;
}

export interface MyShiftRow {
  id: string;
  day: string;
  times: string;
  /** "₱1,170.50 · 3 sales", "Hidden until counted", "See report" or "Adding up…". */
  net: string;
  isOpen: boolean;
}

function netText(net: ShiftNet | undefined, isLoading: boolean): string {
  if (!net) return isLoading ? "Adding up…" : "See report";
  if (net.status === "hidden") return "Hidden until counted";
  if (net.status !== "ok" || net.netCents === null) return "See report";
  const orders = net.orders ?? 0;
  return `${formatPeso(net.netCents)} · ${orders} ${orders === 1 ? "sale" : "sales"}`;
}

/** One My shifts row: the business day (or the opening day), the hours, and her net. */
export function myShiftRow(
  shift: Pick<ShiftRecord, "id" | "openedAt" | "closedAt" | "status"> & { businessDay?: string | null },
  net: ShiftNet | undefined,
  opts: { nowIso: string; isLoading: boolean; dayKeyOf: (iso: string) => string },
): MyShiftRow {
  const dayKey = shift.businessDay ?? opts.dayKeyOf(shift.openedAt);
  return {
    id: shift.id,
    day: formatDayLabel(dayKey, opts.nowIso),
    times: `${formatClock(shift.openedAt)} – ${shift.closedAt ? formatClock(shift.closedAt) : "now"}`,
    net: netText(net, opts.isLoading),
    isOpen: shift.status === "open",
  };
}
