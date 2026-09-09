/**
 * Whether a mutation the register just ran needs a customer-ledger sync.
 *
 * Pure, because it runs on EVERY mutation the app makes — `useSafeMutation` is
 * the one chokepoint all five order screens go through, so wiring here covers
 * the orders list, the order detail, the kitchen board, POS sales and the
 * scanner at once instead of five times over.
 *
 * One silence is deliberate: **anything that is not a lifecycle change gets no
 * plan.** Creating an order, recording a payment row or revising a cart are
 * not status transitions, and posting one would be a malformed event.
 *
 * Platform-backed tenants DO get a plan. Their Customer Hub reads `orders`
 * directly and needs no ledger sync, but the register writes those orders
 * straight to Supabase with no server in the loop — so this post is the only
 * way a delivery or a settlement reaches loyalty earning.
 */

import type { OrderBackend } from "../order-backend";

/** Mutations that move an order through its lifecycle. */
const LIFECYCLE_REFS = new Set([
  "orders:updateOrderStatus",
  "orders:updatePaymentStatus",
  // Writes a status alongside the prep promise, in one patch, so a ticket can
  // never carry a promise while still reading as not-yet-started.
  "orders:setPrepTime",
]);

/**
 * The platform's name for each backend. The two vocabularies differ and it
 * matters: the app's `supabase` means *the tenant's own project*, which the
 * platform calls `tenant_supabase`; the app's `platform` is the platform's
 * own orders table.
 */
const PLATFORM_BACKEND: Record<OrderBackend, string> = {
  convex: "convex",
  supabase: "tenant_supabase",
  platform: "platform_supabase",
};

export interface LifecycleSyncPlan {
  tenantId: string;
  backend: string;
  externalOrderId: string;
  status: string;
  paymentStatus: string | null;
  source: "pos" | "online" | null;
  outletId: string | null;
}

export interface LifecyclePlanInput {
  tenantId: string | null;
  /** Null before the store's backend has resolved; nothing to sync yet. */
  orderBackend: OrderBackend | null;
  refName: string;
  args: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function planLifecycleSync(input: LifecyclePlanInput): LifecycleSyncPlan | null {
  if (!input.tenantId || !input.orderBackend) return null;
  if (!LIFECYCLE_REFS.has(input.refName)) return null;

  const backend = PLATFORM_BACKEND[input.orderBackend];

  const args = (input.args ?? {}) as Record<string, unknown>;

  const externalOrderId = text(args.orderId);
  if (!externalOrderId) return null;

  const status = text(args.status);
  const paymentStatus = text(args.paymentStatus) || null;
  // A payment-only patch leaves the status alone; the server keeps what it has.
  if (!status && !paymentStatus) return null;

  return {
    tenantId: input.tenantId,
    backend,
    externalOrderId,
    status,
    paymentStatus,
    source: !text(args.source) ? null : text(args.source) === "pos" ? "pos" : "online",
    outletId: text(args.outletId) || null,
  };
}
