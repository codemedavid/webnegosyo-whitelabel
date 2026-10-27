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
import type { ShiftSalesPayment, ShiftSalesReport, ShiftSalesSummary } from "../cash/shift-sales";
import {
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

export interface ShiftReportSlipOptions {
  storeName: string;
  branchName?: string;
  width: SlipWidth;
  printedAt: Date;
}

export const SHIFT_REPORT_TITLE = "SHIFT REPORT";
export const HIDDEN_TOTALS_LINE = "Totals stay hidden until the drawer is counted.";
export const NO_TOTALS_LINE = "Sales totals are not available here.";

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
  ];
}

function totalsLines(summary: ShiftSalesSummary, w: SlipWidth): string[] {
  const optional = (label: string, cents: number) => (cents !== 0 ? [leftRight(label, slipMoney(cents), w)] : []);
  return [
    leftRight("Orders", String(summary.orders), w),
    leftRight("Gross sales", slipMoney(summary.grossCents), w),
    leftRight("Discounts", slipMoney(-summary.discountCents), w),
    `<B>${leftRight("NET SALES", slipMoney(summary.netCents), w)}</B>`,
    ...optional("Service charge", summary.serviceChargeCents),
    ...optional("Delivery", summary.deliveryCents),
    leftRight("Collected", slipMoney(summary.collectedCents), w),
    leftRight("Unpaid", slipMoney(summary.unpaidCents), w),
    ...optional("Overpaid", summary.overpaidCents),
  ];
}

function paidByLines(payments: readonly ShiftSalesPayment[], w: SlipWidth): string[] {
  if (payments.length === 0) return [sectionLabel("PAID BY"), "  No payments"];
  return [
    sectionLabel("PAID BY"),
    ...payments.map((p) => labelCountAmount(slipSafe(p.label), String(p.count), slipMoney(p.cents), w)),
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

function bareNumber(number: string | null): string | null {
  const text = slipSafe(number).replace(/^#/, "");
  return text ? `#${text}` : null;
}

/** "#01 - #42" + how many receipts; works the same in hidden mode (no money in it). */
function receiptLines(report: ShiftSalesReport, w: SlipWidth): string[] {
  const first = bareNumber(report.firstNumber ?? report.receipts[0]?.number ?? null);
  const last = bareNumber(report.lastNumber ?? report.receipts[report.receipts.length - 1]?.number ?? null);
  const count = report.summary?.orders ?? report.receipts.length;
  const countText = report.summary || !report.receiptsTruncated ? String(count) : `${count}+`;
  if (count === 0 || !first) return [divider(w), leftRight("Receipts", "none", w)];
  const range = first === last || !last ? first : `${first} - ${last}`;
  return [divider(w), leftRight("Receipts", range, w), leftRight("Receipt count", countText, w)];
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

/** The shift report as lines (exported for the on-screen preview and tests). */
export function shiftReportLines(report: ShiftSalesReport, opts: ShiftReportSlipOptions): string[] {
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
