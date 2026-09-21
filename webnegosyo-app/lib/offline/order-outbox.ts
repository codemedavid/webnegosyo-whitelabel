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
   * sale — bookkeeping is at-most-once, exactly as on the online path.
   */
  bookkeepingDone?: boolean;
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
  try {
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(sales));
  } catch (error) {
    console.warn("[offline] Could not persist the sales outbox:", error);
  }
}

function isQueuedSale(value: unknown): value is QueuedSale {
  if (!value || typeof value !== "object") return false;
  const sale = value as Partial<QueuedSale>;
  return (
    typeof sale.localId === "string" &&
    typeof sale.tenantId === "string" &&
    typeof sale.clientOrderId === "string" &&
    typeof sale.createdAt === "number" &&
    !!sale.orderArgs &&
    typeof sale.orderArgs === "object" &&
    !!sale.bookkeeping &&
    typeof sale.bookkeeping === "object"
  );
}

export function parseStoredOutbox(raw: string | null): QueuedSale[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedSale);
  } catch {
    return [];
  }
}

/** Read the queue off disk once; every write waits for this first. */
export function hydrateOutbox(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    let stored: QueuedSale[] = [];
    try {
      stored = parseStoredOutbox(await AsyncStorage.getItem(OUTBOX_STORAGE_KEY));
    } catch {
      stored = [];
    }
    // Anything enqueued while the read was in flight stays ahead of nothing:
    // the disk copy is older, so it goes first.
    emit({ sales: [...stored, ...state.sales], isHydrated: true });
  })();
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

export async function enqueueSale(sale: QueuedSale): Promise<void> {
  await hydrateOutbox();
  const sales = [...state.sales, sale];
  emit({ ...state, sales });
  await persist(sales);
}

export async function removeQueuedSale(localId: string): Promise<void> {
  await hydrateOutbox();
  const sales = state.sales.filter((sale) => sale.localId !== localId);
  if (sales.length === state.sales.length) return;
  emit({ ...state, sales });
  await persist(sales);
}

/** The server holds the order and its paid status; persisted BEFORE bookkeeping. */
export async function markSaleWritten(localId: string, orderId: string): Promise<void> {
  await hydrateOutbox();
  const sales = state.sales.map((sale) =>
    sale.localId === localId ? { ...sale, syncedOrderId: orderId } : sale
  );
  emit({ ...state, sales });
  await persist(sales);
}

/** The bookkeeping has run; persisted BEFORE the sale is forgotten. */
export async function markBookkeepingDone(localId: string): Promise<void> {
  await hydrateOutbox();
  const sales = state.sales.map((sale) =>
    sale.localId === localId ? { ...sale, bookkeepingDone: true } : sale
  );
  emit({ ...state, sales });
  await persist(sales);
}

export async function recordSyncFailure(localId: string, message: string): Promise<void> {
  await hydrateOutbox();
  const sales = state.sales.map((sale) =>
    sale.localId === localId
      ? { ...sale, attempts: sale.attempts + 1, lastError: message }
      : sale
  );
  emit({ ...state, sales });
  await persist(sales);
}

/** True while a sale taken offline has not yet been written to the server. */
export function isSaleQueued(localId: string): boolean {
  return state.sales.some((sale) => sale.localId === localId);
}

/** Test seam. */
export function resetOutboxForTests(): void {
  state = EMPTY;
  hydration = null;
  listeners.clear();
}
