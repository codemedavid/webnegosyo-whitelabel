/**
 * What the Shift sales screen says, decided outside the components so the
 * words and the figures can be tested: the header, the hero's lines, the
 * "Paid by" bars, the receipt search and pills, the blind (hidden) copy and
 * the "My drawer" lens. Unknown is always words ("Not loaded"), never ₱0.
 * Pure.
 */

import { formatPeso } from "../expenses/keypad";
import { formatClock, formatDayLabel } from "../staff-format";
import type { CounterSalesSummary } from "../pos-sales";
import type { IconName } from "../../components/Icon";
import type {
  ShiftReceiptStatus,
  ShiftSalesPayment,
  ShiftSalesReceipt,
  ShiftSalesReport,
  ShiftSalesShift,
  ShiftSalesSource,
} from "./shift-sales";

export const NOT_LOADED = "Not loaded";
export const HIDDEN_TITLE = "Hidden until you count";
export const HIDDEN_MESSAGE =
  "Your owner hides the sales totals until you count your drawer. Receipts and counts are below.";

/** "Day shift" when the shift is a named service period, else "Shift". */
export function shiftSalesTitle(shift: ShiftSalesShift | null, periodName: string | null): string {
  return shift?.servicePeriodName?.trim() || periodName?.trim() || "Shift";
}

/** "12:02 PM – now" / "12:02 PM – 8:01 PM". */
export function shiftWindowText(from: string, to: string | null): string {
  return `${formatClock(from)} – ${to ? formatClock(to) : "now"}`;
}

