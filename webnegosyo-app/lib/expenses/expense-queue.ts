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
 * Every entry also carries the person who typed it: on a shared register a
 * pay-out typed by Ana offline must never be sent under Ben's session (it
 * would be refused, or recorded in his name). Other people's entries stay
 * parked on the phone until they sign in again.
 *
 * A flush holds the storage lock only to read what is due and to write each
 * answer back — never while a request is on the wire — so a save made during
 * a slow sync returns at once.
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
  /**
   * The signed-in person who typed it. Absent/null on entries saved before
   * this was recorded: those are treated as whoever is signed in.
   */
  userId?: string | null;
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
  userId?: string | null;
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
  /**
   * Try every due entry of this store once. With `userId`, only that
   * person's entries (and older ones without a person) are sent. Never throws.
   */
  flush(tenantId: string, userId?: string | null): Promise<FlushResult>;
  /** What waits on the phone; with `userId`, only what is that person's. */
  pending(tenantId?: string, userId?: string | null): Promise<QueuedExpense[]>;
  /**
   * Forget an entry (Undo inside the hold, or a person dismissed a refused
   * one). True = it was there and never left the phone. An entry on the wire
   * right now is waited for first, so a send that lands answers false.
   */
  remove(id: string): Promise<boolean>;
  /** End one entry's hold (its Undo window closed): due now. */
  release(id: string): Promise<void>;
  /** Make every waiting entry due now (a "Try again" tap, or the Undo window closing). */
  retryNow(tenantId: string, userId?: string | null): Promise<void>;
  /** A person tapped Try again on a refused entry: clear the refusal, due now. */
  retryRefused(id: string): Promise<void>;
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
    (value.userId === undefined || value.userId === null || typeof value.userId === "string") &&
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

/**
 * Whether an entry is `userId`'s to send or show. `undefined` = anyone's (no
 * person filter); an entry without a person is treated as the signed-in one's.
 */
export function belongsTo(entry: Pick<QueuedExpense, "userId">, userId: string | null | undefined): boolean {
  if (userId === undefined) return true;
  return !entry.userId || entry.userId === userId;
}

const NO_FLUSH: FlushResult = { sent: new Map<string, string>(), waiting: 0, refused: 0 };

/** One entry picked for this pass; `started` flips once it is on the wire. */
interface InFlight {
  started: boolean;
  done: Promise<void>;
  finish: () => void;
}

function inFlight(): InFlight {
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { started: false, done, finish };
}

/** Writes one attempt's answer onto the stored entries. */
function applyOutcome(entries: readonly QueuedExpense[], id: string, outcome: SendOutcome, now: number): QueuedExpense[] {
  if (outcome.status === "sent") return entries.filter((entry) => entry.id !== id);
  return entries.map((entry) => {
    if (entry.id !== id) return entry;
    const attempts = entry.attempts + 1;
    return outcome.status === "refused"
      ? { ...entry, attempts, retryAt: null, refusedReason: outcome.reason }
      : { ...entry, attempts, retryAt: nextExpenseRetryAt(now, attempts) };
  });
}

