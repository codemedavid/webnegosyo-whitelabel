/**
 * Replay the order changes made offline, oldest first, through the same
 * mutation functions the order screens use — run right after the sales
 * outbox, so an order rung up and then advanced offline exists before its
 * changes are sent.
 *
 * Per change: wait while its order is still an unwritten sale; send it
 * (addressed by the server id when a Convex sale has been written); run the
 * follow-ups a live change runs (stock back on a cancel, the Loyverse receipt
 * on a confirm); forget it.
 *
 * Failures, as in `sync-outbox.ts`:
 * - The connection went → stop; everything left stays queued.
 * - The server refused one change → record why and move on, but hold back
 *   that order's later changes this run so they never land out of order.
 *   After `MAX_EDIT_ATTEMPTS` refusals a change is left for a person.
 *
 * One run at a time per process; an overlapping trigger joins the run and
 * asks for a follow-up pass, so a change made (or an order written) while a
 * run is in flight is sent straight after it rather than on the retry timer.
 * A follow-up never retries a change this cycle already tried.
 */

import type { OrderBackend } from "../order-backend";
import { reportOffline } from "./connectivity";
import { withDeadline } from "./deadline";
import { isNetworkFailure } from "./network-error";
import {
  getOrderEdits,
  isOrderEditStuck,
  recordOrderEditFailure,
  removeOrderEdit,
  type OrderEditRef,
  type QueuedOrderEdit,
} from "./order-edits";
import { getOutbox, type QueuedSale } from "./order-outbox";
import { findQueuedSale, isSaleUnwritten } from "./offline-order-view";

const EDIT_WRITE_TIMEOUT_MS = 12_000;

export interface SyncOrderEditsDeps {
  tenantId: string;
  backend: OrderBackend;
  isActive?: () => boolean;
  mutate: (ref: OrderEditRef, args: Record<string, unknown>) => Promise<unknown>;
  /** The follow-ups a live change runs; never allowed to fail the change. */
  afterWrite?: (edit: QueuedOrderEdit) => Promise<void>;
  listEdits?: () => readonly QueuedOrderEdit[];
  listSales?: () => readonly QueuedSale[];
  remove?: (editId: string) => Promise<void>;
  recordFailure?: (editId: string, message: string) => Promise<void>;
}

export interface SyncOrderEditsResult {
  synced: number;
  refused: number;
  /** Refused too many times; skipped and left for a person. */
  stuck: number;
  /** Their order is still a sale waiting to be written. */
  waiting: number;
  stoppedOffline: boolean;
}

/** Stock back on a cancel, the Loyverse receipt on a confirm — as a live change. */
export async function runOrderEditSideEffects(edit: QueuedOrderEdit): Promise<void> {
  if (edit.ref !== "orders:updateOrderStatus") return;
  const status = String(edit.args.status ?? "");
  const orderId = String(edit.args.orderId);
  // Loaded lazily, like the sale bookkeeping: these pull in the auth store.
  const [{ restoreStockForStatusChange }, { pushConfirmedOrderToLoyverse }] = await Promise.all([
    import("../order-cancel-stock"),
    import("../loyverse-confirm"),
  ]);
  await restoreStockForStatusChange(status, orderId);
  if (status === "confirmed") await pushConfirmedOrderToLoyverse(orderId);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveDeps(deps: SyncOrderEditsDeps): Required<SyncOrderEditsDeps> {
  return {
    isActive: () => true,
    afterWrite: runOrderEditSideEffects,
    listEdits: () => getOrderEdits().edits,
    listSales: () => getOutbox().sales,
    remove: removeOrderEdit,
    recordFailure: recordOrderEditFailure,
    ...deps,
  };
}

async function runSync(
  deps: Required<SyncOrderEditsDeps>,
  attempted: Set<string>
): Promise<SyncOrderEditsResult> {
  const mine = deps
    .listEdits()
    .filter((edit) => edit.tenantId === deps.tenantId && edit.backend === deps.backend);
  const sales = deps.listSales();
  const result: SyncOrderEditsResult = {
    synced: 0,
    refused: 0,
    stuck: mine.filter(isOrderEditStuck).length,
    waiting: 0,
    stoppedOffline: false,
  };
  const heldBack = new Set<string>();

  const eligible = mine.filter((edit) => !isOrderEditStuck(edit)).sort((a, b) => a.createdAt - b.createdAt);
  for (const edit of eligible) {
    if (!deps.isActive()) break;
    const sale = findQueuedSale(sales, edit.orderId);
    if (isSaleUnwritten(sale)) {
      result.waiting += 1;
      continue;
    }
    if (heldBack.has(edit.orderId)) continue;
    // Tried earlier this cycle (and refused, or it would be gone): the retry
    // timer gets the next attempt. Later changes to its order wait behind it.
    if (attempted.has(edit.editId)) {
      heldBack.add(edit.orderId);
      continue;
    }
    attempted.add(edit.editId);

    const orderId = sale?.syncedOrderId ?? edit.orderId;
    try {
      await withDeadline(deps.mutate(edit.ref, { ...edit.args, orderId }), EDIT_WRITE_TIMEOUT_MS);
    } catch (error) {
      if (isNetworkFailure(error)) {
        reportOffline();
        result.stoppedOffline = true;
        break;
      }
      heldBack.add(edit.orderId);
      await deps.recordFailure(edit.editId, messageOf(error));
      result.refused += 1;
      continue;
    }

    try {
      await deps.afterWrite({ ...edit, orderId, args: { ...edit.args, orderId } });
    } catch (error) {
      console.warn("[offline] An order change synced, but its follow-up failed:", error);
    }
    await deps.remove(edit.editId);
    result.synced += 1;
  }
  return result;
}

let inFlight: Promise<SyncOrderEditsResult> | null = null;
let rerunDeps: Required<SyncOrderEditsDeps> | null = null;

async function runCycle(deps: Required<SyncOrderEditsDeps>): Promise<SyncOrderEditsResult> {
  const attempted = new Set<string>();
  let result = await runSync(deps, attempted);
  while (rerunDeps && !result.stoppedOffline) {
    const next = rerunDeps;
    rerunDeps = null;
    const followUp = await runSync(next, attempted);
    result = {
      synced: result.synced + followUp.synced,
      refused: result.refused + followUp.refused,
      stuck: followUp.stuck,
      waiting: followUp.waiting,
      stoppedOffline: followUp.stoppedOffline,
    };
  }
  return result;
}

export function syncOrderEdits(deps: SyncOrderEditsDeps): Promise<SyncOrderEditsResult> {
  if (inFlight) {
    // The trigger's own deps: the in-flight run may hold a scope that has
    // since been retired (its `isActive` now false).
    rerunDeps = resolveDeps(deps);
    return inFlight;
  }
  rerunDeps = null;
  inFlight = runCycle(resolveDeps(deps)).finally(() => {
    inFlight = null;
    rerunDeps = null;
  });
  return inFlight;
}

/** Test seam. */
export function resetOrderEditSyncForTests(): void {
  inFlight = null;
  rerunDeps = null;
}
