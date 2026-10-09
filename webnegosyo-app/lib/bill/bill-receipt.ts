/**
 * Turning a bill into paper. Every receipt here goes through the merchant's
 * own receipt layout, like any order's: only the heading, the share line and
 * the list of orders covered are the bill's own (`ReceiptOrder.bill`).
 *
 * A bill never carries an order's stored cash and change. Those belong to one
 * order's sale; on a combined bill they would describe someone else's money.
 */
import { getOrderTableNumber } from "../order-table-number";
import type { OrderDiscountPayload } from "../order-discount";
import type { ReceiptOrder } from "../receipt-layout";
import { fromCents, toCents } from "./money";
import {
  billOrderRef,
  billSummary,
  mergeBillItems,
  sortBillOrders,
  type BillOrder,
} from "./bill-orders";
import { orderDiscountLines, type ItemPart, type UnitDiscountLine } from "./bill-split";

export interface BillReceiptOptions {
  /** The moment of printing: the bill's date. */
  nowMs: number;
}

export interface EvenShareOptions extends BillReceiptOptions {
  index: number;
  count: number;
  shareCents: number;
  /** Collected so far against this share. */
  paidCents: number;
  /** The split was of what was still owed, not of the whole total. */
  isShareOfBalance: boolean;
}

export interface ItemPartOptions extends BillReceiptOptions {
  count: number;
  paidCents: number;
}

function commonTable(orders: readonly BillOrder[]): string | null {
  const tables = new Set(orders.map((order) => getOrderTableNumber(order.customerData)));
  const [only] = [...tables];
  return tables.size === 1 && only ? only : null;
}

/** "Table 4", "Order #12", or "3 orders". */
export function billTitle(orders: readonly BillOrder[]): string {
  const table = commonTable(orders);
  if (table) return `Table ${table}`;
  if (orders.length === 1) return `Order ${billOrderRef(orders[0])}`;
  return `${orders.length} orders`;
}

function distinct(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter((value) => value !== ""))];
}

/** Who and what, shared by every receipt of the bill. */
function billBase(orders: readonly BillOrder[], nowMs: number): Omit<ReceiptOrder, "total"> {
  const sorted = sortBillOrders(orders);
  const names = distinct(sorted.map((order) => order.customerName));
  const contacts = distinct(sorted.map((order) => order.customerContact));
  const types = distinct(sorted.map((order) => order.orderType));
  const table = commonTable(sorted);
  return {
    _id: sorted[0]?._id ?? "bill",
    _creationTime: nowMs,
    customerName: names.join(", ") || "Guest",
    customerContact: contacts.length === 1 ? contacts[0] : "",
    ...(types.length === 1 ? { orderType: types[0] } : {}),
    // Only the table: the orders' own blobs hold their tender and discount,
    // which a bill must not inherit.
    customerData: table ? { table_number: table } : {},
  };
}

function mergeDiscountLines(lines: readonly UnitDiscountLine[]): UnitDiscountLine[] {
  const byLabel = new Map<string, number>();
  for (const line of lines) byLabel.set(line.label, (byLabel.get(line.label) ?? 0) + line.cents);
  return [...byLabel].map(([label, cents]) => ({ label, cents }));
}

function discountPayload(lines: readonly UnitDiscountLine[]): OrderDiscountPayload | undefined {
  const merged = mergeDiscountLines(lines).filter((line) => line.cents > 0);
  if (merged.length === 0) return undefined;
  return {
    total: fromCents(merged.reduce((sum, line) => sum + line.cents, 0)),
    deliveryDiscount: 0,
    lines: merged.map((line) => ({ label: line.label, amount: fromCents(line.cents) })),
    allocationsByLine: {},
  };
}

/** A charge row is printed only when there is one. */
function optionalAmount(cents: number): number | undefined {
  return cents > 0 ? fromCents(cents) : undefined;
}

function refsOf(orders: readonly BillOrder[]): string[] {
  return sortBillOrders(orders).map(billOrderRef);
}

export function wholeBillReceipt(orders: readonly BillOrder[], { nowMs }: BillReceiptOptions): ReceiptOrder {
  const sorted = sortBillOrders(orders);
  const summary = billSummary(sorted);
  const discount = discountPayload(sorted.flatMap(orderDiscountLines));
  return {
    ...billBase(sorted, nowMs),
    total: summary.total,
    deliveryFee: optionalAmount(sorted.reduce((sum, o) => sum + toCents(o.deliveryFee ?? 0), 0)),
    serviceCharge: optionalAmount(sorted.reduce((sum, o) => sum + toCents(o.serviceCharge ?? 0), 0)),
    ...(discount ? { discount_data: discount } : {}),
    items: mergeBillItems(sorted.flatMap((order) => order.items)),
    amountPaid: summary.paid,
    bill: {
      heading: `Bill · ${billTitle(sorted)}`,
      ...(sorted.length > 1 ? { orderRefs: refsOf(sorted) } : {}),
    },
  };
}

function guestHeading(orders: readonly BillOrder[], index: number, count: number): string {
  return `${billTitle(orders)} · Guest ${index + 1} of ${count}`;
}

export function evenShareReceipt(orders: readonly BillOrder[], options: EvenShareOptions): ReceiptOrder {
  const whole = wholeBillReceipt(orders, options);
  const { index, count } = options;
  const label = options.isShareOfBalance
    ? `Share of balance (${index + 1} of ${count})`
    : `Your share (${index + 1} of ${count})`;
  return {
    ...whole,
    amountPaid: fromCents(options.paidCents),
    bill: {
      ...whole.bill,
      heading: guestHeading(orders, index, count),
      share: { label, amount: fromCents(options.shareCents) },
    },
  };
}

export function itemPartReceipt(
  orders: readonly BillOrder[],
  part: ItemPart,
  options: ItemPartOptions,
): ReceiptOrder {
  const covered = orders.filter((order) => (part.byOrder[order._id] ?? 0) > 0);
  const discount = discountPayload(part.units.flatMap((unit) => unit.discountLines));
  return {
    ...billBase(orders, options.nowMs),
    total: fromCents(part.totalCents),
    deliveryFee: optionalAmount(part.units.reduce((sum, unit) => sum + unit.deliveryCents, 0)),
    serviceCharge: optionalAmount(part.units.reduce((sum, unit) => sum + unit.serviceCents, 0)),
    ...(discount ? { discount_data: discount } : {}),
    items: mergeBillItems(part.units.map((unit) => unit.item)),
    amountPaid: fromCents(options.paidCents),
    bill: {
      heading: guestHeading(orders, part.guest, options.count),
      ...(covered.length > 0 ? { orderRefs: refsOf(covered) } : {}),
    },
  };
}
