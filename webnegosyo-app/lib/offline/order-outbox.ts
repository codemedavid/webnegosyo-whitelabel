/**
 * Counter sales taken while the server could not be reached, waiting to be
 * written.
 *
 * A queued sale is COMPLETE from the cashier's point of view: the customer has
 * paid, the receipt and kitchen chit have printed, the till is back on the
 * register. What is queued is everything the sale still owes the server — the
 * order row, its paid status and the bookkeeping (stock, Loyverse, vouchers,
 * activity, customer capture) — replayed by `sync-outbox.ts` when the
 * connection returns, through the same mutation hook the online path uses.
 *
 * Persisted on every change: a force quit or a dead battery must not lose a
 * sale that has already been paid for. Entries are immutable; every change
 * returns a new array.
 *
 * Storage note: order arguments carry the customer's name and contact when
 * one was attached. That is the same data the order row itself holds, kept on
 * the merchant's own device only until the row is written.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OrderBackend } from "../order-backend";
import type { OrderDiscountLine } from "../order-totals";
import type { PosStockItem } from "../pos-stock";
import type { LoyverseOrderLine } from "../loyverse-notify";
import type { CaptureItem } from "../customers/capture";

export const OUTBOX_STORAGE_KEY = "pos_offline_outbox_v1";

/** Everything the post-sale bookkeeping needs, precomputed at tender time. */
export interface QueuedSaleBookkeeping {
  stockItems: PosStockItem[];
  loyverseLines: LoyverseOrderLine[];
  discountLines: OrderDiscountLine[];
  outletId: string | null;
  total: number;
  customerName: string;
  customerContact: string;
  customerData: Record<string, unknown>;
  channel: string | null;
  captureItems: CaptureItem[];
}

export interface QueuedSale {
  /** The id printed on the paper; the platform row is inserted under it. */
  localId: string;
  tenantId: string;
  backend: OrderBackend;
  /** The idempotency key, so a replay after an ambiguous failure never doubles. */
  clientOrderId: string;
  /** When the sale was actually taken (epoch ms) — the order's true time. */
  createdAt: number;
  /** The exact `createOrder` argument object the register would have sent. */
  orderArgs: Record<string, unknown>;
  bookkeeping: QueuedSaleBookkeeping;
  attempts: number;
  lastError: string | null;
  /**
   * Set once the server holds the order AND its paid status. A replay that
   * finds it never calls `createOrder` again (deduped anyway, but free).
   */
  syncedOrderId?: string | null;
  /**
   * Set once the bookkeeping (stock, Loyverse, vouchers, activity, capture)
   * has run for this sale. The Loyverse receipt and customer capture are not
   * idempotent, so a replay that finds this skips straight to forgetting the
   * sale. This is a checkpoint, not an exactly-once guarantee: a crash after
   * a remote side effect and before this write can still repeat that effect.
   */
  bookkeepingDone?: boolean;
  /**
   * False for a "pay later" sale: the order is written UNPAID and the cashier
   * collects it from the order screen. Absent on sales queued before the flag
   * existed, which were all paid at the counter — see {@link isPaidAtTender}.
   */
  paidAtTender?: boolean;
}

/** Was the money taken when this sale was rung up? Absent means yes. */
export function isPaidAtTender(sale: Pick<QueuedSale, "paidAtTender">): boolean {
  return sale.paidAtTender !== false;
}

/** Refusals after which a sale is left for a person rather than retried. */
export const MAX_SYNC_ATTEMPTS = 5;

export function needsAttention(sale: QueuedSale): boolean {
  return sale.attempts >= MAX_SYNC_ATTEMPTS;
}

export interface OutboxState {
  sales: readonly QueuedSale[];
  isHydrated: boolean;
}

const EMPTY: OutboxState = { sales: [], isHydrated: false };

let state: OutboxState = EMPTY;
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: OutboxState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

async function persist(sales: readonly QueuedSale[]): Promise<void> {
  await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(sales));
}

