/**
 * Changes made to orders while the server could not hear them — a status
 * moved, an order cancelled, a bill collected — waiting to be written.
 *
 * The sales outbox (`order-outbox.ts`) holds orders the server has never
 * seen; this holds what staff did to orders afterwards, so an offline shop
 * keeps running its queue as usual: confirm, prepare, hand over, cancel,
 * collect. Each entry is the exact mutation call the screen would have sent
 * (`ref` + `args`), replayed by `sync-order-edits.ts` through the same
 * mutation hooks once the order exists on the server.
 *
 * Persisted on every change and immutable, like the sales outbox: a force
 * quit must not lose "this table paid".
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OrderBackend } from "../order-backend";
import { isSignedOutRefusal } from "./order-outbox";

export const ORDER_EDITS_STORAGE_KEY = "pos_offline_order_edits_v1";

export const ORDER_EDIT_REFS = [
  "orders:updateOrderStatus",
  "orders:updatePaymentStatus",
  "orders:recordPayment",
] as const;

export type OrderEditRef = (typeof ORDER_EDIT_REFS)[number];

export interface QueuedOrderEdit {
  editId: string;
  tenantId: string;
  backend: OrderBackend;
  /** The order's id as this device knows it; rebound once a Convex sale lands. */
  orderId: string;
  ref: OrderEditRef;
  /** The exact argument object the screen would have sent; carries `orderId`. */
  args: Record<string, unknown>;
  /** When staff made the change (epoch ms); edits replay in this order. */
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

/** Refusals after which an edit is left for a person rather than retried. */
export const MAX_EDIT_ATTEMPTS = 5;

export function isOrderEditStuck(edit: Pick<QueuedOrderEdit, "attempts">): boolean {
  return edit.attempts >= MAX_EDIT_ATTEMPTS;
}

export function isOrderEditRef(ref: string): ref is OrderEditRef {
  return (ORDER_EDIT_REFS as readonly string[]).includes(ref);
}

export interface OrderEditsState {
  edits: readonly QueuedOrderEdit[];
  isHydrated: boolean;
}

const EMPTY: OrderEditsState = { edits: [], isHydrated: false };

let state: OrderEditsState = EMPTY;
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: OrderEditsState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

// Serialized read/modify/write, publishing only what reached the disk — the
// same discipline as the sales outbox.
let writes: Promise<void> = Promise.resolve();
function updateEdits(
  change: (edits: readonly QueuedOrderEdit[]) => readonly QueuedOrderEdit[]
): Promise<void> {
  const operation = writes.then(async () => {
    await hydrateOrderEdits();
    const edits = change(state.edits);
    if (edits === state.edits) return;
    await AsyncStorage.setItem(ORDER_EDITS_STORAGE_KEY, JSON.stringify(edits));
    emit({ ...state, edits });
  });
  writes = operation.catch(() => undefined);
  return operation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isQueuedOrderEdit(value: unknown): value is QueuedOrderEdit {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.editId) &&
    isNonEmptyString(value.tenantId) &&
    isNonEmptyString(value.orderId) &&
    ["platform", "convex", "supabase"].includes(String(value.backend)) &&
    isOrderEditRef(String(value.ref)) &&
    isRecord(value.args) &&
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt) &&
    typeof value.attempts === "number" && Number.isInteger(value.attempts) && value.attempts >= 0 &&
    (value.lastError === null || typeof value.lastError === "string")
  );
}

export function parseStoredOrderEdits(raw: string | null): QueuedOrderEdit[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isQueuedOrderEdit)) {
    throw new Error("The saved order changes are damaged. Keep this device's data and contact support.");
  }
  return parsed;
}

/** Read once; a failure keeps the stored queue intact and permits a retry. */
export function hydrateOrderEdits(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    const stored = parseStoredOrderEdits(await AsyncStorage.getItem(ORDER_EDITS_STORAGE_KEY));
    emit({ edits: stored, isHydrated: true });
  })().catch((error) => {
    hydration = null;
    throw error;
  });
  return hydration;
}

export function getOrderEdits(): OrderEditsState {
  return state;
}

export function subscribeOrderEdits(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function enqueueOrderEdit(edit: QueuedOrderEdit): Promise<void> {
  return updateEdits((edits) => [...edits, edit]);
}

export function removeOrderEdit(editId: string): Promise<void> {
  return updateEdits((edits) =>
    edits.some((edit) => edit.editId === editId) ? edits.filter((edit) => edit.editId !== editId) : edits
  );
}

export function recordOrderEditFailure(editId: string, message: string): Promise<void> {
  return updateEdits((edits) =>
    edits.some((edit) => edit.editId === editId)
      ? edits.map((edit) =>
          edit.editId === editId ? { ...edit, attempts: edit.attempts + 1, lastError: message } : edit
        )
      : edits
  );
}

/**
 * Give changes parked by a signed-out device (an expired or missing token,
 * answered as the anonymous role) a fresh set of attempts — the twin of
 * `requeueSignedOutRefusals` for sales. Called on each sign-in, so a change
 * the server really refuses is still bounded per sign-in. Returns the count.
 */
export async function requeueSignedOutEditRefusals(): Promise<number> {
  let requeued = 0;
  await updateEdits((edits) => {
    const parked = edits.filter((edit) => isOrderEditStuck(edit) && isSignedOutRefusal(edit.lastError));
    requeued = parked.length;
    if (requeued === 0) return edits;
    return edits.map((edit) => (parked.includes(edit) ? { ...edit, attempts: 0, lastError: null } : edit));
  });
  return requeued;
}

/**
 * A sale taken offline on a Convex store gets its real id only when written.
 * Persisted BEFORE the sale leaves the outbox, so the mapping is never lost.
 */
export function rebindOrderEdits(fromOrderId: string, toOrderId: string): Promise<void> {
  if (fromOrderId === toOrderId) return Promise.resolve();
  return updateEdits((edits) =>
    edits.some((edit) => edit.orderId === fromOrderId)
      ? edits.map((edit) =>
          edit.orderId === fromOrderId
            ? { ...edit, orderId: toOrderId, args: { ...edit.args, orderId: toOrderId } }
            : edit
        )
      : edits
  );
}

/** True while some change to this order has not reached the server. */
export function hasPendingOrderEdits(orderId: string): boolean {
  return state.edits.some((edit) => edit.orderId === orderId);
}

/** Test seam. */
export function resetOrderEditsForTests(): void {
  state = EMPTY;
  hydration = null;
  writes = Promise.resolve();
  listeners.clear();
}
