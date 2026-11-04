// SHIFT REPORT, the cashier's own (report_shift_sales p_scope 'cashier'): the
// paper she prints at the end of her shift — HER sales only, every item she
// sold with quantity and amount, her voids, her drawer, and two signature
// lines for the hand-over. "So far" while the shift runs, "Closed" after.
//
// Figures come straight from the server (or the tablet's own count, labelled);
// nothing is added up here except "Items total", the sum of the item lines,
// which the server guarantees equals net sales. Blind and not yet counted:
// no money at all. Never titled "X-READING" (06 §8: nothing here is
// BIR-accredited).

import type { ShiftSalesCash, ShiftSalesItem, ShiftSalesReport, ShiftSalesVoid } from "../cash/shift-sales";
import { HIDDEN_TOTALS_LINE, NO_TOTALS_LINE, paidByLines, receiptLines, totalsLines } from "./shift-report-parts";
import {
  DEVICE_SOURCE_LINE,
  center,
  divider,
  labelCountAmount,
  leftRight,
  sectionLabel,
  slipBusinessDay,
  slipHeader,
  slipMoney,
  slipSafe,
  slipStamp,
  slipTime,
  slipTimeWithDay,
  wrap,
  type SlipWidth,
} from "./slip-text";

export interface CashierSlipOptions {
  storeName: string;
  branchName?: string;
  width: SlipWidth;
  printedAt: Date;
  title: string;
}

export const ITEMS_UNAVAILABLE_LINE = "Items not available for this store.";
export const ITEMS_TRUNCATED_LINE = "Only the 500 most sold are listed.";
export const OPEN_LABEL = "So far";
export const CLOSED_LABEL = "Closed";
export const OTHER_BILLS_NOTE = "Taken on bills rung earlier or by others. Already in cash sales.";
const NARROW: SlipWidth = 32;
const ITEM_INDENT = "   ";

/** 5 → "5", 1.5 → "1.5", 0.333 → "0.33". */
export function slipQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)));
}

/** Most sold first, then by sales, then by name — the order she checks her stack in. */
export function sortItemsForSlip(items: readonly ShiftSalesItem[]): ShiftSalesItem[] {
  return [...items].sort((a, b) => b.quantity - a.quantity || b.netCents - a.netCents || a.label.localeCompare(b.label));
}

function isOpen(report: ShiftSalesReport): boolean {
  return report.shift ? report.shift.closedAt === null : false;
}

function headLines(report: ShiftSalesReport, opts: CashierSlipOptions): string[] {
  const w = opts.width;
  const shift = report.shift;
  return [
    ...slipHeader(opts.storeName, opts.branchName, opts.title, w),
    center(isOpen(report) ? OPEN_LABEL : CLOSED_LABEL, w),
    divider(w),
    leftRight("Cashier", slipSafe(shift?.staffName) || "--", w),
    leftRight("Drawer", slipSafe(shift?.drawerName) || "--", w),
    ...(shift?.businessDay ? [leftRight("Business day", slipBusinessDay(shift.businessDay), w)] : []),
    leftRight("Opened", slipTimeWithDay(shift?.openedAt ?? report.window.from), w),
    leftRight("Closed", shift?.closedAt ? slipTimeWithDay(shift.closedAt) : "still open", w),
    leftRight("Printed", slipStamp(opts.printedAt), w),
    ...(report.source === "device" ? [DEVICE_SOURCE_LINE] : []),
  ];
}

function differenceLine(cash: ShiftSalesCash, w: SlipWidth): string[] {
  if (cash.differenceCents === null) return [];
  if (cash.differenceCents === 0) return [leftRight("EXACT", "0.00", w)];
  const label = cash.differenceCents < 0 ? "SHORT" : "OVER";
  return [`<B>${leftRight(label, slipMoney(Math.abs(cash.differenceCents)), w)}</B>`];
}

