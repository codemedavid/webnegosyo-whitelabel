/**
 * End-of-shift reconciliation for counter sales.
 *
 * Pure and side-effect free: the screen fetches the day's orders from Convex
 * and hands them here. Cancelled sales are excluded from every figure — the
 * drawer never held that money.
 */

import { readPosPayment } from "./pos-order";
import { isCashMethod } from "./pos-payment-methods";

/** The subset of an order row this summary needs. */
export interface CounterSale {
  _id: string;
  _creationTime: number;
  source?: string;
  status?: string;
  total: number;
  paymentMethod?: string;
  customerData?: unknown;
}

export interface CounterSalesSummary {
  saleCount: number;
  grossTotal: number;
  /** Money that should physically be in the drawer, before change handed out. */
  cashTotal: number;
  nonCashTotal: number;
  changeGiven: number;
}

const EMPTY: CounterSalesSummary = {
  saleCount: 0,
  grossTotal: 0,
  cashTotal: 0,
  nonCashTotal: 0,
  changeGiven: 0,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A sale settled in cash. Reuses the same name rule as the tender screen so
 * the drawer total and the keypad can never disagree about what "cash" means.
 * An order with no recorded method is counted as non-cash — it is safer to
 * under-state the drawer than to over-state it.
 */
function isCashSale(sale: CounterSale): boolean {
  if (!sale.paymentMethod) return false;
  return isCashMethod({
    id: sale._id,
    name: sale.paymentMethod,
    details: null,
    qr_code_url: null,
    require_payment_proof: false,
    order_index: 0,
  });
}

/** Totals for the register's own sales, ignoring web / QR-handoff orders. */
export function summarizeCounterSales(orders: CounterSale[]): CounterSalesSummary {
  const counterSales = orders.filter(
    (order) => order.source === "pos" && order.status !== "cancelled",
  );

  const summary = counterSales.reduce<CounterSalesSummary>((acc, sale) => {
    const cash = isCashSale(sale);
    const changeDue = readPosPayment(sale.customerData)?.changeDue ?? 0;

    return {
      saleCount: acc.saleCount + 1,
      grossTotal: acc.grossTotal + sale.total,
      cashTotal: acc.cashTotal + (cash ? sale.total : 0),
      nonCashTotal: acc.nonCashTotal + (cash ? 0 : sale.total),
      changeGiven: acc.changeGiven + changeDue,
    };
  }, EMPTY);

  return {
    saleCount: summary.saleCount,
    grossTotal: round2(summary.grossTotal),
    cashTotal: round2(summary.cashTotal),
    nonCashTotal: round2(summary.nonCashTotal),
    changeGiven: round2(summary.changeGiven),
  };
}
