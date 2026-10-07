/**
 * Send a change to an order now, or keep it on the device and send it later —
 * the order-management twin of `place-sale.ts`.
 *
 * Queued (and the screen moves on as if it had landed) when:
 * 1. The order exists only on this device — a sale still in the outbox. The
 *    server cannot change a row it does not have.
 * 2. An earlier change to the same order is still queued. Sending this one
 *    live would land it BEFORE that one ("ready" overtaken by "preparing").
 * 3. The device is believed offline — no 12-second wait at the counter.
 * 4. The live write failed because the server could not be reached, and the
 *    change is safe to repeat. A status or payment-status write is: writing
 *    "ready" twice is "ready". `recordPayment` is not — an ambiguous failure
 *    may already have recorded the money, and a replay would record it again
 *    — so its failure is shown to the cashier exactly as before.
 *
 * A refusal is always rethrown: the server said no, and queueing it would
 * only say no again later, where nobody is looking.
 */

import { isOffline as connectivityIsOffline, reportOffline, reportOnline } from "./connectivity";
import { isNetworkFailure } from "./network-error";
import { withDeadline } from "./deadline";
import { newLocalOrderId } from "./local-id";
import { enqueueOrderEdit, type OrderEditRef, type QueuedOrderEdit } from "./order-edits";
import type { OrderBackend } from "../order-backend";

/** How long a live write may take before the change is kept locally. */
export const ORDER_CHANGE_TIMEOUT_MS = 12_000;

/** Changes that land the same however many times they are written. */
const IDEMPOTENT_REFS: readonly OrderEditRef[] = ["orders:updateOrderStatus", "orders:updatePaymentStatus"];

const QUEUED = Object.freeze({ queuedOffline: true as const });

/** What a queued write resolves with, so a screen can defer its follow-ups. */
export type QueuedOrderWrite = typeof QUEUED;

export function isQueuedOrderWrite(result: unknown): result is QueuedOrderWrite {
  return result === QUEUED;
}

export interface WriteOrderChangeInput {
  ref: OrderEditRef;
  args: Record<string, unknown>;
  tenantId: string;
  backend: OrderBackend;
  live: (args: Record<string, unknown>) => Promise<unknown>;
  /** The server has no row for this order yet. */
  isOrderOnDeviceOnly: (orderId: string) => boolean;
  /** Some change to this order is still waiting to be written. */
  hasEarlierEdits: (orderId: string) => boolean;
  isOffline?: () => boolean;
  enqueue?: (edit: QueuedOrderEdit) => Promise<void>;
  timeoutMs?: number;
  now?: () => number;
  newEditId?: () => string;
  newPaymentId?: () => string;
}

/**
 * A platform payment carries an id minted here, ONCE, so the live write and
 * every replay of the queued copy insert the same row — the primary key turns
 * a replay of money that already landed into a no-op (`recordPayment` in the
 * platform adapter). Convex validators refuse unknown fields, and the
 * per-tenant Supabase track has no replay path, so only platform gets one.
 */
function withPaymentId(input: WriteOrderChangeInput): Record<string, unknown> {
  if (input.ref !== "orders:recordPayment" || input.backend !== "platform") return input.args;
  if (typeof input.args.paymentId === "string" && input.args.paymentId) return input.args;
  return { ...input.args, paymentId: (input.newPaymentId ?? newLocalOrderId)() };
}

export async function writeOrderChange(input: WriteOrderChangeInput): Promise<unknown> {
  const orderId = input.args.orderId;
  if (typeof orderId !== "string" || orderId.length === 0) {
    throw new Error("This change does not name an order.");
  }

  const args = withPaymentId(input);
  const isOffline = input.isOffline ?? connectivityIsOffline;
  const enqueue = input.enqueue ?? enqueueOrderEdit;
  const queue = async (): Promise<QueuedOrderWrite> => {
    await enqueue({
      editId: (input.newEditId ?? newLocalOrderId)(),
      tenantId: input.tenantId,
      backend: input.backend,
      orderId,
      ref: input.ref,
      args,
      createdAt: (input.now ?? Date.now)(),
      attempts: 0,
      lastError: null,
    });
    return QUEUED;
  };

  if (input.isOrderOnDeviceOnly(orderId) || input.hasEarlierEdits(orderId) || isOffline()) {
    return queue();
  }

  try {
    const result = await withDeadline(input.live(args), input.timeoutMs ?? ORDER_CHANGE_TIMEOUT_MS);
    reportOnline();
    return result;
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    reportOffline();
    if (!IDEMPOTENT_REFS.includes(input.ref)) throw error;
    return queue();
  }
}
