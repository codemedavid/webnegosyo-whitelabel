/**
 * The device's expense and receipt queues, wired to AsyncStorage, the
 * signed-in session and the web app's receipt route. Loaded lazily by its
 * callers so logic tests never pull in the native modules behind it.
 *
 * Also the one place screens hear that the queue changed (`subscribe`), so
 * the list's "Waiting to sync" rows and the drawer's pending line update the
 * moment an entry lands, without polling.
 *
 * Everything here is for the SIGNED-IN person: new entries are stamped with
 * their user id, and only their entries are sent or shown. Another person's
 * entries stay parked on the phone (sign-out never clears them) until that
 * person signs in again.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../../stores/auth-store";
import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";
import { liveExpenseDb } from "./expense-client";
import {
  createExpenseQueue,
  createSingleFlight,
  type ExpenseQueue,
  type FlushResult,
  type NewQueuedExpense,
  type QueuedExpense,
} from "./expense-queue";
import { findExpenseIdByRequest, voidExpense } from "./expense-service";
import { sendQueuedExpense } from "./expense-sync";
import {
  EXPENSE_RECEIPT_ROUTE,
  createReceiptQueue,
  extensionFor,
  receiptRefusalReason,
  verdictForStatus,
  type NewQueuedReceipt,
  type QueuedReceipt,
  type ReceiptQueue,
  type UploadAnswer,
} from "./receipt-queue";
import { deleteReceiptFile } from "./receipt-files";

/** A photo is a few MB over a counter's connection: longer than a JSON post. */
const UPLOAD_TIMEOUT_MS = 45_000;
const LINK_TIMEOUT_MS = 10_000;

const listeners = new Set<() => void>();

/** The person whose entries this phone sends and shows right now. */
function currentUserId(): string | null {
  return useAuthStore.getState().userId;
}

export function subscribeExpenseQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.warn("[expenses] queue listener failed", error);
    }
  }
}

/** A promise that rejects after `ms`, with an abort for the request it races. */
function deadline(ms: number): { expiry: Promise<never>; controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, ms);
  });
  return { expiry, controller, clear: () => clearTimeout(timer) };
}

async function uploadReceipt(entry: QueuedReceipt, expenseId: string): Promise<UploadAnswer> {
  const { expiry, controller, clear } = deadline(UPLOAD_TIMEOUT_MS);
  try {
    const token = await Promise.race([getAccessTokenBounded(UPLOAD_TIMEOUT_MS), expiry]);
    // No session right now (offline refresh): not an attempt.
    if (!token) return "offline";
    const form = new FormData();
    form.append("expenseId", expenseId);
    // React Native's FormData streams a local file from `{ uri, name, type }`.
    form.append("file", {
      uri: entry.fileUri,
      name: `receipt.${extensionFor(entry.mime)}`,
      type: entry.mime,
    } as unknown as Blob);
    const response = await Promise.race([
      fetch(`${getWebAppUrl()}${EXPENSE_RECEIPT_ROUTE}`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }),
      expiry,
    ]);
    const verdict = verdictForStatus(response.status);
    return verdict === "drop" ? { verdict, reason: receiptRefusalReason(response.status) } : verdict;
  } catch {
    // Offline or timed out: no answer, not an attempt.
    return "offline";
  } finally {
    clear();
  }
}

let expenseQueue: ExpenseQueue | null = null;
let receiptQueue: ReceiptQueue | null = null;

export function liveExpenseQueue(): ExpenseQueue {
  expenseQueue ??= createExpenseQueue({
    storage: AsyncStorage,
    send: (entry) => sendQueuedExpense(liveExpenseDb, entry),
  });
  return expenseQueue;
}

export function liveReceiptQueue(): ReceiptQueue {
  receiptQueue ??= createReceiptQueue({
    storage: AsyncStorage,
    resolveExpenseId: (entry) => findExpenseIdByRequest(liveExpenseDb, entry.tenantId, entry.clientRequestId),
    upload: uploadReceipt,
    deleteFile: deleteReceiptFile,
  });
  return receiptQueue;
}

/**
 * Keep an expense on the phone. With `holdMs` it waits out the Undo window
 * first (`commitQueuedExpense` ends the wait). Never throws.
 */
export async function queueExpense(entry: NewQueuedExpense, holdMs = 0): Promise<QueuedExpense | null> {
  try {
    const kept = await liveExpenseQueue().enqueue({ ...entry, userId: entry.userId ?? currentUserId() }, { holdMs });
    notify();
    return kept;
  } catch (error) {
    console.warn("[expenses] could not keep the expense on this phone", error);
    return null;
  }
}

/** Queue a receipt for an expense (landed or not) and try to send it. Never throws. */
export async function queueReceipt(receipt: NewQueuedReceipt): Promise<void> {
  try {
    await liveReceiptQueue().enqueue({ ...receipt, userId: receipt.userId ?? currentUserId() });
    notify();
    void flushReceipts(receipt.tenantId);
  } catch (error) {
    console.warn("[expenses] could not keep the receipt on this phone", error);
  }
}

const NO_FLUSH = (): FlushResult => ({ sent: new Map<string, string>(), waiting: 0, refused: 0 });

/** One pass for one store + person: expenses first, then their receipts. */
async function flushPass(tenantId: string, userId: string | null): Promise<FlushResult> {
  const result = await liveExpenseQueue().flush(tenantId, userId);
  notify();
  await flushReceipts(tenantId, userId);
  return result;
}

const SEPARATOR = "\u0000";

