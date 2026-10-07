/**
 * What the order screens show while some of the shop's work has not reached
 * the server: sales still in the outbox appear as orders, and changes staff
 * made offline are laid over the orders they touched.
 *
 * Pure: the hooks in `use-offline-orders.ts` hand in the outbox, the change
 * queue and whatever the server last answered. The server's answer always
 * wins for an order it holds — a queued sale is shown only until its row
 * arrives, and an edit only until it has been replayed (it leaves the queue).
 */

import { needsAttention, type QueuedSale } from "./order-outbox";
import { isOrderEditStuck, type QueuedOrderEdit } from "./order-edits";
import type { OrderPaymentLike } from "../order-history-view";

/** How an order on screen relates to the server. Absent: fully synced. */
export type OfflineSyncState = "queued" | "needs_attention";

export interface OfflineOrderFields {
  offlineSync?: OfflineSyncState;
  /** The server's last refusal, for a sale or change that needs a person. */
  offlineSyncError?: string | null;
}

export interface LocalOrderItem {
  menuItemId?: string;
  menuItemName: string;
  quantity: number;
  price?: number;
  subtotal: number;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string; priceAdjustment: number }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
}

/** A queued sale, shaped like the order row the server would return. */
export interface LocalOrder extends OfflineOrderFields {
  _id: string;
  _creationTime: number;
  dailyNumber: null;
  customerName: string;
  customerContact: string;
  customerData: Record<string, unknown>;
  status: string;
  source: string;
  total: number;
  itemCount: number;
  orderType?: string;
  orderTypeId?: string;
  paymentStatus: string;
  paymentMethod?: string;
  deliveryFee?: number;
  serviceCharge?: number;
  deliveryAddress?: string;
  amountPaid?: number;
  items: LocalOrderItem[];
}

export interface OfflineOrderInput {
  sales: readonly QueuedSale[];
  edits: readonly QueuedOrderEdit[];
  tenantId: string | null;
  /** A dated report: only queued sales taken inside it belong. */
  window?: { startMs: number; endMs: number } | null;
  /** The screen asked the server for one status only. */
  status?: string | null;
}

interface OrderLike {
  _id: string;
  _creationTime?: number;
  status?: string;
  paymentStatus?: string | null;
  amountPaid?: number | null;
}

/** Statuses `orders:getRealtimeQueue` reports; closed orders leave it. */
const OPEN_STATUSES = ["pending", "confirmed", "preparing", "ready"] as const;

/** Both backends create a counter sale already confirmed. */
const COUNTER_SALE_STATUS = "confirmed";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The id the order screens use for a queued sale. */
export function queuedSaleOrderId(sale: QueuedSale): string {
  return sale.syncedOrderId ?? sale.localId;
}

export function findQueuedSale(sales: readonly QueuedSale[], orderId: string): QueuedSale | undefined {
  return sales.find((sale) => sale.localId === orderId || sale.syncedOrderId === orderId);
}

/** True while the server has no row for this sale yet. */
export function isSaleUnwritten(sale: QueuedSale | undefined): boolean {
  return sale !== undefined && !sale.syncedOrderId;
}

function toLocalItems(value: unknown): LocalOrderItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = asRecord(raw);
    return {
      ...(item as Partial<LocalOrderItem>),
      menuItemName: asString(item.menuItemName) ?? "Item",
      quantity: asNumber(item.quantity) ?? 1,
      subtotal: asNumber(item.subtotal) ?? 0,
    };
  });
}

export function queuedSaleToOrder(sale: QueuedSale): LocalOrder {
  const args = sale.orderArgs;
  const items = toLocalItems(args.items);
  const isStuck = needsAttention(sale);
  return {
    _id: queuedSaleOrderId(sale),
    _creationTime: sale.createdAt,
    dailyNumber: null,
    customerName: asString(args.customerName) ?? sale.bookkeeping.customerName,
    customerContact: asString(args.customerContact) ?? sale.bookkeeping.customerContact,
    customerData: asRecord(args.customerData),
    status: COUNTER_SALE_STATUS,
    source: asString(args.source) ?? "pos",
    total: asNumber(args.total) ?? sale.bookkeeping.total,
    itemCount: asNumber(args.itemCount) ?? items.reduce((sum, item) => sum + item.quantity, 0),
    orderType: asString(args.orderType),
    orderTypeId: asString(args.orderTypeId),
    paymentStatus: sale.paidAtTender === false ? "pending" : "paid",
    paymentMethod: asString(args.paymentMethod),
    deliveryFee: asNumber(args.deliveryFee),
    serviceCharge: asNumber(args.serviceCharge),
    deliveryAddress: asString(args.deliveryAddress),
    items,
    offlineSync: isStuck ? "needs_attention" : "queued",
    offlineSyncError: isStuck ? sale.lastError : null,
  };
}

function byCreatedAt(a: QueuedOrderEdit, b: QueuedOrderEdit): number {
  return a.createdAt - b.createdAt;
}

/**
 * The order as it stands after the changes waiting for it. Returns the same
 * object when none apply, so memoised rows do not re-render.
 */