// Serialize read/modify/write operations and publish only durable state. A
// failed operation rejects its caller without poisoning subsequent writes.
let writes: Promise<void> = Promise.resolve();
function updateSales(change: (sales: readonly QueuedSale[]) => readonly QueuedSale[]): Promise<void> {
  const operation = writes.then(async () => {
    await hydrateOutbox();
    const sales = change(state.sales);
    if (sales === state.sales) return;
    await persist(sales);
    emit({ ...state, sales });
  });
  writes = operation.catch(() => undefined);
  return operation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isQueuedSale(value: unknown): value is QueuedSale {
  if (!isRecord(value)) return false;
  const book = value.bookkeeping;
  return (
    typeof value.localId === "string" && value.localId.length > 0 &&
    typeof value.tenantId === "string" && value.tenantId.length > 0 &&
    typeof value.clientOrderId === "string" && value.clientOrderId.length > 0 &&
    ["platform", "convex", "supabase"].includes(String(value.backend)) &&
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt) &&
    typeof value.attempts === "number" && Number.isInteger(value.attempts) && value.attempts >= 0 &&
    (value.lastError === null || typeof value.lastError === "string") &&
    (value.syncedOrderId == null || (typeof value.syncedOrderId === "string" && value.syncedOrderId.length > 0)) &&
    (value.bookkeepingDone === undefined || typeof value.bookkeepingDone === "boolean") &&
    isRecord(value.orderArgs) && isRecord(book) &&
    Array.isArray(book.stockItems) && Array.isArray(book.loyverseLines) &&
    Array.isArray(book.discountLines) && Array.isArray(book.captureItems) &&
    typeof book.total === "number" && Number.isFinite(book.total) &&
    typeof book.customerName === "string" && typeof book.customerContact === "string" &&
    isRecord(book.customerData) &&
    (book.outletId === null || typeof book.outletId === "string") &&
    (book.channel === null || typeof book.channel === "string")
  );
}

export function parseStoredOutbox(raw: string | null): QueuedSale[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isQueuedSale)) {
    throw new Error("The saved sales queue is damaged. Keep this device's data and contact support.");
  }
  return parsed;
}

/** Read once; failures keep the original ledger intact and permit a retry. */
export function hydrateOutbox(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    const stored = parseStoredOutbox(await AsyncStorage.getItem(OUTBOX_STORAGE_KEY));
    emit({ sales: stored, isHydrated: true });
  })().catch((error) => {
    hydration = null;
    throw error;
  });
  return hydration;
}

export function getOutbox(): OutboxState {
  return state;
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function enqueueSale(sale: QueuedSale): Promise<string> {
  let localId = sale.localId;
  await updateSales((sales) => {
    const existing = sales.find((entry) => entry.tenantId === sale.tenantId && entry.clientOrderId === sale.clientOrderId);
    if (existing) {
      localId = existing.localId;
      return sales;
    }
    return [...sales, sale];
  });
  return localId;
}

export function removeQueuedSale(localId: string): Promise<void> {
  return updateSales((sales) => sales.some((sale) => sale.localId === localId)
    ? sales.filter((sale) => sale.localId !== localId)
    : sales);
}

function updateSale(localId: string, change: (sale: QueuedSale) => QueuedSale): Promise<void> {
  return updateSales((sales) => sales.some((sale) => sale.localId === localId)
    ? sales.map((sale) => sale.localId === localId ? change(sale) : sale)
    : sales);
}

/** The server holds the order and its paid status; persisted BEFORE bookkeeping. */
export function markSaleWritten(localId: string, orderId: string): Promise<void> {
  return updateSale(localId, (sale) => ({ ...sale, syncedOrderId: orderId }));
}

/** The bookkeeping has run; persisted BEFORE the sale is forgotten. */
export function markBookkeepingDone(localId: string): Promise<void> {
  return updateSale(localId, (sale) => ({ ...sale, bookkeepingDone: true }));
}

export function recordSyncFailure(localId: string, message: string): Promise<void> {
  return updateSale(localId, (sale) => ({ ...sale, attempts: sale.attempts + 1, lastError: message }));
}

/**
 * Refusals that mean "this device was signed out", not "this sale is wrong":
 * PostgREST answering the anonymous role (RLS, or no usable token).
 */
const SIGNED_OUT_REFUSAL_PATTERNS: readonly RegExp[] = [
  /row-level security policy/i,
  /JWT expired/i,
  /No API key found/i,
  /invalid JWT/i,
];

export function isSignedOutRefusal(message: string | null): boolean {
  return message !== null && SIGNED_OUT_REFUSAL_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Give sales parked by a signed-out device a fresh set of attempts. Called on
 * each sign-in, so a sale the server really refuses is still bounded to
 * `MAX_SYNC_ATTEMPTS` per sign-in. Returns how many were requeued.
 */
export async function requeueSignedOutRefusals(): Promise<number> {
  let requeued = 0;
  await updateSales((sales) => {
    const parked = sales.filter((sale) => needsAttention(sale) && isSignedOutRefusal(sale.lastError));
    requeued = parked.length;
    if (requeued === 0) return sales;
    return sales.map((sale) => parked.includes(sale) ? { ...sale, attempts: 0, lastError: null } : sale);
  });
  return requeued;
}

/** True while a sale taken offline has not yet been written to the server. */
export function isSaleQueued(localId: string): boolean {
  return state.sales.some((sale) => sale.localId === localId);
}

/** Test seam. */
export function resetOutboxForTests(): void {
  state = EMPTY;
  hydration = null;
  writes = Promise.resolve();
  listeners.clear();
}
