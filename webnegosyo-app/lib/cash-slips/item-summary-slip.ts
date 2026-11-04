// ITEM SUMMARY: the paper an owner prints from Order History — what sold in
// the picked days, one dish per line (quantity and net sales), so a day's take
// can be checked against the kitchen and the stockroom.
//
// Figures come straight from the item summary (report_sales_by_item +
// report_sales_summary); nothing is added up here. The total is the summary's
// net sales, never a sum of the printed lines. Like the other cash slips it is
// a store paper, not an official receipt.

import type { PrintSegment } from "../printer";
import type { ItemSummary, ItemSummaryRow } from "../reports/item-summary";
import { itemSummaryNotes } from "../reports/item-summary";
import {
  divider,
  labelCountAmount,
  leftRight,
  slipBusinessDay,
  slipFooter,
  slipHeader,
  slipMoney,
  slipSafe,
  toSlipSegments,
  wrap,
  type SlipWidth,
} from "./slip-text";

export interface ItemSummarySlipOptions {
  storeName: string;
  branchName?: string;
  /** The picked business days, "YYYY-MM-DD", both ends inclusive. */
  fromKey: string;
  toKey: string;
  width: SlipWidth;
  printedAt: Date;
}

export const ITEM_SUMMARY_TITLE = "ITEM SUMMARY";
export const NO_SALES_LINE = "No sales in this period.";

/** Columns the count + amount take at the right of a `labelCountAmount` line. */
function figuresWidth(width: SlipWidth): number {
  return 4 + 2 + (width === 48 ? 14 : 11);
}

function periodLines(opts: ItemSummarySlipOptions): string[] {
  const w = opts.width;
  if (opts.fromKey === opts.toKey) return [leftRight("Business day", slipBusinessDay(opts.fromKey), w)];
  return [leftRight("From", slipBusinessDay(opts.fromKey), w), leftRight("To", slipBusinessDay(opts.toKey), w)];
}

/**
 * A dish: the name wraps at the full paper width; the figures sit on its last
 * line when that line leaves room for them, else on a line of their own.
 */
function rowLines(row: ItemSummaryRow, w: SlipWidth): string[] {
  const room = w - figuresWidth(w) - 1;
  const nameLines = wrap(slipSafe(row.label) || "Unnamed item", w);
  const last = nameLines[nameLines.length - 1] ?? "";
  const quantity = row.isUnrecorded ? "-" : String(row.quantity);
  const figures = (label: string) => labelCountAmount(label, quantity, slipMoney(row.netCents), w);
  if (last.length <= room) return [...nameLines.slice(0, -1), figures(last)];
  return [...nameLines, figures("")];
}

function tableLines(summary: ItemSummary, w: SlipWidth): string[] {
  if (summary.rows.length === 0) return [...wrap(NO_SALES_LINE, w)];
  return [labelCountAmount("ITEM", "QTY", "AMOUNT", w), ...summary.rows.flatMap((row) => rowLines(row, w))];
}

/** The slip as lines (exported for the tests and any on-screen preview). */
export function itemSummaryLines(summary: ItemSummary, opts: ItemSummarySlipOptions): string[] {
  const w = opts.width;
  const notes = itemSummaryNotes(summary).flatMap((note) => wrap(slipSafe(note), w));
  return [
    ...slipHeader(opts.storeName, opts.branchName, ITEM_SUMMARY_TITLE, w),
    divider(w),
    ...periodLines(opts),
    leftRight("Orders", String(summary.orders), w),
    divider(w),
    ...tableLines(summary, w),
    divider(w),
    `<B>${labelCountAmount("NET SALES", String(summary.quantity), slipMoney(summary.netCents), w)}</B>`,
    ...(notes.length > 0 ? [divider(w), ...notes] : []),
    ...slipFooter(w, opts.printedAt),
  ];
}

/** ITEM SUMMARY → the one text segment `printForRole("cashier", …)` takes. */
export function buildItemSummarySlip(summary: ItemSummary, opts: ItemSummarySlipOptions): PrintSegment[] {
  return toSlipSegments(itemSummaryLines(summary, opts));
}
