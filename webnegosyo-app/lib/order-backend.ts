/**
 * Where a tenant's orders live, as seen from the merchant app.
 *
 * This is the mobile mirror of `src/lib/order-backend.ts` on the web. The two
 * apps are separate packages with no shared build, so the resolution rule is
 * duplicated rather than imported — the same arrangement `staff-permissions.ts`
 * already uses. **Keep the two in sync**: a tenant must resolve to the same
 * backend on web and on mobile, or the admin dashboard and the app will read
 * different databases for the same store.
 *
 * - `convex`   — the tenant's own dedicated Convex deployment.
 * - `supabase` — the tenant's own dedicated, fully separate Supabase project.
 * - `platform` — the shared platform Supabase, which the app already holds an
 *                authenticated client for (`lib/supabase.ts`).
 */
export type OrderBackend = "convex" | "supabase" | "platform";

const ORDER_BACKENDS: readonly OrderBackend[] = ["convex", "supabase", "platform"];

/** The subset of tenant columns needed to route order reads and writes. */
export interface OrderBackendTenantFields {
  order_backend?: OrderBackend | null;
  convex_deployment_url?: string | null;
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolve the effective order backend for a tenant.
 *
 * Prefers the explicit `order_backend` column so a superadmin can move a tenant
 * off Convex without first clearing its credentials. An absent or unrecognized
 * value (a row written by a newer platform build than this app) falls back to
 * the historical rule — a Convex URL means Convex, otherwise the shared
 * platform database — so the app degrades instead of stranding on an adapter it
 * does not ship.
 */
export function resolveOrderBackend(tenant: OrderBackendTenantFields): OrderBackend {
  if (tenant.order_backend && ORDER_BACKENDS.includes(tenant.order_backend)) {
    return tenant.order_backend;
  }
  return isNonEmpty(tenant.convex_deployment_url) ? "convex" : "platform";
}

/** The order-routing fields as the merchant app's auth session holds them. */
export interface OrderSessionFields {
  convexUrl: string | null;
  orderBackend: OrderBackend | null;
}

/**
 * True when the app can actually read and write this session's orders.
 *
 * Screens gated on `convexUrl` alone predate the platform backend and lock out
 * every tenant moved onto the shared database — which the app reaches through
 * the adapter in `lib/backends/`, no deployment url required. `supabase` (a
 * separate per-tenant project) is deliberately false: the app ships no adapter
 * for it, so there is nothing to read.
 */
export function hasLiveOrderBackend(session: OrderSessionFields): boolean {
  if (session.orderBackend === "platform") return true;
  if (session.orderBackend === "supabase") return false;
  return isNonEmpty(session.convexUrl);
}

/**
 * True when this tenant's orders are served by the shared platform Supabase —
 * the one database the app is already authenticated against. `supabase` is
 * deliberately excluded: that is a per-tenant project reached with different
 * credentials.
 */
export function isPlatformBackend(tenant: OrderBackendTenantFields): boolean {
  return resolveOrderBackend(tenant) === "platform";
}
