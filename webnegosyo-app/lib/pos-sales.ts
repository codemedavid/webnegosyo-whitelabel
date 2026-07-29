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

/**
 * One settlement against a counter sale — the original tender, a top-up taken
 * after an edit raised the bill, or a refund after one lowered it.
 *
 * This exists because `sale.total` stops describing the drawer the moment an
 * order can be edited: a bill paid by GCash whose top-up was taken in cash
 * still records `paymentMethod: 'GCash'`, so the cash never shows up.
 */
export interface CounterPayment {
  orderId: string;
  kind: "charge" | "refund";
  /** Always positive; `kind` carries the direction. */
  amount: number;
  paymentMethodName?: string;
}

export interface CounterSalesSummary {
  saleCount: number;
  grossTotal: number;
  /** Money that should physically be in the drawer, before change handed out. */
  cashTotal: number;
  nonCashTotal: number;
  changeGiven: number;
  /** Money handed back today, by any method. Never nets into the totals. */
  refundsPaid: number;
}

const EMPTY: CounterSalesSummary = {
  saleCount: 0,
  grossTotal: 0,
  cashTotal: 0,
  nonCashTotal: 0,
  changeGiven: 0,
  refundsPaid: 0,
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

/** Is a settlement row cash, by the same name rule the tender screen uses? */
function isCashPayment(payment: CounterPayment): boolean {
  if (!payment.paymentMethodName) return false;
  return isCashMethod({
    id: payment.orderId,
    name: payment.paymentMethodName,
    details: null,
    qr_code_url: null,
    require_payment_proof: false,
    order_index: 0,
  });
}

/** Net cash and non-cash taken for one order, from its settlement rows. */
function splitByLedger(rows: readonly CounterPayment[]): {
  cash: number;
  nonCash: number;
  refunds: number;
} {
  return rows.reduce(
    (acc, row) => {
      const signed = row.kind === "refund" ? -row.amount : row.amount;
      const cashRow = isCashPayment(row);
      return {
        cash: acc.cash + (cashRow ? signed : 0),
        nonCash: acc.nonCash + (cashRow ? 0 : signed),
        refunds: acc.refunds + (row.kind === "refund" ? row.amount : 0),
      };
    },
    { cash: 0, nonCash: 0, refunds: 0 },
  );
}

/**
 * Totals for the register's own sales, ignoring web / QR-handoff orders.
 *
 * When a sale has settlement rows, the drawer split comes from THEM — they
 * record how each peso was actually taken, which the order's single
 * `paymentMethod` cannot once the bill has been edited. Sales with no rows
 * (every counter sale rung up before the ledger existed) keep the original
 * behaviour, so historic shifts still reconcile.
 *
 * Refunds are reported separately as well as netted, because a cashier
 * counting the till needs to see money that left it, not just a smaller total.
 */
export function summarizeCounterSales(
  orders: CounterSale[],
  payments: readonly CounterPayment[] = [],
): CounterSalesSummary {
  const counterSales = orders.filter(
    (order) => order.source === "pos" && order.status !== "cancelled",
  );

  const summary = counterSales.reduce<CounterSalesSummary>((acc, sale) => {
    const rows = payments.filter((payment) => payment.orderId === sale._id);
    const changeDue = readPosPayment(sale.customerData)?.changeDue ?? 0;

    if (rows.length === 0) {
      const cash = isCashSale(sale);
      return {
        ...acc,
        saleCount: acc.saleCount + 1,
        grossTotal: acc.grossTotal + sale.total,
        cashTotal: acc.cashTotal + (cash ? sale.total : 0),
        nonCashTotal: acc.nonCashTotal + (cash ? 0 : sale.total),
        changeGiven: acc.changeGiven + changeDue,
      };
    }

    const { cash, nonCash, refunds } = splitByLedger(rows);

    return {
      saleCount: acc.saleCount + 1,
      // Gross stays the order's own total: it already reflects the edit.
      grossTotal: acc.grossTotal + sale.total,
      cashTotal: acc.cashTotal + cash,
      nonCashTotal: acc.nonCashTotal + nonCash,
      changeGiven: acc.changeGiven + changeDue,
      refundsPaid: acc.refundsPaid + refunds,
    };
  }, EMPTY);

  return {
    saleCount: summary.saleCount,
    grossTotal: round2(summary.grossTotal),
    cashTotal: round2(summary.cashTotal),
    nonCashTotal: round2(summary.nonCashTotal),
    changeGiven: round2(summary.changeGiven),
    refundsPaid: round2(summary.refundsPaid),
  };
}
