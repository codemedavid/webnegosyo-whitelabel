// SHIFT REPORT: the paper a cashier or owner prints for one shift (or one
// named service period): when, who, which drawer, what sold, how it was paid,
// order types, voids and the receipt range — so a merchant who hand-counts
// receipts per shift can check the stack against one slip.
//
// Figures come straight from the ONE sales definition (report_shift_sales /
// report_period_sales, CONTRACTS §4); nothing is added up here. Unknown is
// printed as unknown, never as 0. A hidden (blind) report prints no money at
// all — only the receipt range and count. Never titled "X-READING": nothing in
// the platform is BIR-accredited (06 §8).

import type { PrintSegment } from "../printer";
import type { ShiftSalesReport, ShiftSalesSummary } from "../cash/shift-sales";
import { cashierShiftReportLines } from "./shift-report-cashier";
import { HIDDEN_TOTALS_LINE, NO_TOTALS_LINE, paidByLines, receiptLines, totalsLines } from "./shift-report-parts";
import {
  DEVICE_SOURCE_LINE,
  divider,
  labelCountAmount,
  leftRight,
  sectionLabel,
  slipBusinessDay,
  slipFooter,
  slipHeader,
  slipMoney,
  slipSafe,
  slipWindow,
  toSlipSegments,
  wrap,
  type SlipWidth,
} from "./slip-text";

export { HIDDEN_TOTALS_LINE, NO_TOTALS_LINE };

export interface ShiftReportSlipOptions {
  storeName: string;
  branchName?: string;
  width: SlipWidth;
  printedAt: Date;
}

export const SHIFT_REPORT_TITLE = "SHIFT REPORT";

function whoLines(report: ShiftSalesReport, w: SlipWidth): string[] {
  const shift = report.shift;
  const businessDay = shift?.businessDay ?? null;
  const from = shift?.openedAt ?? report.window.from;
  const to = shift ? shift.closedAt : report.window.to;
  const period = slipSafe(shift?.servicePeriodName);
  return [
    ...(businessDay ? [leftRight("Business day", slipBusinessDay(businessDay), w)] : []),
    leftRight(shift ? "Shift" : "Window", slipWindow(from, to), w),
    ...(period ? [leftRight("Service period", period, w)] : []),
    ...(shift ? [leftRight("Cashier", slipSafe(shift.staffName) || "--", w)] : []),
    ...(shift ? [leftRight("Drawer", slipSafe(shift.drawerName) || "--", w)] : []),
    ...(report.source === "device" ? [DEVICE_SOURCE_LINE] : []),
  ];
}

function orderTypeLines(report: ShiftSalesReport, w: SlipWidth): string[] {
  const types = report.orderTypes ?? [];
  if (types.length === 0) return [];
  return [
    divider(w),
    sectionLabel("ORDER TYPES"),
    ...types.map((t) => labelCountAmount(slipSafe(t.label), String(t.orders), slipMoney(t.netCents), w)),
  ];
}

function voidLines(summary: ShiftSalesSummary, w: SlipWidth): string[] {
  return [
    divider(w),
    labelCountAmount("Voids", String(summary.voidCount), slipMoney(summary.voidCents), w),
    leftRight("Discounts given", slipMoney(summary.discountCents), w),
    leftRight("Refunds", slipMoney(summary.refundCents), w),
  ];
}

function moneyLines(report: ShiftSalesReport, w: SlipWidth): string[] {
  if (report.hidden) return [divider(w), ...wrap(HIDDEN_TOTALS_LINE, w)];
  if (!report.summary) return [divider(w), ...wrap(NO_TOTALS_LINE, w)];
  return [
    divider(w),
    ...totalsLines(report.summary, w),
    ...(report.payments ? [divider(w), ...paidByLines(report.payments, w)] : []),
    ...orderTypeLines(report, w),
    ...voidLines(report.summary, w),
  ];
}

/**
 * The shift report as lines (exported for the on-screen preview and tests).
 * A cashier-scope report (her own sales) prints the end-of-shift layout:
 * items sold, voids, her drawer and signature lines.
 */
export function shiftReportLines(report: ShiftSalesReport, opts: ShiftReportSlipOptions): string[] {
  if (report.scope === "cashier") return cashierShiftReportLines(report, { ...opts, title: SHIFT_REPORT_TITLE });
  const w = opts.width;
  return [
    ...slipHeader(opts.storeName, opts.branchName, SHIFT_REPORT_TITLE, w),
    divider(w),
    ...whoLines(report, w),
    ...moneyLines(report, w),
    ...receiptLines(report, w),
    ...slipFooter(w, opts.printedAt),
  ];
}

/** SHIFT REPORT → the one text segment `printForRole("cashier", …)` takes. */
export function buildShiftReportSlip(report: ShiftSalesReport, opts: ShiftReportSlipOptions): PrintSegment[] {
  return toSlipSegments(shiftReportLines(report, opts));
}
