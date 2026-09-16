/**
 * Who sold what, person by person.
 *
 * The owner's question is comparative — "how did Ana's register do against
 * Ben's this week" — so the unit is the person and the window is whole
 * Manila days (build it with branch-period's buildKpiPeriod; a rolling
 * window makes every edge day permanently short). The arithmetic is
 * pos-sales' summarizeCounterSales, reused per person, so a peso here is
 * the same peso the drawer screen shows.
 *
 * Counter sales only, like the personal drawer: an online order is the
 * store's work, not a register's, and crediting it to whoever confirmed it
 * would let the fastest Confirm-tapper win the leaderboard.
 *
 * Pure and side-effect free; the screen fetches from whichever backend the
 * tenant runs on and hands the rows here.
 */

import { summarizeShiftDrawer, type StaffPayment } from "./shift-drawer";
import { readPosPayment } from "./pos-order";
import {
  summarizeCounterSales,
  type CounterPayment,
  type CounterSale,
  type CounterSalesSummary,
} from "./pos-sales";

/** Whole-day window, as produced by branch-period's buildKpiPeriod. */
export interface StaffPeriod {
  startMs: number;
  endMs: number;
}

export interface StaffPerformanceRow extends CounterSalesSummary {
  staffUserId: string;
  /** grossTotal / saleCount, rounded to the centavo. Zero when no sales. */
  averageTicket: number;
}

export interface StaffPerformance {
  /** Busiest register first, by gross. */
  staff: StaffPerformanceRow[];
  /**
   * Counter sales nobody is stamped on. An explicit bucket rather than a
   * silent drop: totals that quietly exclude rows read as a store that sold
   * less, not as a report that dropped data.
   */
  unattributed: CounterSalesSummary;
}

const UNATTRIBUTED = "__unattributed__";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A counter sale inside the window; everything else is not a register's work. */
function isCountable(sale: CounterSale, period: StaffPeriod): boolean {
  if (sale.status === "cancelled") return false;
  if (sale.source !== "pos") return false;
  return sale._creationTime >= period.startMs && sale._creationTime <= period.endMs;
}

function summarizeGroup(
  sales: CounterSale[],
  payments: readonly CounterPayment[],
): CounterSalesSummary {
  const ids = new Set(sales.map((sale) => sale._id));
  return summarizeCounterSales(
    sales,
    payments.filter((payment) => ids.has(payment.orderId)),
  );
}

/** Per-person totals for the window, plus the unattributed remainder. */
export function summarizeStaffPerformance(
  orders: readonly CounterSale[],
  payments: readonly StaffPayment[],
  period: StaffPeriod,
): StaffPerformance {
  const groups = new Map<string, CounterSale[]>();
  for (const sale of orders) {
    if (!isCountable(sale, period)) continue;
    const cashierId = readPosPayment(sale.customerData)?.cashierId || UNATTRIBUTED;
    const group = groups.get(cashierId);
    if (group) group.push(sale);
    else groups.set(cashierId, [sale]);
  }

  // Someone can collect a bill another cashier rang up, without making a new
  // sale of their own. Include that collector without duplicating gross sales.
  const orderIds = new Set(orders.map(order => order._id));
  for (const payment of payments) {
    const at = payment._creationTime;
    if (payment.recordedBy && orderIds.has(payment.orderId) && at !== undefined &&
      at >= period.startMs && at <= period.endMs && !groups.has(payment.recordedBy)) {
      groups.set(payment.recordedBy, []);
    }
  }
  const staff: StaffPerformanceRow[] = [];
  for (const [cashierId, sales] of groups) {
    if (cashierId === UNATTRIBUTED) continue;
    const summary = summarizeGroup(sales, payments);
    const collected = summarizeShiftDrawer(orders, payments, {
      staffUserId: cashierId, openedAt: new Date(period.startMs).toISOString(),
      closedAt: new Date(period.endMs).toISOString(),
    }, period.endMs);
    staff.push({
      ...summary,
      cashTotal: collected.cashTotal,
      nonCashTotal: collected.nonCashTotal,
      refundsPaid: collected.refundsPaid,
      staffUserId: cashierId,
      averageTicket:
        summary.saleCount === 0 ? 0 : round2(summary.grossTotal / summary.saleCount),
    });
  }
  staff.sort((a, b) => b.grossTotal - a.grossTotal);

  return {
    staff,
    unattributed: summarizeGroup(groups.get(UNATTRIBUTED) ?? [], payments),
  };
}
