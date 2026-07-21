/**
 * Auto-deploy of the order-schema bundle into a tenant's OWN, separate Supabase
 * project — the mirror of `src/lib/convex-deploy.ts` for the Supabase backend.
 *
 * This module holds only the pure orchestration: load/version the bundle, drive
 * the deploy, and normalize errors. The actual DDL execution is injected as a
 * `SqlRunner`, so the driver choice (a `postgres` connection over the tenant's
 * connection string, or the Supabase Management API) stays a thin adapter and is
 * not baked into the testable logic.
 */

// Bump when the order-schema bundle changes so a re-deploy re-provisions every
// tenant project — mirrors Convex's CURRENT_SCHEMA_VERSION.
export const SUPABASE_ORDER_SCHEMA_VERSION = 1;

export interface SupabaseDeployResult {
  success: boolean;
  error?: string;
  schemaVersion: number;
}

/** Executes a batch of SQL against the tenant's project. Injected for testability. */
export type SqlRunner = (sql: string) => Promise<void>;

/**
 * Apply the order-schema bundle to a tenant's Supabase project.
 * Never throws — failures are returned as `{ success: false, error }` so the
 * calling server action can surface them the same way `deployConvexSchema` does.
 */
export async function deployOrderSchema(
  bundleSql: string,
  runSql: SqlRunner
): Promise<SupabaseDeployResult> {
  if (!bundleSql || bundleSql.trim().length === 0) {
    return {
      success: false,
      error: "Order-schema bundle is empty — nothing to deploy.",
      schemaVersion: 0,
    };
  }

  try {
    await runSql(bundleSql);
    return { success: true, schemaVersion: SUPABASE_ORDER_SCHEMA_VERSION };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown Supabase deploy error";
    return { success: false, error: message, schemaVersion: 0 };
  }
}

/** The per-tenant credential slice the deploy orchestrator needs. */
export interface TenantDeployCredentials {
  supabase_order_url?: string | null;
  supabase_order_anon_key?: string | null;
  supabase_order_service_key?: string | null;
  supabase_order_db_url?: string | null;
}

/** Injected I/O for `runTenantSupabaseDeploy` — keeps the orchestrator pure. */
export interface TenantDeployDeps {
  /** Reachability/credential check against the project (service-role key). */
  validate: (projectUrl: string, serviceKey: string) => Promise<boolean>;
  /** Apply the SQL bundle over the tenant's Postgres connection string. */
  applySchema: (dbUrl: string, bundleSql: string) => Promise<void>;
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Orchestrate a full per-tenant Supabase deploy: verify every credential is
 * present, confirm the project is reachable, then apply the schema bundle.
 * Pure and I/O-injected so it is unit-testable; never throws — every failure is
 * returned as `{ success: false, error }`, mirroring `deployConvexToTenantAction`.
 */
export async function runTenantSupabaseDeploy(
  tenant: TenantDeployCredentials,
  bundleSql: string,
  deps: TenantDeployDeps
): Promise<SupabaseDeployResult> {
  if (
    !isNonEmpty(tenant.supabase_order_url) ||
    !isNonEmpty(tenant.supabase_order_anon_key) ||
    !isNonEmpty(tenant.supabase_order_service_key)
  ) {
    return {
      success: false,
      error:
        "Missing Supabase order credentials (URL, anon key, and service-role key are all required).",
      schemaVersion: 0,
    };
  }

  if (!isNonEmpty(tenant.supabase_order_db_url)) {
    return {
      success: false,
      error:
        "Missing Postgres connection string — required to run the schema migration (DDL).",
      schemaVersion: 0,
    };
  }

  const isValid = await deps.validate(
    tenant.supabase_order_url,
    tenant.supabase_order_service_key
  );
  if (!isValid) {
    return {
      success: false,
      error:
        "Invalid Supabase credentials. Check the project URL and service-role key.",
      schemaVersion: 0,
    };
  }

  return deployOrderSchema(bundleSql, (sql) =>
    deps.applySchema(tenant.supabase_order_db_url as string, sql)
  );
}

/**
 * Cheap reachability/credentials check against a tenant's Supabase project.
 * Hits the PostgREST root with the service-role key: 401/403 means the key is
 * wrong; any other status (200, 404, …) means the project is reachable and the
 * key is accepted. Network errors resolve to `false` rather than throwing.
 */
export async function validateSupabaseProject(
  projectUrl: string,
  serviceKey: string
): Promise<boolean> {
  try {
    const response = await fetch(`${projectUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    return response.status !== 401 && response.status !== 403;
  } catch {
    return false;
  }
}