export function createExpenseQueue(deps: ExpenseQueueDeps): ExpenseQueue {
  const now = deps.now ?? Date.now;
  // Serialised, so a flush and an enqueue racing never lose an entry. Held
  // only around storage reads and writes, never across a send.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const result = chain.then(task, task);
    chain = result.catch(() => undefined);
    return result;
  }
  // Entries picked by a running pass: never picked twice, and Undo waits for one on the wire.
  const flights = new Map<string, InFlight>();

  const read = async () => parseExpenseQueue(await deps.storage.getItem(EXPENSE_QUEUE_STORAGE_KEY));
  const write = (entries: readonly QueuedExpense[]) =>
    deps.storage.setItem(EXPENSE_QUEUE_STORAGE_KEY, JSON.stringify(entries));

  /** Picks what is due, under the lock, and marks it as this pass's. */
  const pickDue = (tenantId: string, userId: string | null | undefined) =>
    serial(async () => {
      const due = (await read()).filter(
        (entry) =>
          entry.tenantId === tenantId &&
          belongsTo(entry, userId) &&
          entry.refusedReason === null &&
          (entry.retryAt === null || entry.retryAt <= now()) &&
          !flights.has(entry.id),
      );
      for (const entry of due) flights.set(entry.id, inFlight());
      return due;
    });

  /** The stored entry as it is now, marked on the wire; null = removed, refused or held meanwhile. */
  const startSend = (id: string) =>
    serial(async () => {
      const current = (await read()).find((entry) => entry.id === id);
      const flight = flights.get(id);
      if (!current || !flight || current.refusedReason !== null || (current.retryAt !== null && current.retryAt > now())) {
        return null;
      }
      flight.started = true;
      return current;
    });

  const finishSend = (id: string) => {
    flights.get(id)?.finish();
    flights.delete(id);
  };

  const sendOne = async (id: string, sent: Map<string, string>) => {
    try {
      const entry = await startSend(id);
      if (!entry) return;
      const outcome = await deps.send(entry).catch((): SendOutcome => ({ status: "retry" }));
      if (outcome.status === "sent") sent.set(id, outcome.expenseId);
      await serial(async () => write(applyOutcome(await read(), id, outcome, now()))).catch((error) => {
        // Kept as it was: a replay is answered with the first row.
        console.warn("[expenses] The expense queue could not be saved", error);
      });
    } finally {
      finishSend(id);
    }
  };

  const counts = (tenantId: string, userId: string | null | undefined) =>
    serial(async () => {
      const mine = (await read()).filter((entry) => entry.tenantId === tenantId && belongsTo(entry, userId));
      return {
        waiting: mine.filter((entry) => entry.refusedReason === null).length,
        refused: mine.filter((entry) => entry.refusedReason !== null).length,
      };
    });

  const flush = async (tenantId: string, userId?: string | null): Promise<FlushResult> => {
    const due = await pickDue(tenantId, userId);
    const sent = new Map<string, string>();
    try {
      // In the order they were typed: a drawer's expenses land oldest first.
      for (const entry of due) await sendOne(entry.id, sent);
    } finally {
      for (const entry of due) finishSend(entry.id);
    }
    return { sent, ...(await counts(tenantId, userId)) };
  };

  /** Waits while `id` is on the wire, then runs `task` under the lock. */
  const afterSend = async <T>(id: string, task: (entries: QueuedExpense[]) => Promise<T>): Promise<T> => {
    for (;;) {
      const flight = flights.get(id);
      if (flight?.started) await flight.done;
      const outcome = await serial(async () => {
        if (flights.get(id)?.started) return { wait: true as const };
        return { wait: false as const, value: await task(await read()) };
      });
      if (!outcome.wait) return outcome.value;
    }
  };

  return {
    enqueue: (entry, options = {}) =>
      serial(async () => {
        const existing = await read();
        const id = requestIdOf(entry.payload);
        const repeat = existing.find((queued) => queued.id === id);
        if (repeat) return repeat;
        const fresh: QueuedExpense = {
          ...entry,
          userId: entry.userId ?? null,
          id,
          attempts: 0,
          retryAt: options.holdMs && options.holdMs > 0 ? now() + options.holdMs : null,
          createdAt: now(),
          refusedReason: null,
        };
        await write([...existing, fresh]);
        return fresh;
      }),

    flush: (tenantId, userId) => flush(tenantId, userId).catch(() => ({ ...NO_FLUSH, sent: new Map<string, string>() })),

    pending: (tenantId, userId) =>
      serial(async () => {
        const entries = await read();
        return entries.filter((entry) => (!tenantId || entry.tenantId === tenantId) && belongsTo(entry, userId));
      }),

    remove: (id) =>
      afterSend(id, async (entries) => {
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

    retryNow: (tenantId, userId) =>
      serial(async () => {
        const entries = await read();
        await write(
          entries.map((entry) =>
            entry.tenantId === tenantId && belongsTo(entry, userId) && entry.refusedReason === null
              ? { ...entry, retryAt: null }
              : entry,
          ),
        );
      }),

    retryRefused: (id) =>
      serial(async () => {
        const entries = await read();
        if (!entries.some((entry) => entry.id === id && entry.refusedReason !== null)) return;
        await write(entries.map((entry) => (entry.id === id ? { ...entry, retryAt: null, refusedReason: null } : entry)));
      }),
  };
}

/**
 * One sync per key at a time. A call that arrives while a pass runs shares
 * it AND asks for one more pass once it ends — so an entry released during a
 * pass that had already picked its work is never left for the next poll.
 */
export function createSingleFlight<T>(
  run: (key: string) => Promise<T>,
  combine: (earlier: T, later: T) => T,
): (key: string) => Promise<T> {
  const flights = new Map<string, { again: boolean; promise: Promise<T> }>();
  return (key) => {
    const running = flights.get(key);
    if (running) {
      running.again = true;
      return running.promise;
    }
    const flight: { again: boolean; promise: Promise<T> } = { again: false, promise: Promise.resolve() as Promise<T> };
    flights.set(key, flight);
    flight.promise = (async () => {
      let result: T = await run(key);
      while (flight.again) {
        flight.again = false;
        result = combine(result, await run(key));
      }
      return result;
    })().finally(() => {
      flights.delete(key);
    });
    return flight.promise;
  };
}

function isDrawerEntryOf(entry: QueuedExpense, shiftId: string): entry is QueuedExpense & { payload: { kind: "drawer"; input: DrawerExpenseInput } } {
  return entry.payload.kind === "drawer" && entry.payload.input.shiftId === shiftId;
}

/**
 * Drawer expenses of one shift still on their way, in centavos — the drawer
 * is already short by this much. A refused one is not on its way (it will
 * never send by itself): `refusedDrawerPayouts` lists those for a person.
 */
export function pendingDrawerCents(entries: readonly QueuedExpense[], shiftId: string): { cents: number; count: number } {
  return entries.reduce(
    (sum, entry) =>
      isDrawerEntryOf(entry, shiftId) && entry.refusedReason === null
        ? { cents: sum.cents + entry.payload.input.amountCents, count: sum.count + 1 }
        : sum,
    { cents: 0, count: 0 },
  );
}

/** A pay-out from this shift's drawer that the store did not take, for the cashier to retry or remove. */
export interface RefusedPayout {
  /** The queue id (= client request id). */
  id: string;
  categoryName: string;
  cents: number;
  reason: string;
}

export function refusedDrawerPayouts(entries: readonly QueuedExpense[], shiftId: string): RefusedPayout[] {
  return entries.flatMap((entry) =>
    isDrawerEntryOf(entry, shiftId) && entry.refusedReason !== null
      ? [{ id: entry.id, categoryName: entry.categoryName, cents: entry.payload.input.amountCents, reason: entry.refusedReason }]
      : [],
  );
}
