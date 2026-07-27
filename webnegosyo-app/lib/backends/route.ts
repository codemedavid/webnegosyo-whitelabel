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

export function resolveRefRoute({
  orderBackend,
  tenantId,
  ref,
}: RefRouteInput): RefRoute {
  // Anything not explicitly moved to the platform stays on Convex, which is
  // every tenant that works today. `null` means the session has not resolved
  // yet; Convex's own hook already skips when it has no deployment url.
  if (orderBackend !== "platform" && orderBackend !== "supabase") {
    return "convex";
  }

  // `supabase` is the SEPARATE per-tenant-project track. This adapter targets
  // the shared platform database only and must not read the wrong one.
  if (orderBackend === "supabase") {
    return "unsupported";
  }

  // A superadmin who has not entered a store has no tenant, and their RLS
  // policy grants every tenant's rows — querying now would cross stores.
  if (!tenantId) return "idle";

  return isPlatformRefSupported(ref) ? "platform" : "unsupported";
}
