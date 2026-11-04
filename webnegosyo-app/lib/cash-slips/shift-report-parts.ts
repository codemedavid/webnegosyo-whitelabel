// Pieces shared by the two SHIFT REPORT layouts (the store's window and one
// cashier's own sales, shift-report-cashier.ts), so both print totals, PAID BY
// and the receipt range the same way.

import type { ShiftSalesPayment, ShiftSalesReport, ShiftSalesSummary } from "../cash/shift-sales";
import { divider, labelCountAmount, leftRight, sectionLabel, slipMoney, slipSafe, type SlipWidth } from "./slip-text";

export const HIDDEN_TOTALS_LINE = "Totals stay hidden until the drawer is counted.";
export const NO_TOTALS_LINE = "Sales totals are not available here.";

export function totalsLines(summary: ShiftSalesSummary, w: SlipWidth): string[] {
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

export function paidByLines(payments: readonly ShiftSalesPayment[], w: SlipWidth): string[] {
  if (payments.length === 0) return [sectionLabel("PAID BY"), "  No payments"];
  return [
    sectionLabel("PAID BY"),
    ...payments.map((p) => labelCountAmount(slipSafe(p.label), String(p.count), slipMoney(p.cents), w)),
  ];
}

export function bareNumber(number: string | null): string | null {
  const text = slipSafe(number).replace(/^#/, "");
  return text ? `#${text}` : null;
}

/** "#01 - #42" + how many receipts; works the same in hidden mode (no money in it). */
export function receiptLines(report: ShiftSalesReport, w: SlipWidth): string[] {
  const first = bareNumber(report.firstNumber ?? report.receipts[0]?.number ?? null);
  const last = bareNumber(report.lastNumber ?? report.receipts[report.receipts.length - 1]?.number ?? null);
  const count = report.summary?.orders ?? report.receipts.length;
  const countText = report.summary || !report.receiptsTruncated ? String(count) : `${count}+`;
  if (count === 0 || !first) return [divider(w), leftRight("Receipts", "none", w)];
  const range = first === last || !last ? first : `${first} - ${last}`;
  return [divider(w), leftRight("Receipts", range, w), leftRight("Receipt count", countText, w)];
}

