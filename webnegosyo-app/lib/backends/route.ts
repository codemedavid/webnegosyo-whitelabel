/**
 * Per-ref backend routing for `lib/hooks.ts`.
 *
 * Kept pure and separate from the hooks so the decision that determines which
 * database a merchant's screen reads is unit-testable without a React tree.
 */

import type { OrderBackend } from "../order-backend";
import { isPlatformRefSupported } from "./supabase-adapter";

export interface RefRouteInput {
  /** Resolved from the tenant row; null before the session patch lands. */
  orderBackend: OrderBackend | null;
  convexUrl: string | null;
  /** The tenant currently in scope (impersonated tenant for a superadmin). */
  tenantId: string | null;
  /** Convex-style function ref, e.g. "orders:getOrders". */
  ref: string;
}

export type RefRoute =
  /** Serve from the tenant's Convex deployment (the existing path). */
  | "convex"
  /** Serve from the shared platform Supabase via the adapter. */
  | "platform"
  /** No backend can serve this ref; screens show a backend-update placeholder. */
  | "unsupported"
  /** Nothing to query yet (no tenant in scope). */
  | "idle";

/** The session fields that decide where a write lands. */
export type WriteBackendInput = Pick<RefRouteInput, "orderBackend" | "convexUrl">;

/**
 * The backend a `useSafeMutation` write for this session lands in.
 *
 * Anything that reports a just-written order to the platform (customer capture,
 * the staff activity line) must name the backend from HERE, never a literal:
 * the QR scanner hard-coded "convex" and filed every platform store's scanned
 * order into the external-order ledger. `resolveRefRoute` is built on this, so
 * the write and the report can never disagree.
 *
 * Anything not explicitly moved to the platform (or to its own project) stays
 * on Convex, which is every tenant that works today. `null` means the session
 * has not resolved yet; Convex's own hook already skips without a url.
 */
export function resolveWriteBackend({ orderBackend }: WriteBackendInput): OrderBackend {
  if (orderBackend === "platform" || orderBackend === "supabase") return orderBackend;
  return "convex";
}

export function resolveRefRoute({
  orderBackend,
  convexUrl,
  tenantId,
  ref,
}: RefRouteInput): RefRoute {
  const backend = resolveWriteBackend({ orderBackend, convexUrl });
  if (backend === "convex") return "convex";

  // `supabase` is the SEPARATE per-tenant-project track. This adapter targets
  // the shared platform database only and must not read the wrong one.
  if (backend === "supabase") {
    return "unsupported";
  }

  // A superadmin who has not entered a store has no tenant, and their RLS
  // policy grants every tenant's rows — querying now would cross stores.
  if (!tenantId) return "idle";

  return isPlatformRefSupported(ref) ? "platform" : "unsupported";
}
