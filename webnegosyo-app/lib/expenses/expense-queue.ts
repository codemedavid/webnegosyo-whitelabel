/**
 * Expenses this phone recorded that the platform has not acknowledged yet.
 *
 * Modelled on `lib/offline/stock-call-queue.ts`: written BEFORE the first
 * attempt, so a palengke run typed in a dead zone survives the app being
 * killed, then drained until the platform answers for good. Unlike a stock
 * call, an expense is money: it is never abandoned for running out of
 * attempts. A refusal (the shift closed, the category was archived…) is kept
 * with its reason and shown, so a person decides what happens to it.
 *
 * Every entry carries the `client_request_id` minted when it was typed, which
 * is also its queue id: a replay of an entry that DID land is answered with the
 * first row (insert conflict / idempotent RPC), so nothing is ever recorded
 * twice (contract §9).
 *
 * Storage, the clock and the sender are injected so this runs under the node
 * Jest project; `live-expense-queue.ts` wires the real ones.
 */

import type { DrawerExpenseInput } from "./expense-service";
import type { ExpenseDraft } from "./types";

export const EXPENSE_QUEUE_STORAGE_KEY = "wn-expense-queue-v1";
/** First wait after an attempt that did not land; doubles per attempt. */
export const EXPENSE_RETRY_BASE_MS = 15_000;
/** The longest wait between two attempts. */
export const EXPENSE_RETRY_MAX_MS = 15 * 60_000;

export type QueuedExpensePayload =
  | { kind: "book"; draft: ExpenseDraft; createdByName: string }
  | { kind: "drawer"; input: DrawerExpenseInput };

export interface QueuedExpense {
  /** = the entry's client_request_id. */
  id: string;
  tenantId: string;
  payload: QueuedExpensePayload;
  /** For the list row while it waits: what it was and what it cost. */
  categoryName: string;
  attempts: number;
  /** Epoch ms before which it is not tried again; null = due now. */
  retryAt: number | null;
  createdAt: number;
  /** Set when the platform refused it for good; it is then never retried. */
  refusedReason: string | null;
}

/** What one attempt answered. */
export type SendOutcome =
  | { status: "sent"; expenseId: string }
  | { status: "retry" }
  | { status: "refused"; reason: string };

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ExpenseQueueDeps {
  storage: KeyValueStorage;
  send(entry: QueuedExpense): Promise<SendOutcome>;
  now?: () => number;
}

export interface NewQueuedExpense {
  tenantId: string;
  payload: QueuedExpensePayload;
  categoryName: string;
}

export interface FlushResult {
  /** Request id → server id, for everything that landed this pass. */
  sent: Map<string, string>;
  waiting: number;
  refused: number;
}

export interface ExpenseQueue {
  /**
   * Persist an entry. A repeat of a waiting request id keeps the first.
   * `holdMs` keeps it unsent for the Undo window: Undo is then just `remove`,
   * and nothing has to be voided.
   */
  enqueue(entry: NewQueuedExpense, options?: { holdMs?: number }): Promise<QueuedExpense>;
  /** Try every due entry of this store once. Never throws. */
  flush(tenantId: string): Promise<FlushResult>;
  pending(tenantId?: string): Promise<QueuedExpense[]>;
  /** Forget an entry (Undo inside the hold, or a person dismissed a refused one). True = it was there. */
  remove(id: string): Promise<boolean>;
  /** End one entry's hold (its Undo window closed): due now. */
  release(id: string): Promise<void>;
  /** Make every waiting entry due now (a "Try again" tap, or the Undo window closing). */
  retryNow(tenantId: string): Promise<void>;
}

export function requestIdOf(payload: QueuedExpensePayload): string {
  return payload.kind === "book" ? payload.draft.clientRequestId : payload.input.clientRequestId;
}

export function amountOf(payload: QueuedExpensePayload): number {
  return payload.kind === "book" ? payload.draft.amountCents : payload.input.amountCents;
}

/** When to try again after `attempts` failed tries. */
export function nextExpenseRetryAt(now: number, attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 20));
  return now + Math.min(EXPENSE_RETRY_BASE_MS * 2 ** exponent, EXPENSE_RETRY_MAX_MS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPayload(value: unknown): value is QueuedExpensePayload {
  if (!isRecord(value)) return false;
  if (value.kind === "book") {
    const draft = value.draft;
    return isRecord(draft) && typeof draft.clientRequestId === "string" && typeof draft.amountCents === "number";
  }
  if (value.kind === "drawer") {
    const input = value.input;
    return (
      isRecord(input) &&
      typeof input.clientRequestId === "string" &&
      typeof input.shiftId === "string" &&
      typeof input.amountCents === "number"
    );
  }
  return false;
}

function isQueuedExpense(value: unknown): value is QueuedExpense {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.tenantId === "string" &&
    isPayload(value.payload) &&
    typeof value.categoryName === "string" &&
    typeof value.attempts === "number" &&
    (value.retryAt === null || typeof value.retryAt === "number") &&
    typeof value.createdAt === "number" &&
    (value.refusedReason === null || typeof value.refusedReason === "string")
  );
}

