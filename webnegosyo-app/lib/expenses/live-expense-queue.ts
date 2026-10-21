/**
 * The device's expense and receipt queues, wired to AsyncStorage, the
 * signed-in session and the web app's receipt route. Loaded lazily by its
 * callers so logic tests never pull in the native modules behind it.
 *
 * Also the one place screens hear that the queue changed (`subscribe`), so
 * the list's "Waiting to sync" rows and the drawer's pending line update the
 * moment an entry lands, without polling.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";
import { liveExpenseDb } from "./expense-client";
import { createExpenseQueue, type ExpenseQueue, type FlushResult, type NewQueuedExpense, type QueuedExpense } from "./expense-queue";
import { findExpenseIdByRequest, voidExpense } from "./expense-service";
import { sendQueuedExpense } from "./expense-sync";
import {
  EXPENSE_RECEIPT_ROUTE,
  createReceiptQueue,
  extensionFor,
  verdictForStatus,
  type NewQueuedReceipt,
  type QueuedReceipt,
  type ReceiptQueue,
  type UploadVerdict,
} from "./receipt-queue";
import { deleteReceiptFile } from "./receipt-files";

/** A photo is a few MB over a counter's connection: longer than a JSON post. */
const UPLOAD_TIMEOUT_MS = 45_000;
const LINK_TIMEOUT_MS = 10_000;

const listeners = new Set<() => void>();

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

async function uploadReceipt(entry: QueuedReceipt, expenseId: string): Promise<UploadVerdict> {
  const { expiry, controller, clear } = deadline(UPLOAD_TIMEOUT_MS);
  try {
    const token = await Promise.race([getAccessTokenBounded(UPLOAD_TIMEOUT_MS), expiry]);
    if (!token) return "retry";
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
    return verdictForStatus(response.status);
  } catch {
    return "retry";
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
    const kept = await liveExpenseQueue().enqueue(entry, { holdMs });
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
    await liveReceiptQueue().enqueue(receipt);
    notify();
    void flushReceipts(receipt.tenantId);
  } catch (error) {
    console.warn("[expenses] could not keep the receipt on this phone", error);
  }
}

let flushing: Promise<FlushResult> | null = null;

/** Send what is waiting for this store: expenses first, then their receipts. Never throws. */
export function flushExpenses(tenantId: string): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const result = await liveExpenseQueue().flush(tenantId);
    notify();
    await flushReceipts(tenantId);
    return result;
  })()
    .catch(() => ({ sent: new Map<string, string>(), waiting: 0, refused: 0 }))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

async function flushReceipts(tenantId: string): Promise<void> {
  try {
    await liveReceiptQueue().flush(tenantId);
  } catch {
    // Kept on the phone; the next flush retries.
  }
  notify();
}

export async function pendingExpenses(tenantId: string): Promise<QueuedExpense[]> {
  try {
    return await liveExpenseQueue().pending(tenantId);
  } catch {
    return [];
  }
}

export async function pendingReceipts(tenantId: string): Promise<QueuedReceipt[]> {
  try {
    return await liveReceiptQueue().pending(tenantId);
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

export async function retryQueuedExpenses(tenantId: string): Promise<FlushResult> {
  await liveExpenseQueue().retryNow(tenantId);
  return flushExpenses(tenantId);
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
