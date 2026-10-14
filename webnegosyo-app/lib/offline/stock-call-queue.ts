/**
 * Stock calls the platform has not acknowledged yet, kept on the device.
 *
 * Screens fire four stock calls and move on: a status change's `restore` (into
 * `cancelled`) or `redeplete` (out of it), an order edit's `revise`, and a
 * scanned QR sale's `deplete`. They used to be retried for ~40 seconds in
 * memory; a killed app or a long outage lost them, and the shelf stayed wrong.
 * Each is now written here BEFORE its first attempt and drained by
 * `drain-stock-calls.ts` until the platform answers for good.
 *
 * (A counter sale's own depletion rides in the sales outbox instead — it owes
 * the order row too. Both settle through `stock-retry-policy.ts`.)
 *
 * Order matters per order: a restore and the redeplete after it must reach the
 * server in that order. The array IS the enqueue order and is never re-sorted.
 *
 * Persisted on every change; entries are immutable, every change returns a new
 * array. Only ids and option ids are stored — no customer data.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PosStockItem } from "../pos-stock";
import type { StockAuditSource } from "../pos-stock-notify";
import { newLocalOrderId } from "./local-id";

export const STOCK_CALL_QUEUE_STORAGE_KEY = "stock_call_queue_v1";

export type StockCallAction = "deplete" | "restore" | "redeplete" | "revise";

const STOCK_CALL_ACTIONS: readonly StockCallAction[] = ["deplete", "restore", "redeplete", "revise"];

/** What the action needs beyond the order: lines for deplete, the diff for revise. */
export interface StockCallPayload {
  items?: PosStockItem[];
  revision?: number;
  deplete?: PosStockItem[];
  restore?: PosStockItem[];
  source?: StockAuditSource;
}

export interface QueuedStockCall {
  id: string;
  tenantId: string;
  orderId: string;
  action: StockCallAction;
  payload: StockCallPayload;
  /** Attempts made so far; drives the backoff and the cap. */
  attempts: number;
  /** Epoch ms before which it is not tried again; null = due now. */
  retryAt: number | null;
  createdAt: number;
}

export type NewStockCall = Pick<QueuedStockCall, "tenantId" | "orderId" | "action" | "payload">;

let calls: readonly QueuedStockCall[] = [];
let hydration: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isQueuedStockCall(value: unknown): value is QueuedStockCall {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.tenantId) &&
    isNonEmptyString(value.orderId) &&
    STOCK_CALL_ACTIONS.includes(value.action as StockCallAction) &&
    isRecord(value.payload) &&
    typeof value.attempts === "number" && Number.isInteger(value.attempts) && value.attempts >= 0 &&
    (value.retryAt === null || (typeof value.retryAt === "number" && Number.isFinite(value.retryAt))) &&
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
  );
}

/**
 * Damaged entries are dropped with a warning rather than refusing the queue: a
 * stock call is reconcilable by a stocktake, a register that will not start is
 * not (unlike the sales outbox, which holds money and refuses instead).
 */
export function parseStoredStockCalls(raw: string | null): QueuedStockCall[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[stock] The saved stock-call queue is unreadable; starting empty.");
    return [];
  }
  const entries = Array.isArray(parsed) ? parsed : [];
  const valid = entries.filter(isQueuedStockCall);
  if (valid.length !== entries.length || !Array.isArray(parsed)) {
    console.warn(`[stock] Dropped ${entries.length - valid.length} damaged stock call(s) from the saved queue.`);
  }
  return valid;
}

/** Read once; a failed read permits a retry. */
export function hydrateStockCalls(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    calls = parseStoredStockCalls(await AsyncStorage.getItem(STOCK_CALL_QUEUE_STORAGE_KEY));
  })().catch((error) => {
    hydration = null;
    throw error;
  });
  return hydration;
}

export function getStockCalls(): readonly QueuedStockCall[] {
  return calls;
}

// Serialised read/modify/write; only durable state is published.
let writes: Promise<void> = Promise.resolve();
function updateCalls(change: (current: readonly QueuedStockCall[]) => readonly QueuedStockCall[]): Promise<void> {
  const operation = writes.then(async () => {
    await hydrateStockCalls();
    const next = change(calls);
    if (next === calls) return;
    await AsyncStorage.setItem(STOCK_CALL_QUEUE_STORAGE_KEY, JSON.stringify(next));
    calls = next;
  });
  writes = operation.catch(() => undefined);
  return operation;
}

/**
 * The same call as the order's LATEST queued one — a double tap, or a replay
 * enqueuing what a screen already queued. Compared with the tail only: a
 * restore after a redeplete after a restore is three real calls.
 */
function repeatsOrderTail(current: readonly QueuedStockCall[], call: NewStockCall): QueuedStockCall | null {
  const tail = [...current].reverse().find(
    (entry) => entry.tenantId === call.tenantId && entry.orderId === call.orderId,
  );
  if (!tail) return null;
  const isSame = tail.action === call.action && tail.payload.revision === call.payload.revision;
  return isSame ? tail : null;
}

/** Persist a call, due now. Answers the entry kept (an existing one on a repeat). */
export async function enqueueStockCall(call: NewStockCall, now: number = Date.now()): Promise<QueuedStockCall> {
  const fresh: QueuedStockCall = { ...call, id: newLocalOrderId(), attempts: 0, retryAt: null, createdAt: now };
  let kept = fresh;
  await updateCalls((current) => {
    const repeat = repeatsOrderTail(current, call);
    if (!repeat) return [...current, fresh];
    kept = repeat;
    return current;
  });
  return kept;
}

export function removeStockCall(id: string): Promise<void> {
  return updateCalls((current) => current.some((entry) => entry.id === id)
    ? current.filter((entry) => entry.id !== id)
    : current);
}

/** Count the attempt and park the call until `retryAt`. */
export function deferStockCall(id: string, attempts: number, retryAt: number): Promise<void> {
  return updateCalls((current) => current.some((entry) => entry.id === id)
    ? current.map((entry) => entry.id === id ? { ...entry, attempts, retryAt } : entry)
    : current);
}

/** Test seam. */
export function resetStockCallsForTests(): void {
  calls = [];
  hydration = null;
  writes = Promise.resolve();
}
