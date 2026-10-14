/**
 * Send the stock calls kept in `stock-call-queue.ts` until the platform answers
 * for good.
 *
 * Two triggers, one runner:
 * - `sendStockCall` — what a screen calls instead of firing a stock POST and
 *   forgetting it. It persists the call FIRST, then starts a drain, so a call
 *   survives the app being killed mid-request.
 * - the outbox sync loop (`use-outbox-sync.ts`) drains on every tick while
 *   online, so whatever is owed is retried after a restart or an outage.
 *
 * Per call: due? → send → settle (`settleStockOutcome`, the policy the sales
 * outbox shares): accepted → forget; may not have landed → keep with backoff;
 * refused for good or out of attempts → forget and report
 * (`stock-abandoned.ts`).
 *
 * Order per order: calls are sent in the order they were queued, and an order
 * whose earlier call is still owed (or backing off) has its later calls held —
 * a redeplete never overtakes the restore before it. One drain runs at a time
 * per process; a trigger during a run asks for a follow-up pass, which never
 * re-sends a call the cycle already tried.
 *
 * Never throws.
 */

import type { StockPostOutcome } from "../pos-stock-notify";
import {
  deferStockCall,
  enqueueStockCall,
  getStockCalls,
  hydrateStockCalls,
  removeStockCall,
  type NewStockCall,
  type QueuedStockCall,
} from "./stock-call-queue";
import { settleStockOutcome } from "./stock-retry-policy";
import { reportAbandonedStock, type AbandonedStockCall } from "./stock-abandoned";

export interface DrainStockCallsDeps {
  /** Only this store's calls are sent — the session token is this store's. */
  tenantId: string;
  isActive?: () => boolean;
  hydrate?: () => Promise<void>;
  listCalls?: () => readonly QueuedStockCall[];
  run?: (call: QueuedStockCall) => Promise<StockPostOutcome>;
  remove?: (id: string) => Promise<void>;
  defer?: (id: string, attempts: number, retryAt: number) => Promise<void>;
  reportAbandoned?: (call: AbandonedStockCall) => void;
  now?: () => number;
}

export interface DrainStockCallsResult {
  /** Accepted by the platform and forgotten. */
  sent: number;
  /** Kept for a later attempt (did not land, backing off, or held behind one). */
  owed: number;
  /** Refused for good or out of attempts; forgotten and reported. */
  abandoned: number;
}

/**
 * Send one queued call through its notifier. Loaded at call time, like the
 * sale bookkeeping: the notifiers reach `expo-constants`, a native module.
 */
export async function runStockCall(call: QueuedStockCall): Promise<StockPostOutcome> {
  const notify = await import("../pos-stock-notify");
  const { tenantId, orderId, payload } = call;
  switch (call.action) {
    case "deplete":
      return notify.notifyPosStockDepletion(tenantId, orderId, payload.items ?? [], payload.source);
    case "restore":
      return notify.notifyOrderStockRestore(tenantId, orderId, payload.source);
    case "redeplete":
      return notify.notifyOrderStockRedeplete(tenantId, orderId, payload.source);
    case "revise":
      return notify.notifyOrderStockRevision(
        tenantId,
        orderId,
        payload.revision ?? 0,
        { deplete: payload.deplete ?? [], restore: payload.restore ?? [] },
        payload.source,
      );
  }
}

/** A call that would move nothing — the notifiers answer "ok" without sending. */
export function isNoopStockCall(call: Pick<NewStockCall, "action" | "payload">): boolean {
  const isEmpty = (lines?: readonly unknown[]) => !lines || lines.length === 0;
  if (call.action === "deplete") return isEmpty(call.payload.items);
  if (call.action === "revise") return isEmpty(call.payload.deplete) && isEmpty(call.payload.restore);
  return false;
}

function resolveDeps(deps: DrainStockCallsDeps): Required<DrainStockCallsDeps> {
  return {
    isActive: () => true,
    hydrate: hydrateStockCalls,
    listCalls: getStockCalls,
    run: runStockCall,
    remove: removeStockCall,
    defer: deferStockCall,
    reportAbandoned: reportAbandonedStock,
    now: Date.now,
    ...deps,
  };
}

async function attempt(call: QueuedStockCall, run: Required<DrainStockCallsDeps>["run"]): Promise<StockPostOutcome> {
  try {
    return await run(call);
  } catch {
    return "retry";
  }
}

type CallResult = keyof DrainStockCallsResult;

