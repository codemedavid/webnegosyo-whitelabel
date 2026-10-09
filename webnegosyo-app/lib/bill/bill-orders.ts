/**
 * A bill is a view over orders that were already placed. It never moves items
 * between orders: the kitchen, stock, analytics and every order's own receipt
 * stay exactly as they were. Combining and splitting only change what is
 * printed and how a payment is spread across the orders' ledgers.
 *
 * Pure: no I/O. The screen loads the orders, their items and their ledgers.
 */
import type { ReceiptOrderItem } from "../receipt-layout";
import { fromCents, toCents } from "./money";

export interface BillItem extends ReceiptOrderItem {
  orderId: string;
}

export interface BillOrder {
  _id: string;
  _creationTime: number;
  dailyNumber?: number | null;
  /** The order's branch, read by the branch-scope check before taking money. */
  outlet_id?: string | null;
  outletId?: string | null;
  customerName: string;
  customerContact: string;
  orderType?: string;
  status: string;
  paymentStatus?: string | null;
  total: number;
  deliveryFee?: number;
  serviceCharge?: number;
  customerData?: unknown;
  discount_data?: unknown;
  items: BillItem[];
  /**
   * Collected so far: the whole total for an order settled by its status (paid
   * online, handed over), its ledger otherwise. Never more than the total.
   */
  amountPaid: number;
}

export interface BillSummary {
  total: number;
  paid: number;
  owed: number;
  orderCount: number;
  /** Any money already taken on any order of the bill. */
  hasPayments: boolean;
}

/** "#12" by the day's order number, or the id's tail the receipt prints. */
export function billOrderRef(order: Pick<BillOrder, "_id" | "dailyNumber">): string {
  if (typeof order.dailyNumber === "number" && order.dailyNumber > 0) {
    return `#${String(order.dailyNumber).padStart(2, "0")}`;
  }
  return `#${order._id.slice(-8).toUpperCase()}`;
}

function paidCents(order: BillOrder): number {
  return Math.min(toCents(order.total), Math.max(0, toCents(order.amountPaid)));
}

export function orderOwedCents(order: BillOrder): number {
  return Math.max(0, toCents(order.total) - paidCents(order));
}

export function orderOwed(order: BillOrder): number {
  return fromCents(orderOwedCents(order));
}

/** Oldest first: the order money is spread in, and the order rounds came in. */
export function sortBillOrders<O extends Pick<BillOrder, "_creationTime" | "_id">>(orders: readonly O[]): O[] {
  return [...orders].sort((a, b) => a._creationTime - b._creationTime || a._id.localeCompare(b._id));
}

export function billSummary(orders: readonly BillOrder[]): BillSummary {
  const total = orders.reduce((sum, order) => sum + toCents(order.total), 0);
  const paid = orders.reduce((sum, order) => sum + paidCents(order), 0);
  return {
    total: fromCents(total),
    paid: fromCents(paid),
    owed: fromCents(total - paid),
    orderCount: orders.length,
    hasPayments: paid > 0,
  };
}

/** Two lines merge only when a guest could not tell them apart on paper. */
function mergeKey(item: BillItem): string {
  return JSON.stringify([
    item.menuItemName,
    item.variation ?? null,
    (item.variationSelections ?? []).map((s) => [s.typeName, s.optionName]),
    (item.addons ?? []).map((a) => [a.name, a.price]),
    item.specialInstructions ?? null,
    toCents(item.subtotal / Math.max(1, item.quantity)),
  ]);
}

/**
 * The bill's lines: the same dish from different rounds becomes one line
 * ("3x Latte"). A combo stays with its own order, so two orders' meals never
 * blend into one combo on paper.
 */
export function mergeBillItems(items: readonly BillItem[]): BillItem[] {
  const merged: BillItem[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of items) {
    if (item.isBundleItem || item.bundleId) {
      merged.push({ ...item, bundleId: `${item.orderId}:${item.bundleId ?? "bundle"}` });
      continue;
    }
    const key = mergeKey(item);
    const at = indexByKey.get(key);
    if (at === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...item });
      continue;
    }
    const existing = merged[at];
    merged[at] = {
      ...existing,
      quantity: existing.quantity + item.quantity,
      subtotal: fromCents(toCents(existing.subtotal) + toCents(item.subtotal)),
    };
  }
  return merged;
}