function cashLines(report: ShiftSalesReport, w: SlipWidth): string[] {
  const cash = report.cash;
  if (!cash) return [];
  const optional = (label: string, cents: number, sign: 1 | -1) => (cents > 0 ? [leftRight(label, slipMoney(sign * cents), w)] : []);
  const other = report.otherCollections;
  return [
    divider(w),
    sectionLabel("CASH IN DRAWER"),
    leftRight("Starting cash", slipMoney(cash.floatCents), w),
    leftRight("Cash sales", slipMoney(cash.cashSalesCents), w),
    ...optional("Paid in", cash.payInCents, 1),
    ...optional("Paid out", cash.payOutCents, -1),
    ...optional("Pickups", cash.collectedCents, -1),
    leftRight("Should be in drawer", slipMoney(cash.expectedCents), w),
    ...(cash.expectedSource === "device" ? [center(DEVICE_SOURCE_LINE, w)] : []),
    leftRight("Counted", cash.countedCents === null ? "not yet" : slipMoney(cash.countedCents), w),
    ...differenceLine(cash, w),
    ...(other && other.count > 0
      ? [labelCountAmount("Other bills", String(other.count), slipMoney(other.cents), w), ...wrap(OTHER_BILLS_NOTE, w, "  ")]
      : []),
  ];
}

function itemLines(item: ShiftSalesItem, w: SlipWidth): string[] {
  const name = slipSafe(item.label) || "Item";
  const qty = `x${slipQuantity(item.quantity)}`;
  const amount = slipMoney(item.netCents);
  if (w === NARROW) return [...wrap(name, w), leftRight(`${ITEM_INDENT}${qty}`, amount, w)];
  return [leftRight(name, `${qty.padStart(6)}  ${amount.padStart(12)}`, w)];
}

function itemsSection(report: ShiftSalesReport, w: SlipWidth): string[] {
  if (report.hidden) return [];
  const head = [divider(w), sectionLabel("ITEMS SOLD")];
  if (!report.items) return [...head, ...wrap(ITEMS_UNAVAILABLE_LINE, w)];
  if (report.items.length === 0) return [...head, "  No items"];
  const items = sortItemsForSlip(report.items);
  const total = items.reduce((sum, item) => sum + item.netCents, 0);
  return [
    ...head,
    ...items.flatMap((item) => itemLines(item, w)),
    divider(w),
    `<B>${leftRight("Items total", slipMoney(total), w)}</B>`,
    ...(report.itemsTruncated ? wrap(ITEMS_TRUNCATED_LINE, w) : []),
  ];
}

function voidLine(entry: ShiftSalesVoid, w: SlipWidth): string {
  const left = `${slipSafe(entry.number)}  ${slipTime(entry.placedAt)}${entry.status === "refunded" ? "  refund" : ""}`;
  return entry.totalCents === null ? left : leftRight(left, slipMoney(entry.totalCents), w);
}

function voidsSection(report: ShiftSalesReport, w: SlipWidth): string[] {
  const voids = report.voids;
  if (!voids) return [];
  if (voids.length === 0) return [divider(w), sectionLabel("VOIDS"), "  No voids"];
  return [
    divider(w),
    sectionLabel("VOIDS"),
    ...voids.map((entry) => voidLine(entry, w)),
    ...(report.voidsTruncated ? wrap("More voids are not listed.", w) : []),
  ];
}

function moneyLines(report: ShiftSalesReport, w: SlipWidth): string[] {
  if (report.hidden) return [divider(w), ...wrap(HIDDEN_TOTALS_LINE, w)];
  if (!report.summary) return [divider(w), ...wrap(NO_TOTALS_LINE, w)];
  return [
    divider(w),
    ...totalsLines(report.summary, w),
    ...(report.payments ? [divider(w), ...paidByLines(report.payments, w)] : []),
    ...cashLines(report, w),
  ];
}

function signatureLines(w: SlipWidth): string[] {
  const line = "_".repeat(w - 2);
  return [divider(w), "Cashier signature:", "", line, "", "Checked by:", "", line];
}

function footerLines(w: SlipWidth): string[] {
  return [divider(w), center("Not an official receipt.", w), center("For store use.", w)];
}

/** The cashier's SHIFT REPORT as lines (the on-screen preview shows exactly these). */
export function cashierShiftReportLines(report: ShiftSalesReport, opts: CashierSlipOptions): string[] {
  const w = opts.width;
  return [
    ...headLines(report, opts),
    ...moneyLines(report, w),
    ...itemsSection(report, w),
    ...voidsSection(report, w),
    ...receiptLines(report, w),
    ...signatureLines(w),
    ...footerLines(w),
  ];
}