/** Damaged entries are dropped with a warning rather than refusing the whole queue. */
export function parseExpenseQueue(raw: string | null): QueuedExpense[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [];
    const valid = entries.filter(isQueuedExpense);
    if (valid.length !== entries.length) {
      console.warn(`[expenses] Dropped ${entries.length - valid.length} damaged queued expense(s).`);
    }
    return valid;
  } catch {
    console.warn("[expenses] The saved expense queue is unreadable; starting empty.");
    return [];
  }
}

export function createExpenseQueue(deps: ExpenseQueueDeps): ExpenseQueue {
  const now = deps.now ?? Date.now;
  // Serialised, so a flush and an enqueue racing never lose an entry.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const result = chain.then(task, task);
    chain = result.catch(() => undefined);
    return result;
  }

  const read = async () => parseExpenseQueue(await deps.storage.getItem(EXPENSE_QUEUE_STORAGE_KEY));
  const write = (entries: readonly QueuedExpense[]) =>
    deps.storage.setItem(EXPENSE_QUEUE_STORAGE_KEY, JSON.stringify(entries));

  return {
    enqueue: (entry, options = {}) =>
      serial(async () => {
        const existing = await read();
        const id = requestIdOf(entry.payload);
        const repeat = existing.find((queued) => queued.id === id);
        if (repeat) return repeat;
        const fresh: QueuedExpense = {
          ...entry,
          id,
          attempts: 0,
          retryAt: options.holdMs && options.holdMs > 0 ? now() + options.holdMs : null,
          createdAt: now(),
          refusedReason: null,
        };
        await write([...existing, fresh]);
        return fresh;
      }),

    flush: (tenantId) =>
      serial(async () => {
        const entries = await read();
        const sent = new Map<string, string>();
        const next: QueuedExpense[] = [];
        // In the order they were typed: a drawer's expenses land oldest first.
        for (const entry of entries) {
          const isDue = entry.retryAt === null || entry.retryAt <= now();
          if (entry.tenantId !== tenantId || entry.refusedReason !== null || !isDue) {
            next.push(entry);
            continue;
          }
          const outcome = await deps.send(entry).catch((): SendOutcome => ({ status: "retry" }));
          if (outcome.status === "sent") {
            sent.set(entry.id, outcome.expenseId);
            continue;
          }
          const attempts = entry.attempts + 1;
          next.push(
            outcome.status === "refused"
              ? { ...entry, attempts, retryAt: null, refusedReason: outcome.reason }
              : { ...entry, attempts, retryAt: nextExpenseRetryAt(now(), attempts) },
          );
        }
        try {
          await write(next);
        } catch (error) {
          console.warn("[expenses] The expense queue could not be saved", error);
        }
        const mine = next.filter((entry) => entry.tenantId === tenantId);
        return {
          sent,
          waiting: mine.filter((entry) => entry.refusedReason === null).length,
          refused: mine.filter((entry) => entry.refusedReason !== null).length,
        };
      }).catch(() => ({ sent: new Map<string, string>(), waiting: 0, refused: 0 })),

    pending: (tenantId) =>
      serial(async () => {
        const entries = await read();
        return tenantId ? entries.filter((entry) => entry.tenantId === tenantId) : entries;
      }),

    remove: (id) =>
      serial(async () => {
        const entries = await read();
        if (!entries.some((entry) => entry.id === id)) return false;
        await write(entries.filter((entry) => entry.id !== id));
        return true;
      }),

    release: (id) =>
      serial(async () => {
        const entries = await read();
        if (!entries.some((entry) => entry.id === id && entry.retryAt !== null)) return;
        await write(entries.map((entry) => (entry.id === id ? { ...entry, retryAt: null } : entry)));
      }),

    retryNow: (tenantId) =>
      serial(async () => {
        const entries = await read();
        await write(
          entries.map((entry) =>
            entry.tenantId === tenantId && entry.refusedReason === null ? { ...entry, retryAt: null } : entry,
          ),
        );
      }),
  };
}

/** Waiting drawer expenses of one shift, in centavos — the drawer is already short by this much. */
export function pendingDrawerCents(entries: readonly QueuedExpense[], shiftId: string): { cents: number; count: number } {
  return entries.reduce(
    (sum, entry) =>
      entry.payload.kind === "drawer" && entry.payload.input.shiftId === shiftId
        ? { cents: sum.cents + entry.payload.input.amountCents, count: sum.count + 1 }
        : sum,
    { cents: 0, count: 0 },
  );
}
