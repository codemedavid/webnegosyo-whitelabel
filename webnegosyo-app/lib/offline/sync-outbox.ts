/**
 * Replay the sales taken offline, oldest first, through the SAME mutation
 * functions the tender screen uses — so a synced sale takes exactly the path
 * a live one would, backend dispatch included.
 *
 * Per sale: create the order (deduped server-side by `clientOrderId`), mark
 * it paid, persist "written", run the bookkeeping, persist "bookkeeping
 * done", drop it from the queue. Each is awaited so a sale is only forgotten
 * once the server holds it. Checkpoints avoid redoing acknowledged stages;
 * they cannot make remote bookkeeping exactly-once across a process crash.
 * Those services need server-side idempotency for that guarantee.
 *
 * Two kinds of failure, kept apart on purpose:
 * - The connection went again → stop the whole run and leave the rest queued.
 *   They will be retried when the belief flips back to online.
 * - The server refused ONE sale → record the reason on it and carry on with
 *   the next. Money is never dropped from the queue on a refusal; after
 *   `MAX_SYNC_ATTEMPTS` the sale stops being retried and the register shows
 *   it as needing a person.
 *
 * The stock call is the one piece of bookkeeping retried on its own. A paid
 * sale that never deducts leaves the shelf wrong for good, and the server
 * claims depletion per order, so replaying it is safe. When it does not land
 * the sale stays queued — reports marked done, stock owed, retried with
 * backoff — until it lands or is refused for good (`settleStockOutcome`, the
 * policy the stock-call queue shares). Such a sale is not "waiting to sync"
 * for the cashier: its order is written. Giving up is never silent
 * (`stock-abandoned.ts`).
 *
 * One run at a time per process: a second trigger while a run is in flight
 * joins it rather than racing it, which is what makes the replay safe against
 * a foreground event landing on top of a connectivity change.
 */

import type { OrderBackend } from "../order-backend";
import { withDeadline } from "./deadline";
import { reportOffline } from "./connectivity";
import { isNetworkFailure } from "./network-error";
import {
  deferOwedStock,
  getOutbox,
  isPaidAtTender,
  isStockRetryDue,
  markBookkeepingDone,
  markReportsDone,
  markSaleWritten,
  needsAttention,
  owesOnlyStock,
  recordSyncFailure,
  removeQueuedSale,
  type QueuedSale,
} from "./order-outbox";
import { settleStockOutcome } from "./stock-retry-policy";
import { reportAbandonedStock, type AbandonedStockCall } from "./stock-abandoned";
import { rebindOrderEdits } from "./order-edits";
import {
  runPosSaleBookkeeping,
  type PosSaleBookkeepingFacts,
  type PosSaleBookkeepingOutcome,
} from "./pos-sale-bookkeeping";

export { MAX_SYNC_ATTEMPTS } from "./order-outbox";

export interface SyncOutboxDeps {
  /** Only this store's sales are replayed — the mutations are bound to it. */
  tenantId: string;
  backend: OrderBackend;
  isActive?: () => boolean;
  createOrder: (args: unknown) => Promise<unknown>;
  updatePaymentStatus: (args: unknown) => Promise<unknown>;
  bookkeeping?: (facts: PosSaleBookkeepingFacts) => Promise<PosSaleBookkeepingOutcome | void>;
  listSales?: () => readonly QueuedSale[];
  remove?: (localId: string) => Promise<void>;
  recordFailure?: (localId: string, message: string) => Promise<void>;
  markWritten?: (localId: string, orderId: string) => Promise<void>;
  markBookkeepingDone?: (localId: string) => Promise<void>;
  /** Point changes made offline to this sale at its server id (Convex mints its own). */
  rebindEdits?: (localId: string, orderId: string) => Promise<void>;
  /** Persist "reports done, stock owed, try again at `retryAt`". */
  deferStock?: (localId: string, retryAt: number) => Promise<void>;
  /** Persist "reports done" the moment they land, before the stock settles. */
  markReportsDone?: (localId: string) => Promise<void>;
  /** Say that a sale's stock call was given up on. */
  reportAbandoned?: (call: AbandonedStockCall) => void;
  now?: () => number;
}