async function sendOne(call: QueuedStockCall, deps: Required<DrainStockCallsDeps>): Promise<CallResult> {
  const settled = settleStockOutcome(call, await attempt(call, deps.run), deps.now());
  if (settled.verdict === "owed") {
    await deps.defer(call.id, settled.attempts, settled.retryAt);
    return "owed";
  }
  if (settled.verdict === "abandoned") {
    deps.reportAbandoned({
      tenantId: call.tenantId,
      orderId: call.orderId,
      action: call.action,
      reason: settled.reason,
      attempts: settled.attempts,
    });
  }
  await deps.remove(call.id);
  return settled.verdict === "done" ? "sent" : "abandoned";
}

async function runPass(deps: Required<DrainStockCallsDeps>, attempted: Set<string>): Promise<DrainStockCallsResult> {
  const result: DrainStockCallsResult = { sent: 0, owed: 0, abandoned: 0 };
  const heldOrders = new Set<string>();
  const now = deps.now();
  const mine = deps.listCalls().filter((call) => call.tenantId === deps.tenantId);

  for (const call of mine) {
    if (!deps.isActive()) break;
    const isDue = call.retryAt === null || call.retryAt <= now;
    if (heldOrders.has(call.orderId) || attempted.has(call.id) || !isDue) {
      heldOrders.add(call.orderId);
      result.owed += 1;
      continue;
    }
    attempted.add(call.id);
    const outcome = await sendOne(call, deps);
    result[outcome] += 1;
    if (outcome === "owed") heldOrders.add(call.orderId);
  }
  return result;
}

let inFlight: Promise<DrainStockCallsResult> | null = null;
let rerunDeps: Required<DrainStockCallsDeps> | null = null;

async function runCycle(deps: Required<DrainStockCallsDeps>): Promise<DrainStockCallsResult> {
  const attempted = new Set<string>();
  await deps.hydrate();
  let result = await runPass(deps, attempted);
  while (rerunDeps) {
    const next = rerunDeps;
    rerunDeps = null;
    const followUp = await runPass(next, attempted);
    result = {
      sent: result.sent + followUp.sent,
      owed: followUp.owed,
      abandoned: result.abandoned + followUp.abandoned,
    };
  }
  return result;
}

const NOTHING_SENT: DrainStockCallsResult = { sent: 0, owed: 0, abandoned: 0 };

export function drainStockCalls(deps: DrainStockCallsDeps): Promise<DrainStockCallsResult> {
  if (inFlight) {
    rerunDeps = resolveDeps(deps);
    return inFlight;
  }
  rerunDeps = null;
  inFlight = runCycle(resolveDeps(deps))
    .catch((error) => {
      // A queue that cannot be read is retried on the next tick; never thrown.
      console.warn("[stock] Could not send queued stock calls:", error);
      return NOTHING_SENT;
    })
    .finally(() => {
      inFlight = null;
      rerunDeps = null;
    });
  return inFlight;
}

export interface SendStockCallDeps {
  enqueue?: (call: NewStockCall) => Promise<unknown>;
  drain?: (deps: DrainStockCallsDeps) => Promise<unknown>;
  run?: (call: QueuedStockCall) => Promise<StockPostOutcome>;
}

/**
 * Queue a stock call durably and start sending it. Resolves once it is stored
 * (not once it is sent), so a caller can await it without waiting on the
 * network. Never throws: by the time a screen calls this, its own write is
 * saved, and a stock call must never be able to undo that.
 */
export async function sendStockCall(
  call: NewStockCall,
  { enqueue = enqueueStockCall, drain = drainStockCalls, run = runStockCall }: SendStockCallDeps = {},
): Promise<void> {
  if (isNoopStockCall(call)) return;
  try {
    await enqueue(call);
  } catch (error) {
    // Storage refused: the call cannot outlive this process, but it can still
    // be tried once rather than not at all.
    console.warn(`[stock] Could not store the ${call.action} stock call for order ${call.orderId}:`, error);
    const outcome = await attempt({ ...call, id: "unstored", attempts: 0, retryAt: null, createdAt: 0 }, run);
    if (outcome !== "ok") {
      console.warn(`[stock] The unstored ${call.action} stock call for order ${call.orderId} did not land (${outcome}).`);
    }
    return;
  }
  void drain({ tenantId: call.tenantId });
}

/** Test seam. */
export function resetStockDrainForTests(): void {
  inFlight = null;
  rerunDeps = null;
}
