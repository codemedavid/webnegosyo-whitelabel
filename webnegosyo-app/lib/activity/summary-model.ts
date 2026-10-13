/**
 * The Summary tab's answer to "did money leak, and is anything off?"
 * (design spec §3.4). Pure: the screen hands it the summary RPC's totals, the
 * trailing baseline, the period's order + cash rows and the sales figure.
 *
 * "Money that didn't stay" = refunds + cancels AFTER payment + manual
 * discounts + stock wasted at cost. Senior/PWD discounts (statutory, RA 9994 /
 * RA 10754), vouchers and rewards are never in it: they are "given away on
 * purpose" and shown on their own line, so a store that serves seniors or
 * runs promos is not shown a loss.
 */

import { actorFirstName } from "./describe";
import { formatManilaTime, formatPeso } from "./format";
import type { StoreActivityEvent, StoreActivityKindTotal, StoreActivitySummary } from "./store-event";
import type { ActivityCategory, ActivityKind } from "./taxonomy";

/** Days of baseline history before "usually" means anything. */
export const MIN_HISTORY_DAYS = 14;

export type LeakComparison = "normal" | "above" | "not_enough_history" | "no_sales";

export interface SummaryInput {
  current: StoreActivitySummary;
  /** Trailing 28 days for the same scope; null while loading or unavailable. */
  baseline: StoreActivitySummary | null;
  /** The period's orders + cash rows (paid cancels, each drawer). */
  rows: readonly StoreActivityEvent[];
  /** The rows hit the page cap, so sums from them are floors. */
  isRowsPartial: boolean;
  sales: number | null;
  baselineSales: number | null;
}

export interface SummaryStat {
  key: "refunds" | "cancels" | "discounts" | "waste";
  label: string;
  value: string;
  hint: string;
  /** The feed category a tap opens. */
  category: ActivityCategory;
}

export interface DrawerRow {
  eventId: string;
  label: string;
  time: string;
  isShort: boolean;
}

export interface SummaryModel {
  leak: {
    amount: number;
    /** Refunds + discounts + waste over sales (paid cancels left out, see below). */
    percentOfSales: number | null;
    usualPercent: number | null;
    comparison: LeakComparison;
  };
  stats: SummaryStat[];
  givenAway: string | null;
  drawers: { line: string | null; offRows: DrawerRow[]; hasVariance: boolean };
  flaggedOpen: number;
  isEmpty: boolean;
  isAllClear: boolean;
}

function totalsOf(summary: StoreActivitySummary, kind: ActivityKind, statutory?: boolean): StoreActivityKindTotal[] {
  return summary.byKind.filter((total) => total.kind === kind && (statutory === undefined || total.statutory === statutory));
}

function outflow(totals: readonly StoreActivityKindTotal[]): number {
  return Math.abs(totals.reduce((sum, total) => sum + (total.amount ?? 0), 0));
}

/** Discounts net of reversals; never below zero. */
function netDiscount(totals: readonly StoreActivityKindTotal[]): number {
  return Math.max(0, -totals.reduce((sum, total) => sum + (total.amount ?? 0), 0));
}

