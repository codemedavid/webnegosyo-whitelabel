import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Clients for a tenant's OWN, fully separate Supabase project — the single seam
 * through which every per-tenant order read, write, and realtime subscription
 * flows when `order_backend = 'supabase'`.
 *
 * Deliberately untyped against `@/types/database`: that schema describes the
 * shared platform project (menus, tenants, branding, ...), whereas a tenant
 * order project only ever contains the standalone bundle in
 * `src/lib/supabase-order-schema.ts`. Typing one against the other would be a
 * lie that the compiler would happily believe.
 *
 * Two clients, two keys, on purpose:
 *  - the WRITE client uses the service-role key and is server-only;
 *  - the REALTIME client uses the anon key and is the one safe to hand to a
 *    browser subscription.
 *
 * Security note (accepted trade-off, see docs/testing/order-backend.tdd.md):
 * the realtime path reaches the tenant project with its anon key, so anyone
 * holding that key can read that project's `orders` / `order_items` under the
 * bundle's permissive SELECT policy. The blast radius is a single tenant's own
 * project, and it mirrors the precedent already set by the unauthenticated
 * QR-handoff Convex mutations. Revisit if per-project auth is ever introduced.
 */

/** The tenant columns needed to reach the project. Structural for testability. */
export interface TenantOrderCredentials {
  supabase_order_url?: string | null;
  supabase_order_anon_key?: string | null;
  supabase_order_service_key?: string | null;
}

/** Constructs a Supabase client. Injected so tests never open a real connection. */
export type TenantOrderClientFactory = (
  url: string,
  key: string,
  options?: Parameters<typeof createClient>[2]
) => SupabaseClient;

const defaultFactory: TenantOrderClientFactory = (url, key, options) =>
  createClient(url, key, options);

/**
 * Server clients must not carry session state between requests — each call is
 * an isolated service-role operation, exactly as `createAdminClient` does for
 * the platform project.
 */
const STATELESS_AUTH = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const;

function requireCredential(
  value: string | null | undefined,
  label: string
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Tenant Supabase order backend is misconfigured: ${label} is missing. ` +
        `Set it on the tenant before routing orders to its own project.`
    );
  }
  return value;
}

/**
 * Service-role client for the tenant's order project. SERVER-ONLY — this key
 * bypasses RLS entirely and must never reach the browser bundle.
 */
export function createTenantOrderWriteClient(
  credentials: TenantOrderCredentials,
  factory: TenantOrderClientFactory = defaultFactory
): SupabaseClient {
  const url = requireCredential(credentials.supabase_order_url, "supabase_order_url");
  const serviceKey = requireCredential(
    credentials.supabase_order_service_key,
    "the service-role key (supabase_order_service_key)"
  );

  return factory(url, serviceKey, STATELESS_AUTH);
}

/**
 * Anon-key client for realtime subscriptions and public reads against the
 * tenant's order project. Intentionally does NOT require the service-role key,
 * so a subscription can never accidentally be built with elevated credentials.
 */
export function createTenantOrderRealtimeClient(
  credentials: TenantOrderCredentials,
  factory: TenantOrderClientFactory = defaultFactory
): SupabaseClient {
  const url = requireCredential(credentials.supabase_order_url, "supabase_order_url");
  const anonKey = requireCredential(
    credentials.supabase_order_anon_key,
    "the anon key (supabase_order_anon_key)"
  );

  return factory(url, anonKey);
}
