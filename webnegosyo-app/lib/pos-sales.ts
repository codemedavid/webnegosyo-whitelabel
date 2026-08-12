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
  /**
   * Money actually settled against this order, from the trigger-maintained
   * `amount_paid` cache (platform) or the patched `amountPaid` field (Convex).
   * Absent on rows written before the ledger existed.
   */
  amountPaid?: number;
}

/** How the summary decides which orders belong to this shift's drawer. */
export interface SourcePolicy {
  /**
   * Count online orders the register has confirmed. Off by default so every
   * existing caller keeps counter-sale-only totals unchanged.
   */
  includeOnlineOrders?: boolean;
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
 * Statuses an online order must have reached to belong to this shift's drawer.
 * `pending` is deliberately absent: an order nobody has accepted yet is not the
 * register's business, however much money is attached to it.
 */
const CONFIRMED_ONLINE_STATUSES: readonly string[] = [
  "confirmed",
  "preparing",
  "ready",
  "delivered",
];

/**
 * Whether a row belongs in this shift's drawer at all.
 *
 * Counter sales qualify on source alone — the cashier rang them up. An online
 * order qualifies only once the register has confirmed it, which is what turns
 * a Smart Menu order into this shift's responsibility.
 */
function belongsToShift(order: CounterSale, policy: SourcePolicy): boolean {
  if (order.status === "cancelled") return false;
  if (order.source === "pos") return true;
  if (!policy.includeOnlineOrders) return false;
  return CONFIRMED_ONLINE_STATUSES.includes(order.status ?? "");
}

/**
 * The rows that belong to this shift, in the order they were given.
 *
 * Exported so the Drawer's list and its totals are the same decision made once.
 * A screen that filtered its own list would be free to show a row the totals
 * ignored — which reads to a cashier as arithmetic that does not add up.
 */
export function selectShiftSales(
  orders: readonly CounterSale[],
  policy: SourcePolicy = {},
): CounterSale[] {
  return orders.filter((order) => belongsToShift(order, policy));
}

/**
 * What an online order put in the drawer, absent a settlement ledger.
 *
 * Deliberately NOT `total`. A confirmed Smart Menu order is real sales, but the
 * money only exists once someone has paid; counting the bill would tell a
 * cashier to expect cash that is still in the customer's pocket. An unknown
 * `amountPaid` reads as unpaid for the same reason the existing `isCashSale`
 * rule treats an unrecorded method as non-cash — under-stating the drawer is
 * safe, over-stating it is a shift that will not reconcile.
 */
function settledAmount(order: CounterSale): number {
  return order.source === "pos" ? order.total : (order.amountPaid ?? 0);
}

/**
 * Totals for the register's own sales, plus — when the policy allows it —
 * online orders this register confirmed.
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
  policy: SourcePolicy = {},
): CounterSalesSummary {
  const counterSales = selectShiftSales(orders, policy);

  const summary = counterSales.reduce<CounterSalesSummary>((acc, sale) => {
    const rows = payments.filter((payment) => payment.orderId === sale._id);
    const changeDue = readPosPayment(sale.customerData)?.changeDue ?? 0;

    if (rows.length === 0) {
      const cash = isCashSale(sale);
      const settled = settledAmount(sale);
      return {
        ...acc,
        saleCount: acc.saleCount + 1,
        // Gross is what was sold; the drawer split is what was taken. They part
        // company the moment an online order is confirmed before it is paid.
        grossTotal: acc.grossTotal + sale.total,
        cashTotal: acc.cashTotal + (cash ? settled : 0),
        nonCashTotal: acc.nonCashTotal + (cash ? 0 : settled),
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