function countOf(totals: readonly StoreActivityKindTotal[]): number {
  return totals.reduce((sum, total) => sum + total.count, 0);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function paidBeforeCancel(event: StoreActivityEvent): number {
  const paid = event.summary.amountPaid;
  return event.kind === "order.cancelled" && typeof paid === "number" && paid > 0 ? paid : 0;
}

function isExact(amount: number | null): boolean {
  return Math.round((amount ?? 0) * 100) === 0;
}

interface LeakParts {
  refunds: number;
  cancels: number;
  discounts: number;
  waste: number;
}

function leakOf(summary: StoreActivitySummary, cancelsPaid: number): LeakParts {
  return {
    refunds: outflow(totalsOf(summary, "refund.issued")),
    cancels: cancelsPaid,
    discounts: netDiscount(totalsOf(summary, "discount.applied", false)),
    waste: outflow(totalsOf(summary, "stock.wasted")),
  };
}

function sumParts(parts: LeakParts): number {
  return parts.refunds + parts.cancels + parts.discounts + parts.waste;
}

function percent(amount: number, sales: number | null): number | null {
  return sales !== null && sales > 0 ? (amount / sales) * 100 : null;
}

function compare(current: number | null, input: SummaryInput, usual: number | null): LeakComparison {
  if (current === null) return "no_sales";
  const historyDays = new Set(input.baseline?.byDay.map((entry) => entry.day) ?? []).size;
  if (usual === null || historyDays < MIN_HISTORY_DAYS) return "not_enough_history";
  return current <= usual ? "normal" : "above";
}

function stats(input: SummaryInput, parts: LeakParts, paidCancels: number): SummaryStat[] {
  const floor = input.isRowsPartial ? "+" : "";
  return [
    { key: "refunds", label: "Refunded", value: formatPeso(parts.refunds), hint: plural(countOf(totalsOf(input.current, "refund.issued")), "refund", "refunds"), category: "money" },
    { key: "cancels", label: "Cancelled after paying", value: `${formatPeso(parts.cancels)}${parts.cancels > 0 ? floor : ""}`, hint: plural(paidCancels, "order", "orders"), category: "orders" },
    { key: "discounts", label: "Discounts", value: formatPeso(parts.discounts), hint: plural(countOf(totalsOf(input.current, "discount.applied", false)), "discount", "discounts"), category: "money" },
    { key: "waste", label: "Stock wasted", value: formatPeso(parts.waste), hint: "at cost", category: "stock" },
  ];
}

function givenAway(summary: StoreActivitySummary): string | null {
  const parts = [
    ["Vouchers", outflow(totalsOf(summary, "voucher.redeemed"))],
    ["Rewards", outflow(totalsOf(summary, "loyalty.reward_claimed"))],
    ["Senior/PWD", outflow(totalsOf(summary, "discount.applied", true))],
  ] as const;
  const shown = parts.filter(([, amount]) => amount > 0).map(([label, amount]) => `${label} ${formatPeso(amount)}`);
  return shown.length === 0 ? null : shown.join(" · ");
}

function drawerLabel(event: StoreActivityEvent): string {
  const amount = event.amount ?? 0;
  const words = amount < 0 ? `short ${formatPeso(-amount)}` : `over ${formatPeso(amount)}`;
  return `${actorFirstName(event.actorName) ?? "Someone"} · ${words}`;
}

function drawers(rows: readonly StoreActivityEvent[]): SummaryModel["drawers"] {
  const closed = rows.filter((event) => event.kind === "shift.closed");
  if (closed.length === 0) return { line: null, offRows: [], hasVariance: false };
  const off = closed.filter((event) => !isExact(event.amount));
  const short = off.filter((event) => (event.amount ?? 0) < 0);
  const over = off.length - short.length;
  const shortTotal = Math.abs(short.reduce((sum, event) => sum + (event.amount ?? 0), 0));
  const exact = closed.length - off.length;
  const parts = [
    plural(closed.length, "shift closed", "shifts closed"),
    short.length > 0 ? `${short.length} short ${formatPeso(shortTotal)}` : null,
    over > 0 ? `${over} over` : null,
    exact > 0 ? `${exact} exact` : null,
  ].filter((part): part is string => part !== null);
  return {
    line: parts.join(" · "),
    offRows: off.map((event) => ({ eventId: event.id, label: drawerLabel(event), time: formatManilaTime(event.occurredAt), isShort: (event.amount ?? 0) < 0 })),
    hasVariance: off.length > 0,
  };
}

export function buildSummaryModel(input: SummaryInput): SummaryModel {
  const paidCancelRows = input.rows.filter((event) => paidBeforeCancel(event) > 0);
  const parts = leakOf(input.current, paidCancelRows.reduce((sum, event) => sum + paidBeforeCancel(event), 0));
  const amount = sumParts(parts);
  // Rates leave paid cancels out on BOTH sides: the baseline has no row read to
  // tell a paid cancel from an unpaid one, and comparing unlike sums would
  // read every cancel as a leak above "usual".
  const usualPercent = input.baseline ? percent(sumParts(leakOf(input.baseline, 0)), input.baselineSales) : null;
  const percentOfSales = percent(amount - parts.cancels, input.sales);
  const drawerView = drawers(input.rows);
  const isEmpty = input.current.byKind.length === 0 && input.current.routine.length === 0 && input.rows.length === 0;
  return {
    leak: { amount, percentOfSales, usualPercent, comparison: compare(percentOfSales, input, usualPercent) },
    stats: stats(input, parts, paidCancelRows.length),
    givenAway: givenAway(input.current),
    drawers: drawerView,
    flaggedOpen: input.current.flaggedOpen,
    isEmpty,
    isAllClear: !isEmpty && amount === 0 && !drawerView.hasVariance && input.current.flaggedOpen === 0,
  };
}
