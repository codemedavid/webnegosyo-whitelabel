/**
 * How the Drawer screen phrases the till.
 *
 * Pure and side-effect free. The screen owns none of this wording: a cashier
 * reconciling a shift is reading arithmetic they have to trust, and every one
 * of these strings is part of that arithmetic — which orders were counted,
 * what left the till, why a total is smaller than the day's sales. Kept beside
 * `pos-sales` (which decides the numbers) rather than beside the JSX, so the
 * two can be tested as one story.
 */

import { readPosPayment } from "./pos-order";
import { formatPeso } from "./format";
import type { CounterSale, CounterSalesSummary } from "./pos-sales";

/** A sale as the Drawer's list renders it. */
export interface DrawerSale extends CounterSale {
  customerName?: string;
}

/** What the till is counting: this register's own sales, or everything. */
export type DrawerCounting = "counter" | "all";

export const DRAWER_COUNTING_OPTIONS: readonly { label: string; value: DrawerCounting }[] = [
  { label: "Counter only", value: "counter" },
  { label: "+ Smart Menu", value: "all" },
];

/**
 * The choice is stored as the boolean `summarizeCounterSales` already takes.
 * These two adapt it rather than introducing a second source of truth.
 */
export function countingFromPolicy(includeOnlineOrders: boolean): DrawerCounting {
  return includeOnlineOrders ? "all" : "counter";
}

export function policyFromCounting(counting: DrawerCounting): boolean {
  return counting === "all";
}

/** One line of plain language under the counting control. */
export function describeCounting(counting: DrawerCounting): string {
  return counting === "all"
    ? "Counter sales plus Smart Menu orders this register confirmed, at what has actually been paid"
    : "Only the sales rung up at this counter";
}

/** One figure under the cash headline. */
export interface DrawerMoneyLine {
  key: "gross" | "nonCash" | "change" | "refunds";
  label: string;
  value: number;
}

/**
 * The figures that explain the headline, in the order a cashier reconciles
 * them: what was sold, how much of it never reached the till, and what was
 * handed back out of it.
 *
 * Cash is deliberately absent — it is the headline itself, and repeating it as
 * a line invites the reader to add it to the others.
 *
 * Refunds appear only when there were some. A permanent "₱0.00 refunded" row
 * is noise on every shift that had none, and the shifts that had one are
 * exactly the shifts where the count will not otherwise add up.
 */
export function drawerBreakdown(summary: CounterSalesSummary): DrawerMoneyLine[] {
  const lines: DrawerMoneyLine[] = [
    { key: "gross", label: "Sold", value: summary.grossTotal },
    { key: "nonCash", label: "Non-cash", value: summary.nonCashTotal },
    { key: "change", label: "Change out", value: summary.changeGiven },
  ];

  if (summary.refundsPaid > 0) {
    lines.push({ key: "refunds", label: "Refunded", value: summary.refundsPaid });
  }

  return lines;
}

/** One sale as its row reads. */
export interface DrawerSaleView {
  /** The customer's name, when the order carries a usable one. */
  who: string | null;
  /** How it was paid, and what came back out of the till for it. */
  meta: string;
  /** Set when the sale did not come from this register. */
  tag: string | null;
}

function trimmed(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export function describeDrawerSale(sale: DrawerSale): DrawerSaleView {
  const changeDue = readPosPayment(sale.customerData)?.changeDue ?? 0;
  // An unrecorded method is not a formatting gap, it is a sale nobody can
  // reconcile — and `summarizeCounterSales` has already banked it as non-cash.
  const method = trimmed(sale.paymentMethod) ?? "No payment recorded";
  const change = changeDue > 0 ? `  ·  ${formatPeso(changeDue)} change` : "";

  return {
    who: trimmed(sale.customerName),
    meta: `${method}${change}`,
    tag: sale.source === "pos" ? null : "Smart Menu",
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The heading hint over the intake queue. */
export function describeIntake(count: number): string {
  return `${plural(count, "order")} waiting for you to accept`;
}

/** The heading hint over the sales list, naming what was counted. */
export function describeShiftSales(count: number, counting: DrawerCounting): string {
  const scope = counting === "all" ? "counter and Smart Menu" : "at this counter";
  if (count === 0) return `No sales ${counting === "all" ? "yet today" : "at this counter yet"}`;
  return `${plural(count, "sale")} ${scope} today`;
}
