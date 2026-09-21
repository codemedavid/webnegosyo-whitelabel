/**
 * Replay the sales taken offline, oldest first, through the SAME mutation
 * functions the tender screen uses — so a synced sale takes exactly the path
 * a live one would, backend dispatch included.
 *
 * Per sale: create the order (deduped server-side by `clientOrderId`), mark
 * it paid, persist "written", run the bookkeeping, persist "bookkeeping
 * done", drop it from the queue. Each is awaited so a sale is only forgotten
 * once the server holds it — and each marker is on disk BEFORE the next step,
 * so a process killed at any point resumes without repeating a step that is
 * not idempotent (the Loyverse receipt, customer capture).
 *
 * Two kinds of failure, kept apart on purpose:
 * - The connection went again → stop the whole run and leave the rest queued.
 *   They will be retried when the belief flips back to online.
 * - The server refused ONE sale → record the reason on it and carry on with
 *   the next. Money is never dropped from the queue on a refusal; after
 *   `MAX_SYNC_ATTEMPTS` the sale stops being retried and the register shows
 *   it as needing a person.
 *
 * One run at a time per process: a second trigger while a run is in flight
 * joins it rather than racing it, which is what makes the replay safe against
 * a foreground event landing on top of a connectivity change.
 */

import { reportOffline } from "./connectivity";
import { isNetworkFailure } from "./network-error";
import {
  getOutbox,
  markBookkeepingDone,
  markSaleWritten,
  needsAttention,
  recordSyncFailure,
  removeQueuedSale,
  type QueuedSale,
} from "./order-outbox";
import { runPosSaleBookkeeping, type PosSaleBookkeepingFacts } from "./pos-sale-bookkeeping";

export { MAX_SYNC_ATTEMPTS } from "./order-outbox";

export interface SyncOutboxDeps {
  /** Only this store's sales are replayed — the mutations are bound to it. */
  tenantId: string;
  createOrder: (args: unknown) => Promise<unknown>;
  updatePaymentStatus: (args: unknown) => Promise<unknown>;
  bookkeeping?: (facts: PosSaleBookkeepingFacts) => Promise<void>;
  listSales?: () => readonly QueuedSale[];
  remove?: (localId: string) => Promise<void>;
  recordFailure?: (localId: string, message: string) => Promise<void>;
  markWritten?: (localId: string, orderId: string) => Promise<void>;
  markBookkeepingDone?: (localId: string) => Promise<void>;
}

export interface SyncOutboxResult {
  synced: number;
  refused: number;
  /** Refused too many times; skipped and left for a person. */
  stuck: number;
  /** The connection was lost mid-run; the remaining sales stay queued. */
  stoppedOffline: boolean;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function writeOrder(sale: QueuedSale, deps: Required<SyncOutboxDeps>): Promise<string> {
  const orderId = String(await deps.createOrder(sale.orderArgs));

  // Counter sales are paid at the drawer. A refusal here is not a lost sale —
  // the order exists — so it is logged, but a dropped connection still ends
  // the run before the sale is forgotten.
  try {
    await deps.updatePaymentStatus({ orderId, paymentStatus: "paid" });
  } catch (error) {
    if (isNetworkFailure(error)) throw error;
    console.warn("[offline] Could not mark a synced sale paid:", error);
  }

  await deps.markWritten(sale.localId, orderId);
  return orderId;
}

async function syncOne(sale: QueuedSale, deps: Required<SyncOutboxDeps>): Promise<void> {
  const orderId = sale.syncedOrderId ?? (await writeOrder(sale, deps));

  if (!sale.bookkeepingDone) {
    await deps.bookkeeping({
      tenantId: sale.tenantId,
      orderId,
      backend: sale.backend,
      createdAt: sale.createdAt,
      bookkeeping: sale.bookkeeping,
    });
    await deps.markBookkeepingDone(sale.localId);
  }

  await deps.remove(sale.localId);
}

let inFlight: Promise<SyncOutboxResult> | null = null;

async function runSync(deps: Required<SyncOutboxDeps>): Promise<SyncOutboxResult> {
  const mine = deps.listSales().filter((sale) => sale.tenantId === deps.tenantId);
  const result: SyncOutboxResult = {
    synced: 0,
    refused: 0,
    stuck: mine.filter(needsAttention).length,
    stoppedOffline: false,
  };

  for (const sale of mine.filter((candidate) => !needsAttention(candidate))) {
    try {
      await syncOne(sale, deps);
      result.synced += 1;
    } catch (error) {
      if (isNetworkFailure(error)) {
        reportOffline();
        result.stoppedOffline = true;
        break;
      }
      await deps.recordFailure(sale.localId, messageOf(error));
      result.refused += 1;
    }
  }
  return result;
}

export function syncOutbox(deps: SyncOutboxDeps): Promise<SyncOutboxResult> {
  if (inFlight) return inFlight;
  const resolved: Required<SyncOutboxDeps> = {
    bookkeeping: runPosSaleBookkeeping,
    listSales: () => getOutbox().sales,
    remove: removeQueuedSale,
    recordFailure: recordSyncFailure,
    markWritten: markSaleWritten,
    markBookkeepingDone,
    ...deps,
  };
  inFlight = runSync(resolved).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test seam. */
export function resetSyncForTests(): void {
  inFlight = null;
}
