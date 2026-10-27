/**
 * Shift sales counted on this tablet — the fallback when the server report
 * cannot answer: a store whose orders live in Convex or a store database
 * (`report_*_sales` answers `source: 'unavailable'`), or a platform
 * database the report function has not reached yet.
 *
 * Same figures as the server's ONE sales definition (web
 * `src/lib/reports/sales-model.ts` + `payment-buckets.ts`), restated over the
 * orders and settlement ledger the Drawer already reads, in whole centavos:
 *
 *   net       = bill − service − delivery kept (after its discount)
 *   gross     = net + food discount
 *   settled   = paid/verified status, a handed-over non-table order, no
 *               status at all, or a ledger that covers the bill
 *   collected = the ledger, or the whole bill once settled
 *   unpaid    = bill − collected (never negative); over-collection = overpaid
 *
 * A ledger refund is change handed back after an edit lowered the bill: the
 * total already carries the cut, so it is reported, never subtracted again.
 * Cancelled / voided / refunded orders are voids — counted apart, never sales.
 * Top items stay unknown (the order lines are not read here). Pure.
 */

import { getOrderOutletId } from "../branch-scope";
import { toCents } from "../bill/money";
import { readOrderDiscount } from "../order-discount";
import { ORDER_SOURCE_LABELS } from "../order-channels";
import { formatDailyOrderNumber } from "../order-number";
import { getOrderTableNumber } from "../order-table-number";
import { getOrderTypeMeta } from "../order-visuals";
import type { CounterSale } from "../pos-sales";
import type { StaffPayment } from "../shift-drawer";
import type {
  ShiftReceiptStatus,
  ShiftSalesBreakdown,
  ShiftSalesPayment,
  ShiftSalesReceipt,
  ShiftSalesReport,
  ShiftSalesShift,
  ShiftSalesSummary,
} from "./shift-sales";

/** An order row as the app's order readers hand it over (platform DTO or Convex document). */
export interface DeviceSalesOrder extends CounterSale {
  dailyNumber?: number | null;
  orderType?: string;
  paymentStatus?: string | null;
  serviceCharge?: number;
  deliveryFee?: number;
  discount_data?: unknown;
  outlet_id?: string | null;
  outletId?: string | null;
}

export interface DeviceSalesInput {
  orders: readonly DeviceSalesOrder[];
  payments: readonly StaffPayment[];
  /** Half-open window [fromMs, toMs). */
  fromMs: number;
  toMs: number;
  /** Narrow to one branch; undefined = every branch. */
  outletId?: string | null;
  shift: ShiftSalesShift | null;
  /** Blind count: every peso figure stays unknown. */
  hidden: boolean;
  receiptLimit?: number;
}

/** The server's own cap on the receipt list (the totals still count every order). */
export const DEVICE_RECEIPT_LIMIT = 500;

const REVERSED_STATUSES: ReadonlySet<string> = new Set(["cancelled", "canceled", "voided", "refunded"]);
const SETTLED_PAYMENT_STATUSES: ReadonlySet<string> = new Set(["paid", "verified"]);
const UNKNOWN_CHANNEL = "Other";

interface OrderMoney {
  isLive: boolean;
  billedCents: number;
  grossCents: number;
  discountCents: number;
  netCents: number;
  serviceCents: number;
  deliveryCents: number;
  collectedCents: number;
  unpaidCents: number;
  overpaidCents: number;
  refundCents: number;
  /** Money in hand by method name, refunds netted. */
  byMethod: ReadonlyMap<string, number>;
}