const flushFlight = createSingleFlight<FlushResult>(
  (key) => {
    const [tenantId, userId] = key.split(SEPARATOR);
    return flushPass(tenantId, userId || null);
  },
  (earlier, later) => ({ ...later, sent: new Map([...earlier.sent, ...later.sent]) }),
);

/**
 * Send what is waiting for this store and the signed-in person. One sync per
 * store + person at a time; a call made while one runs (an entry just
 * released, a Try again) gets one more pass, so it never waits for the next
 * poll. Never throws.
 */
export function flushExpenses(tenantId: string): Promise<FlushResult> {
  return flushFlight(`${tenantId}${SEPARATOR}${currentUserId() ?? ""}`).catch(NO_FLUSH);
}

async function flushReceipts(tenantId: string, userId: string | null = currentUserId()): Promise<void> {
  try {
    await liveReceiptQueue().flush(tenantId, userId);
  } catch {
    // Kept on the phone; the next flush retries.
  }
  notify();
}

/** This person's waiting and refused expenses for the store. Never throws ([] when the phone cannot read). */
export async function pendingExpenses(tenantId: string): Promise<QueuedExpense[]> {
  try {
    return await liveExpenseQueue().pending(tenantId, currentUserId());
  } catch {
    return [];
  }
}

/**
 * Like `pendingExpenses`, but a phone that cannot read its queue THROWS: a
 * drawer must not close on "nothing waiting" that was really "could not tell".
 */
export function readPendingExpensesOrThrow(tenantId: string): Promise<QueuedExpense[]> {
  return liveExpenseQueue().pending(tenantId, currentUserId());
}

export async function pendingReceipts(tenantId: string): Promise<QueuedReceipt[]> {
  try {
    return await liveReceiptQueue().pending(tenantId, currentUserId());
  } catch {
    return [];
  }
}

/** The Undo window closed: send it now. */
export async function commitQueuedExpense(tenantId: string, id: string): Promise<FlushResult> {
  await liveExpenseQueue().release(id).catch(() => undefined);
  return flushExpenses(tenantId);
}

/**
 * Undo inside the window, or dismiss a refused entry: forget it and its
 * receipt. False = it had already been sent (the caller voids instead).
 */
export async function dismissQueuedExpense(id: string): Promise<boolean> {
  const wasThere = await liveExpenseQueue().remove(id).catch(() => false);
  if (wasThere) await liveReceiptQueue().forget(id).catch(() => undefined);
  notify();
  return wasThere;
}

/** Make this person's waiting entries due now and send. Throws only when the phone cannot write its queue. */
export async function retryQueuedExpenses(tenantId: string): Promise<FlushResult> {
  await liveExpenseQueue().retryNow(tenantId, currentUserId());
  return flushExpenses(tenantId);
}

/** Try again on one refused expense: clear the refusal and send it now. Never throws. */
export async function retryRefusedExpense(tenantId: string, id: string): Promise<FlushResult> {
  try {
    await liveExpenseQueue().retryRefused(id);
  } catch (error) {
    console.warn("[expenses] could not mark the expense for another try", error);
  }
  notify();
  return flushExpenses(tenantId);
}

/** Try again on one photo that stopped uploading. Never throws. */
export async function retryReceipt(tenantId: string, id: string): Promise<void> {
  try {
    await liveReceiptQueue().retryRefused(id);
  } catch (error) {
    console.warn("[expenses] could not mark the receipt for another try", error);
  }
  await flushReceipts(tenantId);
}

/** Remove one photo from this phone (and its file). Never throws. */
export async function dismissReceipt(id: string): Promise<void> {
  await liveReceiptQueue().dismiss(id).catch((error) => console.warn("[expenses] could not remove the receipt", error));
  notify();
}

export type ReceiptLinkResult = { status: "ok"; url: string } | { status: "error"; message: string };

/** A 5-minute link to one receipt, asked for as the signed-in user (RLS decides). */
export async function fetchReceiptLink(receiptId: string): Promise<ReceiptLinkResult> {
  const { expiry, controller, clear } = deadline(LINK_TIMEOUT_MS);
  try {
    const token = await Promise.race([getAccessTokenBounded(LINK_TIMEOUT_MS), expiry]);
    if (!token) return { status: "error", message: "Sign in again to view this receipt." };
    const response = await Promise.race([
      fetch(`${getWebAppUrl()}${EXPENSE_RECEIPT_ROUTE}/link?id=${encodeURIComponent(receiptId)}`, {
        method: "GET",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      }),
      expiry,
    ]);
    const json = (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
    if (response.ok && typeof json.url === "string") return { status: "ok", url: json.url };
    return {
      status: "error",
      message: typeof json.error === "string" && json.error ? json.error : "Could not open the receipt. Try again.",
    };
  } catch {
    return { status: "error", message: "No connection. Try again when you are online." };
  } finally {
    clear();
  }
}

export type UndoOutcome = { status: "undone" } | { status: "error"; message: string };

/**
 * Undo a save from the snackbar. Inside the hold it never left the phone, so
 * it is simply forgotten. If it already landed, it is voided with reason
 * "Undo" — for a drawer expense on an open shift that also puts the cash back
 * (contract §5), so a cashier may undo their own.
 */
export async function undoExpense(input: {
  tenantId: string;
  requestId: string;
  actorName: string;
}): Promise<UndoOutcome> {
  if (await dismissQueuedExpense(input.requestId)) return { status: "undone" };
  try {
    const expenseId = await findExpenseIdByRequest(liveExpenseDb, input.tenantId, input.requestId);
    if (!expenseId) return { status: "error", message: "It is still being saved. Try again from the expense list." };
    await voidExpense(liveExpenseDb, expenseId, "Undo", input.actorName);
    return { status: "undone" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not undo it. Try again." };
  }
}