/** "Today · 12:02 PM – now · Ana · Cashier 1" — one line under the title. */
export function shiftSalesSubtitle(report: ShiftSalesReport, nowIso: string, dayKey: string | null): string {
  const shift = report.shift;
  const day = shift?.businessDay ?? dayKey;
  const isOpen = shift ? shift.closedAt === null : false;
  const parts = [
    day ? formatDayLabel(day, nowIso) : null,
    shiftWindowText(shift?.openedAt ?? report.window.from, isOpen ? null : shift?.closedAt ?? report.window.to),
    shift?.staffName ?? null,
    shift?.drawerName ?? null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** "Counted on this tablet" etc. — said whenever the figures are not the store's report. */
export function sourceNote(source: ShiftSalesSource): string | null {
  if (source === "device") return "Counted on this tablet";
  if (source === "sample") return "Sample shift · demo store";
  return null;
}

/** "#01 – #37 · 37 receipts" (works in hidden mode: no money in it). */
export function receiptRangeText(report: ShiftSalesReport): string {
  const count = report.summary ? report.summary.orders + report.summary.voidCount : report.receipts.length;
  const counted = `${count}${report.receiptsTruncated && !report.summary ? "+" : ""} ${count === 1 ? "receipt" : "receipts"}`;
  if (!report.firstNumber) return count === 0 ? "No receipts yet" : counted;
  const range = report.lastNumber && report.lastNumber !== report.firstNumber ? `${report.firstNumber} – ${report.lastNumber}` : report.firstNumber;
  return `${range} · ${counted}`;
}

export interface HeroLine {
  key: string;
  label: string;
  value: string;
  /** Draws the value in the ink hero's warning tint (with words, never colour alone). */
  isAttention: boolean;
}

/** The hero's three facts under net sales. */
export function heroLines(report: ShiftSalesReport): HeroLine[] {
  const summary = report.summary;
  if (!summary) return [];
  const voids = summary.voidCount === 0 ? "No voids" : `${summary.voidCount} ${summary.voidCount === 1 ? "void" : "voids"} ${formatPeso(summary.voidCents)}`;
  return [
    { key: "discounts", label: "Discounts · voids", value: `${formatPeso(summary.discountCents)} · ${voids}`, isAttention: false },
    {
      key: "unpaid",
      label: "Still unpaid",
      value: summary.unpaidCents > 0 ? formatPeso(summary.unpaidCents) : "Nothing unpaid",
      isAttention: summary.unpaidCents > 0,
    },
    ...(summary.refundCents > 0
      ? [{ key: "refunds", label: "Change handed back", value: formatPeso(summary.refundCents), isAttention: false }]
      : []),
  ];
}

export interface PaidByRow {
  key: string;
  label: string;
  amount: string;
  /** "14 payments". */
  meta: string;
  /** 0..1 of the largest bucket, for the bar. */
  fraction: number;
  /** "38%" of what was collected, said next to the bar. */
  share: string;
}

export function paidByRows(payments: readonly ShiftSalesPayment[]): PaidByRow[] {
  const positive = payments.filter((p) => p.cents > 0);
  const total = positive.reduce((sum, p) => sum + p.cents, 0);
  const largest = Math.max(0, ...positive.map((p) => p.cents));
  return payments.map((p) => ({
    key: p.key,
    label: p.label,
    amount: formatPeso(p.cents),
    meta: `${p.count} ${p.count === 1 ? "payment" : "payments"}`,
    fraction: largest > 0 ? Math.max(0, p.cents) / largest : 0,
    share: total > 0 && p.cents > 0 ? `${Math.round((p.cents / total) * 100)}%` : "",
  }));
}

export interface ReceiptPill {
  label: string;
  icon: IconName;
  tone: "success" | "warning" | "danger" | "neutral";
}

/** Word + icon + tint: a status is never told by colour alone. */
export const RECEIPT_PILLS: Readonly<Record<ShiftReceiptStatus, ReceiptPill>> = {
  paid: { label: "Paid", icon: "check", tone: "success" },
  unpaid: { label: "Unpaid", icon: "clock", tone: "warning" },
  void: { label: "Void", icon: "close", tone: "danger" },
  refunded: { label: "Refunded", icon: "undo", tone: "neutral" },
};

function digitsOf(text: string): string {
  return text.replace(/[^0-9.]/g, "");
}

/** Does a typed amount ("350", "₱1,250.50") match these centavos? */
function matchesAmount(query: string, cents: number | null): boolean {
  if (cents === null) return false;
  const typed = digitsOf(query);
  if (!typed || !/^\d+(\.\d{1,2})?$/.test(typed)) return false;
  return Math.round(Number(typed) * 100) === cents;
}

/** Does a typed number ("12", "#12", "012") match "#12"? */
function matchesNumber(query: string, number: string): boolean {
  const typed = query.replace(/^#/, "").trim().toUpperCase();
  if (!typed) return false;
  const bare = number.replace(/^#/, "").toUpperCase();
  if (/^\d+$/.test(typed) && /^\d+$/.test(bare)) return Number(typed) === Number(bare);
  return bare.startsWith(typed);
}

/** Newest first, narrowed by a receipt number or an exact amount. */
export function searchReceipts(receipts: readonly ShiftSalesReceipt[], query: string): ShiftSalesReceipt[] {
  const newestFirst = [...receipts].sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
  const trimmed = query.trim();
  if (!trimmed) return newestFirst;
  return newestFirst.filter((r) => matchesNumber(trimmed, r.number) || matchesAmount(trimmed, r.totalCents));
}

/** "Dine-in · Cash" under a receipt's number. */
export function receiptMeta(receipt: ShiftSalesReceipt): string {
  return [formatClock(receipt.placedAt), receipt.orderTypeLabel, receipt.methodLabel].filter(Boolean).join(" · ");
}

export function receiptAmount(receipt: ShiftSalesReceipt, hidden: boolean): string {
  if (receipt.totalCents === null) return hidden ? "Hidden" : "—";
  return formatPeso(receipt.totalCents);
}

export interface DrawerLens {
  cashCents: number;
  nonCashCents: number;
  changeCents: number;
  refundCents: number;
  sales: number;
}

/** The cashier's own drawer (the Drawer's summary, pesos) in centavos. */
export function drawerLens(summary: CounterSalesSummary): DrawerLens {
  const cents = (pesos: number) => Math.round(pesos * 100);
  return {
    cashCents: cents(summary.cashTotal),
    nonCashCents: cents(summary.nonCashTotal),
    changeCents: cents(summary.changeGiven),
    refundCents: cents(summary.refundsPaid),
    sales: summary.saleCount,
  };
}

export const RECEIPTS_TRUNCATED_NOTE = "Only the first receipts are listed. The totals above count every one.";