function lower(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isSettledByStatus(order: DeviceSalesOrder): boolean {
  if (order.paymentStatus == null) return true;
  if (SETTLED_PAYMENT_STATUSES.has(lower(order.paymentStatus))) return true;
  return lower(order.status) === "delivered" && getOrderTableNumber(order.customerData) === null;
}

function ledgerByMethod(rows: readonly StaffPayment[], fallback: string): { byMethod: Map<string, number>; netCents: number; refundCents: number } {
  const byMethod = new Map<string, number>();
  let netCents = 0;
  let refundCents = 0;
  for (const row of rows) {
    const cents = toCents(row.amount);
    const signed = row.kind === "refund" ? -cents : cents;
    const method = row.paymentMethodName?.trim() || fallback;
    byMethod.set(method, (byMethod.get(method) ?? 0) + signed);
    netCents += signed;
    if (row.kind === "refund") refundCents += cents;
  }
  return { byMethod, netCents, refundCents };
}

function orderMoney(order: DeviceSalesOrder, rows: readonly StaffPayment[]): OrderMoney {
  const billedCents = toCents(order.total);
  const serviceCents = toCents(order.serviceCharge ?? 0);
  const deliveryFeeCents = Math.max(0, toCents(order.deliveryFee ?? 0));
  const discount = readOrderDiscount(order);
  const deliveryDiscountCents = Math.min(deliveryFeeCents, Math.max(0, toCents(discount?.deliveryDiscount ?? 0)));
  const discountCents = Math.max(0, toCents(discount?.total ?? 0) - deliveryDiscountCents);
  const deliveryCents = deliveryFeeCents - deliveryDiscountCents;
  const grossCents = billedCents - serviceCents - deliveryCents + discountCents;
  const checkoutMethod = order.paymentMethod?.trim() || "Not recorded";
  const ledger = ledgerByMethod(rows, checkoutMethod);
  const isSettled = isSettledByStatus(order) || ledger.netCents >= billedCents;
  const collectedCents = isSettled ? Math.max(ledger.netCents, billedCents) : ledger.netCents;
  const byMethod = new Map(ledger.byMethod);
  // Settled without a full ledger (paid online, handed over): the rest came in under the checkout method.
  if (isSettled && ledger.netCents < billedCents) {
    byMethod.set(checkoutMethod, (byMethod.get(checkoutMethod) ?? 0) + billedCents - ledger.netCents);
  }
  return {
    isLive: !REVERSED_STATUSES.has(lower(order.status)) && billedCents >= 0,
    billedCents,
    grossCents,
    discountCents,
    netCents: grossCents - discountCents,
    serviceCents,
    deliveryCents,
    collectedCents,
    unpaidCents: Math.max(0, billedCents - collectedCents),
    overpaidCents: Math.max(0, collectedCents - billedCents),
    refundCents: ledger.refundCents,
    byMethod,
  };
}

const EMPTY_SUMMARY: ShiftSalesSummary = {
  orders: 0,
  grossCents: 0,
  discountCents: 0,
  netCents: 0,
  serviceChargeCents: 0,
  deliveryCents: 0,
  collectedCents: 0,
  unpaidCents: 0,
  overpaidCents: 0,
  voidCount: 0,
  voidCents: 0,
  refundCents: 0,
};

function addToSummary(acc: ShiftSalesSummary, money: OrderMoney): ShiftSalesSummary {
  if (!money.isLive) {
    return { ...acc, voidCount: acc.voidCount + 1, voidCents: acc.voidCents + money.billedCents, refundCents: acc.refundCents + money.refundCents };
  }
  return {
    orders: acc.orders + 1,
    grossCents: acc.grossCents + money.grossCents,
    discountCents: acc.discountCents + money.discountCents,
    netCents: acc.netCents + money.netCents,
    serviceChargeCents: acc.serviceChargeCents + money.serviceCents,
    deliveryCents: acc.deliveryCents + money.deliveryCents,
    collectedCents: acc.collectedCents + money.collectedCents,
    unpaidCents: acc.unpaidCents + money.unpaidCents,
    overpaidCents: acc.overpaidCents + money.overpaidCents,
    voidCount: acc.voidCount,
    voidCents: acc.voidCents,
    refundCents: acc.refundCents + money.refundCents,
  };
}

/** "GCash  payment" and "gcash payment" are one method. */
function methodKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/ /g, "_") || "unspecified";
}

function byMoneyThenLabel<T extends { label: string }>(money: (row: T) => number) {
  return (a: T, b: T) => money(b) - money(a) || a.label.localeCompare(b.label);
}

function paymentBuckets(entries: readonly { money: OrderMoney }[]): ShiftSalesPayment[] {
  const buckets = new Map<string, ShiftSalesPayment>();
  for (const { money } of entries) {
    if (!money.isLive) continue;
    for (const [label, cents] of money.byMethod) {
      if (cents === 0) continue;
      const key = methodKey(label);
      const held = buckets.get(key);
      buckets.set(key, { key, label, cents: (held?.cents ?? 0) + cents, count: (held?.count ?? 0) + 1 });
    }
  }
  return [...buckets.values()].filter((b) => b.cents !== 0).sort(byMoneyThenLabel((b) => b.cents));
}