export function applyOrderEdits<T extends OrderLike>(
  order: T,
  edits: readonly QueuedOrderEdit[]
): T & OfflineOrderFields {
  const mine = edits.filter((edit) => edit.orderId === order._id).sort(byCreatedAt);
  if (mine.length === 0) return order;

  const next = mine.reduce<T & OfflineOrderFields>(
    (current, edit) => {
      const status = asString(edit.args.status);
      const paymentStatus = asString(edit.args.paymentStatus);
      if (edit.ref === "orders:updateOrderStatus" && status) return { ...current, status };
      if (edit.ref === "orders:updatePaymentStatus" && paymentStatus) return { ...current, paymentStatus };
      if (edit.ref === "orders:recordPayment") {
        const amount = asNumber(edit.args.amount) ?? 0;
        const signed = edit.args.kind === "refund" ? -amount : amount;
        return { ...current, amountPaid: (current.amountPaid ?? 0) + signed };
      }
      return current;
    },
    { ...order }
  );

  const stuck = mine.find(isOrderEditStuck);
  return {
    ...next,
    offlineSync: stuck ? "needs_attention" : (order as OfflineOrderFields).offlineSync ?? "queued",
    offlineSyncError: stuck ? stuck.lastError : (order as OfflineOrderFields).offlineSyncError ?? null,
  };
}

function mineOnly<T extends { tenantId: string }>(rows: readonly T[], tenantId: string | null): T[] {
  return rows.filter((row) => row.tenantId === tenantId);
}

function isInWindow(createdAt: number, window: OfflineOrderInput["window"]): boolean {
  return !window || (createdAt >= window.startMs && createdAt < window.endMs);
}

function hasNothingWaiting(input: OfflineOrderInput): boolean {
  return mineOnly(input.sales, input.tenantId).length === 0 && mineOnly(input.edits, input.tenantId).length === 0;
}

/** Queued sales the server does not hold yet, with their own changes applied. */
function localOrdersFor(input: OfflineOrderInput, serverIds: ReadonlySet<string>): LocalOrder[] {
  const edits = mineOnly(input.edits, input.tenantId);
  return mineOnly(input.sales, input.tenantId)
    .filter((sale) => isInWindow(sale.createdAt, input.window))
    .map(queuedSaleToOrder)
    .filter((order) => !serverIds.has(order._id))
    .map((order) => applyOrderEdits(order, edits));
}

/**
 * An order list (`orders:getOrders`) with the device's unsynced work in it,
 * newest first. `server` may be undefined: offline with nothing cached, the
 * queued sales are still this shop's orders.
 */
export function mergeOrderList<T extends OrderLike>(
  server: readonly T[] | undefined,
  input: OfflineOrderInput
): (T | LocalOrder)[] {
  const rows = server ?? [];
  if (hasNothingWaiting(input)) return rows as T[];

  const edits = mineOnly(input.edits, input.tenantId);
  const serverIds = new Set(rows.map((order) => order._id));
  const merged: (T | LocalOrder)[] = [
    ...rows.map((order) => applyOrderEdits(order, edits)),
    ...localOrdersFor(input, serverIds),
  ];
  const wanted = input.status ? merged.filter((order) => order.status === input.status) : merged;
  return wanted.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
}

type QueueBuckets<T> = Record<string, T[] | undefined>;

/**
 * The live queue (`orders:getRealtimeQueue`, open orders by status) with the
 * device's unsynced work filed under each order's CURRENT status — an order
 * advanced offline moves bucket, one closed offline leaves the queue.
 */
export function mergeRealtimeQueue<T extends OrderLike>(
  queue: QueueBuckets<T> | undefined,
  input: OfflineOrderInput
): QueueBuckets<T | LocalOrder> | undefined {
  if (hasNothingWaiting(input)) return queue;

  const edits = mineOnly(input.edits, input.tenantId);
  const seen = new Set<string>();
  const serverRows = Object.values(queue ?? {})
    .flatMap((bucket) => (Array.isArray(bucket) ? bucket : []))
    .filter((order) => (seen.has(order._id) ? false : (seen.add(order._id), true)))
    .map((order) => applyOrderEdits(order, edits));
  const rows: (T | LocalOrder)[] = [...serverRows, ...localOrdersFor(input, seen)];

  const keys = new Set<string>([...OPEN_STATUSES, ...Object.keys(queue ?? {})]);
  const buckets: QueueBuckets<T | LocalOrder> = {};
  for (const key of keys) {
    buckets[key] = rows
      .filter((order) => order.status === key)
      .sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
  }
  return buckets;
}

/** Line items of queued sales, shaped like `orders:getAllOrderItems` rows. */
export function localOrderItems(input: OfflineOrderInput): (LocalOrderItem & { orderId: string })[] {
  return mineOnly(input.sales, input.tenantId).flatMap((sale) =>
    toLocalItems(sale.orderArgs.items).map((item) => ({ ...item, orderId: queuedSaleOrderId(sale) }))
  );
}

/** Payments collected offline for one order, as settlement-ledger rows. */
export function localPaymentsFor(orderId: string, edits: readonly QueuedOrderEdit[]): OrderPaymentLike[] {
  return edits
    .filter((edit) => edit.orderId === orderId && edit.ref === "orders:recordPayment")
    .sort(byCreatedAt)
    .map((edit) => ({
      _id: `offline:${edit.editId}`,
      _creationTime: edit.createdAt,
      kind: edit.args.kind === "refund" ? "refund" : "charge",
      amount: asNumber(edit.args.amount) ?? 0,
      paymentMethodName: asString(edit.args.paymentMethodName),
      reference: asString(edit.args.reference),
      note: asString(edit.args.note),
    }));
}
