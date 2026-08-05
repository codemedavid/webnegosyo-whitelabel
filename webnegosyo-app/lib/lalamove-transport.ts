/**
 * Which backend can serve a session's Lalamove operations.
 *
 * Kept pure and separate from `lalamove-service.ts` so the decision that
 * determines where a booking is sent is testable — and importable by the
 * delivery card — without dragging in the Supabase client and its native
 * AsyncStorage dependency. Same split, and same reason, as
 * `lib/backends/route.ts` against the adapter it routes to.
 */

import type { OrderSessionFields } from "./order-backend";

/** The four things a merchant can do to a delivery from the order screen. */
export type LalamoveOp = "book" | "sync" | "cancel" | "priority_fee";

export type LalamoveTransport = "convex" | "platform" | "unavailable";

/**
 * Mirrors `hasLiveOrderBackend`: `supabase` is a separate per-tenant project
 * the app ships no adapter for, and claiming a transport for it would send a
 * booking to the wrong database. A session whose `orderBackend` has not
 * resolved yet falls back to the historical rule — a deployment url means
 * Convex — so the card keeps working during the first render after login.
 */
export function resolveLalamoveTransport(session: OrderSessionFields): LalamoveTransport {
  if (session.orderBackend === "platform") return "platform";
  if (session.orderBackend === "supabase") return "unavailable";
  return session.convexUrl && session.convexUrl.trim() !== "" ? "convex" : "unavailable";
}
