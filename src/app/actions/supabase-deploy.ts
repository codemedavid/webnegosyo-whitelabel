"use server";

import {
  runTenantSupabaseDeploy,
  validateSupabaseProject,
  SUPABASE_ORDER_SCHEMA_VERSION,
  type TenantDeployCredentials,
} from "@/lib/supabase-deploy";
import { applySupabaseSchema } from "@/lib/supabase-sql-runner";
import { ORDER_SCHEMA_BUNDLE } from "@/lib/supabase-order-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Auto-deploy the standalone order schema into a tenant's OWN Supabase project.
 * Mirror of `deployConvexToTenantAction` in `convex.ts`: superadmin-gated,
 * validates credentials, provisions the schema, then records the version.
 */

/**
 * Verify the current user is a superadmin.
 * Throws if not authenticated or not a superadmin.
 */
async function verifySuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: Not authenticated");
  }

  const { data: userRole } = await supabase
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = userRole as { role: string } | null;
  if (!role || role.role !== "superadmin") {
    throw new Error("Forbidden: Superadmin access required");
  }

  return { user, supabase };
}

const CREDENTIAL_COLUMNS =
  "supabase_order_url, supabase_order_anon_key, supabase_order_service_key, supabase_order_db_url";

export async function deploySupabaseToTenantAction(tenantId: string) {
  await verifySuperadmin();

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tenants")
    .select(CREDENTIAL_COLUMNS)
    .eq("id", tenantId)
    .single();

  const tenant = data as TenantDeployCredentials | null;

  if (error || !tenant) {
    return { success: false, error: "Tenant not found" };
  }

  const result = await runTenantSupabaseDeploy(tenant, ORDER_SCHEMA_BUNDLE, {
    validate: validateSupabaseProject,
    applySchema: applySupabaseSchema,
  });

  if (!result.success) {
    return result;
  }

  // Record the deployed schema version so bulk re-deploys can detect staleness.
  await supabase
    .from("tenants")
    .update({ supabase_order_schema_version: SUPABASE_ORDER_SCHEMA_VERSION })
    .eq("id", tenantId);

  return result;
}

export async function bulkDeploySupabaseAction() {
  await verifySuperadmin();

  const supabase = createAdminClient();

  const { data } = await supabase
    .from("tenants")
    .select(`id, ${CREDENTIAL_COLUMNS}, supabase_order_schema_version`)
    // Only tenants that have actually chosen Supabase as their order backend.
    .eq("order_backend", "supabase")
    // Require every credential to be present and non-empty, so a
    // half-configured tenant is skipped here rather than surfacing as an error.
    .not("supabase_order_url", "is", null)
    .not("supabase_order_anon_key", "is", null)
    .not("supabase_order_service_key", "is", null)
    .not("supabase_order_db_url", "is", null)
    .neq("supabase_order_url", "")
    .neq("supabase_order_anon_key", "")
    .neq("supabase_order_service_key", "")
    .neq("supabase_order_db_url", "")
    // Never-deployed (null version) OR on an older bundle. `NULL < N` is NULL in
    // Postgres, so a plain `.lt` would silently skip freshly-configured tenants.
    .or(
      `supabase_order_schema_version.is.null,supabase_order_schema_version.lt.${SUPABASE_ORDER_SCHEMA_VERSION}`
    );

  const tenants = data as Array<{ id: string }> | null;

  if (!tenants?.length) {
    return { success: true, updated: 0, errors: [] as string[] };
  }

  const results = { updated: 0, errors: [] as string[] };

  for (const tenant of tenants) {
    const result = await deploySupabaseToTenantAction(tenant.id);
    if (result.success) {
      results.updated++;
    } else {
      results.errors.push(`Tenant ${tenant.id}: ${result.error}`);
    }
  }

  return { success: true, ...results };
}
