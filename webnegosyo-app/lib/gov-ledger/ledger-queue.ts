/**
 * A durable queue for Senior/PWD sales-book records.
 *
 * The other post-sale reports (stock, Loyverse, activity) are best-effort: a
 * lost one costs a dashboard number. A lost Senior/PWD record costs the store
 * its BIR deduction, so these are written to device storage FIRST and removed
 * only once the platform answers 2xx. The platform's ledger is idempotent, so
 * a record sent twice (an answer lost on a dropped connection) lands once.
 *
 * Storage and transport are injected so the queue is testable without a
 * device; `liveGovLedger()` wires the real ones.
 */

import type { RecordGovDiscountRequest } from "../gov-discount";

export const GOV_LEDGER_STORAGE_KEY = "wn-gov-ledger-queue-v1";
export const GOV_LEDGER_ROUTE = "/api/gov-discounts/record";

export interface QueuedGovRecord {
  /** One entry per order revision: re-queuing the same revision replaces it. */
  id: string;
  request: RecordGovDiscountRequest;
  attempts: number;
  queuedAt: number;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type PostRecord = (path: string, body: unknown) => Promise<boolean>;

export function queuedRecordId(request: RecordGovDiscountRequest): string {
  return [request.tenantId, request.backend, request.externalOrderId, request.revision].join("|");
}

function isQueuedRecord(value: unknown): value is QueuedGovRecord {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<QueuedGovRecord>;
  return (
    typeof entry.id === "string" &&
    typeof entry.attempts === "number" &&
    typeof entry.queuedAt === "number" &&
    typeof entry.request === "object" &&
    entry.request !== null
  );
}

export function parseQueue(raw: string | null): QueuedGovRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueuedRecord) : [];
  } catch {
    // A damaged queue must not take the register down; the platform ledger
    // can be reconciled from the orders' stored government blocks.
    return [];
  }
}

export interface GovLedgerQueue {
  enqueue(request: RecordGovDiscountRequest): Promise<void>;
  /** Sends everything waiting; returns how many are still waiting. */
  flush(): Promise<number>;
  pending(): Promise<QueuedGovRecord[]>;
}

export function createGovLedgerQueue(
  storage: KeyValueStorage,
  post: PostRecord,
  now: () => number = Date.now,
): GovLedgerQueue {
  // Serialised, so a flush and an enqueue racing never lose an entry.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  }

  const read = async () => parseQueue(await storage.getItem(GOV_LEDGER_STORAGE_KEY));
  const write = (entries: readonly QueuedGovRecord[]) =>
    storage.setItem(GOV_LEDGER_STORAGE_KEY, JSON.stringify(entries));

  return {
    enqueue: (request) =>
      serial(async () => {
        const id = queuedRecordId(request);
        const entries = (await read()).filter((entry) => entry.id !== id);
        await write([...entries, { id, request, attempts: 0, queuedAt: now() }]);
      }),

    flush: () =>
      serial(async () => {
        const entries = await read();
        const remaining: QueuedGovRecord[] = [];
        for (const entry of entries) {
          const isSent = await post(GOV_LEDGER_ROUTE, entry.request).catch(() => false);
          if (!isSent) remaining.push({ ...entry, attempts: entry.attempts + 1 });
        }
        await write(remaining);
        return remaining.length;
      }),

    pending: () => serial(read),
  };
}