export interface SyncOutboxResult {
  synced: number;
  refused: number;
  /** Refused too many times; skipped and left for a person. */
  stuck: number;
  /** Written sales whose stock call has not landed yet; retried with backoff. */
  stockOwed: number;
  /** Sales whose stock call was refused for good or ran out of attempts. */
  stockAbandoned: number;
  /** The connection was lost mid-run; the remaining sales stay queued. */
  stoppedOffline: boolean;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SCOPE_CHANGED = Symbol("sync scope changed");
function assertActive(deps: Required<SyncOutboxDeps>): void {
  if (!deps.isActive()) throw SCOPE_CHANGED;
}

async function writeOrder(sale: QueuedSale, deps: Required<SyncOutboxDeps>): Promise<string> {
  const orderId = String(await withDeadline(deps.createOrder(sale.orderArgs), 12_000));

  assertActive(deps);
  // A pay-later sale is written unpaid on purpose — the cashier collects it
  // from the order screen. A platform insert that already carried `paid`
  // needs no second write. Anything else (Convex, and platform sales queued
  // before payment rode on the insert) is marked paid here; a refusal leaves
  // the sale queued for retry/reconciliation.
  if (isPaidAtTender(sale) && sale.orderArgs.paymentStatus !== "paid") {
    await withDeadline(deps.updatePaymentStatus({ orderId, paymentStatus: "paid" }), 12_000);
  }

  await deps.markWritten(sale.localId, orderId);
  await deps.rebindEdits(sale.localId, orderId);
  return orderId;
}

type SyncOneResult = "synced" | "stock_owed" | "stock_abandoned";

async function syncOne(sale: QueuedSale, deps: Required<SyncOutboxDeps>): Promise<SyncOneResult> {
  const orderId = sale.syncedOrderId ?? (await writeOrder(sale, deps));

  assertActive(deps);
  let result: SyncOneResult = "synced";
  if (!sale.bookkeepingDone) {
    const outcome = await deps.bookkeeping({
      tenantId: sale.tenantId,
      orderId,
      backend: sale.backend,
      createdAt: sale.createdAt,
      bookkeeping: sale.bookkeeping,
      skipReports: sale.reportsDone === true,
      onReportsDone: () => deps.markReportsDone(sale.localId),
    });
    // An injected runner that predates the outcome answers nothing: it ran.
    const settled = settleStockOutcome({ attempts: sale.stockAttempts ?? 0 }, outcome?.stock ?? "ok", deps.now());
    if (settled.verdict === "owed") {
      assertActive(deps);
      await deps.deferStock(sale.localId, settled.retryAt);
      return "stock_owed";
    }
    if (settled.verdict === "abandoned") {
      deps.reportAbandoned({
        tenantId: sale.tenantId,
        orderId,
        action: "deplete",
        reason: settled.reason,
        attempts: settled.attempts,
      });
      result = "stock_abandoned";
    }
    await deps.markBookkeepingDone(sale.localId);
  }

  assertActive(deps);
  await deps.remove(sale.localId);
  return result;
}

/** Owed stock does not depend on which backend wrote the order. */
function isReplayable(sale: QueuedSale, deps: Required<SyncOutboxDeps>): boolean {
  if (owesOnlyStock(sale)) return true;
  return !needsAttention(sale) && sale.backend === deps.backend;
}

let inFlight: Promise<SyncOutboxResult> | null = null;
/**
 * A trigger arrived while a run was in flight. With write-behind every sale
 * passes through here, so a sale rung up during the previous sale's sync is
 * written by a follow-up run straight away rather than on the retry timer.
 */
let isRerunRequested = false;
let rerunDeps: Required<SyncOutboxDeps> | null = null;

/**
 * One pass over the queue. `attempted` is the cycle's record of the sales it
 * has already tried — a follow-up pass skips them, so a refusal waits for the
 * retry timer instead of being hammered in a loop.
 */
async function runSync(
  deps: Required<SyncOutboxDeps>,
  attempted: Set<string>
): Promise<SyncOutboxResult> {
  const mine = deps
    .listSales()
    .filter((sale) => sale.tenantId === deps.tenantId && !attempted.has(sale.localId));
  const now = deps.now();
  const replayable = mine.filter((sale) => isReplayable(sale, deps));
  const result: SyncOutboxResult = {
    synced: 0,
    refused: 0,
    stuck: mine.length - replayable.length,
    stockOwed: replayable.filter((sale) => owesOnlyStock(sale) && !isStockRetryDue(sale, now)).length,
    stockAbandoned: 0,
    stoppedOffline: false,
  };

  const eligible = replayable
    .filter((sale) => !owesOnlyStock(sale) || isStockRetryDue(sale, now))
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const sale of eligible) {
    attempted.add(sale.localId);
    try {
      assertActive(deps);
      const outcome = await syncOne(sale, deps);
      if (outcome === "stock_owed") result.stockOwed += 1;
      else result.synced += 1;
      if (outcome === "stock_abandoned") result.stockAbandoned += 1;
    } catch (error) {
      if (error === SCOPE_CHANGED || !deps.isActive()) break;
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

function resolveDeps(deps: SyncOutboxDeps): Required<SyncOutboxDeps> {
  return {
    isActive: () => true,
    bookkeeping: runPosSaleBookkeeping,
    listSales: () => getOutbox().sales,
    remove: removeQueuedSale,
    recordFailure: recordSyncFailure,
    markWritten: markSaleWritten,
    markBookkeepingDone,
    rebindEdits: rebindOrderEdits,
    deferStock: deferOwedStock,
    markReportsDone,
    reportAbandoned: reportAbandonedStock,
    now: Date.now,
    ...deps,
  };
}

async function runCycle(deps: Required<SyncOutboxDeps>): Promise<SyncOutboxResult> {
  const attempted = new Set<string>();
  let result = await runSync(deps, attempted);
  while (isRerunRequested && !result.stoppedOffline) {
    isRerunRequested = false;
    const followUp = await runSync(rerunDeps ?? deps, attempted);
    result = {
      synced: result.synced + followUp.synced,
      refused: result.refused + followUp.refused,
      stuck: followUp.stuck,
      stockOwed: result.stockOwed + followUp.stockOwed,
      stockAbandoned: result.stockAbandoned + followUp.stockAbandoned,
      stoppedOffline: followUp.stoppedOffline,
    };
  }
  return result;
}

export function syncOutbox(deps: SyncOutboxDeps): Promise<SyncOutboxResult> {
  if (inFlight) {
    isRerunRequested = true;
    rerunDeps = resolveDeps(deps);
    return inFlight;
  }
  isRerunRequested = false;
  rerunDeps = null;
  inFlight = runCycle(resolveDeps(deps)).finally(() => {
    inFlight = null;
    isRerunRequested = false;
    rerunDeps = null;
  });
  return inFlight;
}

/** Test seam. */
export function resetSyncForTests(): void {
  inFlight = null;
  isRerunRequested = false;
  rerunDeps = null;
}