function breakdown(
  entries: readonly { order: DeviceSalesOrder; money: OrderMoney }[],
  keyOf: (order: DeviceSalesOrder) => { key: string; label: string },
): ShiftSalesBreakdown[] {
  const rows = new Map<string, ShiftSalesBreakdown>();
  for (const { order, money } of entries) {
    if (!money.isLive) continue;
    const { key, label } = keyOf(order);
    const held = rows.get(key);
    rows.set(key, { key, label, orders: (held?.orders ?? 0) + 1, netCents: (held?.netCents ?? 0) + money.netCents });
  }
  return [...rows.values()].sort(byMoneyThenLabel((r) => r.netCents));
}

function receiptStatus(order: DeviceSalesOrder, money: OrderMoney): ShiftReceiptStatus {
  if (!money.isLive) return lower(order.status) === "refunded" ? "refunded" : "void";
  return money.unpaidCents > 0 ? "unpaid" : "paid";
}

function methodLabel(order: DeviceSalesOrder, rows: readonly StaffPayment[]): string | null {
  const names = [...new Set(rows.filter((r) => r.kind === "charge").map((r) => r.paymentMethodName?.trim()).filter(Boolean))];
  if (names.length > 0) return names.join(" + ");
  return order.paymentMethod?.trim() || null;
}

function toReceipt(order: DeviceSalesOrder, money: OrderMoney, rows: readonly StaffPayment[], hidden: boolean): ShiftSalesReceipt {
  return {
    orderId: order._id,
    number: formatDailyOrderNumber(order.dailyNumber, order._id),
    placedAt: new Date(order._creationTime).toISOString(),
    orderTypeLabel: order.orderType ? getOrderTypeMeta(order.orderType).label : null,
    methodLabel: methodLabel(order, rows),
    totalCents: hidden ? null : money.billedCents,
    status: receiptStatus(order, money),
  };
}

function groupPayments(payments: readonly StaffPayment[]): Map<string, StaffPayment[]> {
  const byOrder = new Map<string, StaffPayment[]>();
  for (const payment of payments) byOrder.set(payment.orderId, [...(byOrder.get(payment.orderId) ?? []), payment]);
  return byOrder;
}

/** The orders in the window (and branch), oldest first. */
function ordersInWindow(input: DeviceSalesInput): DeviceSalesOrder[] {
  return input.orders
    .filter((order) => order._creationTime >= input.fromMs && order._creationTime < input.toMs)
    .filter((order) => input.outletId === undefined || getOrderOutletId(order) === input.outletId)
    .sort((a, b) => a._creationTime - b._creationTime);
}

export function countShiftSalesOnDevice(input: DeviceSalesInput): ShiftSalesReport {
  const ledger = groupPayments(input.payments);
  const entries = ordersInWindow(input).map((order) => {
    const rows = ledger.get(order._id) ?? [];
    return { order, rows, money: orderMoney(order, rows) };
  });
  const limit = input.receiptLimit ?? DEVICE_RECEIPT_LIMIT;
  const receipts = entries.slice(0, limit).map((e) => toReceipt(e.order, e.money, e.rows, input.hidden));
  const numbers = entries.map((e) => formatDailyOrderNumber(e.order.dailyNumber, e.order._id));
  const summary = entries.reduce((acc, e) => addToSummary(acc, e.money), EMPTY_SUMMARY);
  return {
    source: "device",
    hidden: input.hidden,
    window: { from: new Date(input.fromMs).toISOString(), to: new Date(input.toMs).toISOString() },
    shift: input.shift,
    summary: input.hidden ? null : summary,
    payments: input.hidden ? null : paymentBuckets(entries),
    orderTypes: input.hidden
      ? null
      : breakdown(entries, (o) => ({ key: o.orderType?.trim() || "unknown", label: getOrderTypeMeta(o.orderType).label })),
    channels: input.hidden
      ? null
      : breakdown(entries, (o) => ({ key: o.source || "unknown", label: ORDER_SOURCE_LABELS[o.source ?? ""] ?? UNKNOWN_CHANNEL })),
    items: null,
    receipts,
    receiptsTruncated: entries.length > limit,
    firstNumber: numbers[0] ?? null,
    lastNumber: numbers[numbers.length - 1] ?? null,
  };
}
