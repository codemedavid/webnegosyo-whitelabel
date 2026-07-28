import { z } from "zod";

/**
 * Where a tenant's orders are stored and served in real time.
 *
 * - `convex`   — the tenant's own dedicated Convex deployment.
 * - `supabase` — the tenant's own dedicated, fully separate Supabase project.
 * - `platform` — the shared platform Supabase (the legacy default; used by
 *                tenants that never configured a per-tenant backend).
 *
 * Keeping `platform` distinct from `supabase` is deliberate: a bare tenant with
 * no Convex credentials has always written to the shared platform database, and
 * collapsing that into `supabase` would silently reroute those tenants to a
 * per-tenant project they do not have.
 */
export type OrderBackend = "convex" | "supabase" | "platform";

const ORDER_BACKENDS: readonly OrderBackend[] = ["convex", "supabase", "platform"];

/**
 * The subset of tenant columns needed to route order I/O. Accepting a
 * structural type (rather than the full `Tenant`) keeps this module pure and
 * trivially testable.
 */
export interface OrderBackendTenantFields {
  order_backend?: OrderBackend | null;
  convex_deployment_url?: string | null;
  convex_deploy_key?: string | null;
  supabase_order_url?: string | null;
  supabase_order_anon_key?: string | null;
  supabase_order_service_key?: string | null;
  supabase_order_db_url?: string | null;
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolve the effective order backend for a tenant.
 *
 * `convex` and `supabase` are explicit, deliberate selections and always win.
 * `platform` is NOT treated as a deliberate selection: it is the column default,
 * and the tenant create/update path never sets this column, so every tenant
 * given a Convex deployment after the backfill migration ran still reads
 * `platform`. Those tenants' orders go to Convex regardless — the checkout write
 * path routes on the presence of Convex credentials — so honoring a bare
 * `platform` here would point reads at an empty database while writes land in
 * Convex. Falling back to the historical rule keeps reads and writes in
 * agreement by construction.
 *
 * To genuinely move a tenant off Convex, clear `convex_deployment_url`.
 */
export function resolveOrderBackend(tenant: OrderBackendTenantFields): OrderBackend {
  if (
    tenant.order_backend &&
    tenant.order_backend !== "platform" &&
    ORDER_BACKENDS.includes(tenant.order_backend)
  ) {
    return tenant.order_backend;
  }
  return isNonEmpty(tenant.convex_deployment_url) ? "convex" : "platform";
}

/**
 * The value to persist in the `order_backend` column when a tenant is created or
 * updated, so the column stays truthful instead of drifting to a stale
 * `platform` while Convex credentials sit right next to it.
 */
export function orderBackendForSave(tenant: OrderBackendTenantFields): OrderBackend {
  // Unlike a read, a save recomputes `convex` from the credentials actually
  // being written: clearing the deployment URL is how a tenant is moved off
  // Convex, so a leftover `convex` column must not survive that edit.
  if (tenant.order_backend === "convex" && !isNonEmpty(tenant.convex_deployment_url)) {
    return "platform";
  }
  return resolveOrderBackend(tenant);
}

/**
 * True when the tenant has every credential required to reach its own Supabase
 * project for order reads/writes (URL, anon key, service-role key).
 */
export function hasTenantSupabaseOrderCredentials(
  tenant: OrderBackendTenantFields
): boolean {
  return (
    isNonEmpty(tenant.supabase_order_url) &&
    isNonEmpty(tenant.supabase_order_anon_key) &&
    isNonEmpty(tenant.supabase_order_service_key)
  );
}

function hasConvexCredentials(tenant: OrderBackendTenantFields): boolean {
  return (
    isNonEmpty(tenant.convex_deployment_url) && isNonEmpty(tenant.convex_deploy_key)
  );
}

/**
 * Throw a descriptive error when the selected backend is not fully configured.
 *
 * Call this on the checkout write path so a misconfigured tenant fails loudly
 * instead of silently falling back to the wrong database.
 */
export function assertOrderBackendReady(tenant: OrderBackendTenantFields): void {
  const backend = resolveOrderBackend(tenant);

  if (backend === "convex" && !hasConvexCredentials(tenant)) {
    throw new Error(
      "Order backend is set to Convex but the Convex deployment URL and deploy key are missing."
    );
  }

  if (backend === "supabase" && !hasTenantSupabaseOrderCredentials(tenant)) {
    throw new Error(
      "Order backend is set to Supabase but the tenant Supabase URL, anon key, or service-role key is missing."
    );
  }
}

/**
 * Validates the per-tenant Supabase credentials pasted in the superadmin form.
 * The anon key alone cannot run DDL, so the service-role key and a Postgres
 * connection string are both required for the auto-deploy step to work.
 */
export const supabaseOrderCredentialsSchema = z.object({
  supabase_order_url: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"), {
      message: "Supabase project URL must use https://",
    }),
  supabase_order_anon_key: z.string().min(1, "Anon key is required"),
  supabase_order_service_key: z.string().min(1, "Service-role key is required"),
  supabase_order_db_url: z
    .string()
    .min(1, "Database connection string is required")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      { message: "Database URL must be a postgres:// connection string" }
    ),
});

export type SupabaseOrderCredentials = z.infer<typeof supabaseOrderCredentialsSchema>;
