"use server";

import {
  deployConvexSchema,
  validateConvexCredentials,
  syncTenantConfig,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/convex-deploy";
import { tenantsNeedingDeploy } from "@/lib/convex-deploy-selection";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantSecrets, listTenantSecrets, mergeTenantSecrets } from "@/lib/tenant-secrets";
import { createClient } from "@/lib/supabase/server";
import {
  buildTenantConfigPayload,
  CONVEX_CONFIG_TENANT_COLUMNS,
  type ConvexTenantConfigSource,
} from "@/lib/convex-tenant-config";

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

export async function deployConvexToTenantAction(tenantId: string) {
  // Verify superadmin access before proceeding
  await verifySuperadmin();

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tenants")
    .select(CONVEX_CONFIG_TENANT_COLUMNS)
    .eq("id", tenantId)
    .single();

  // The deploy key and Lalamove credentials live in tenant_secrets.
  const secrets = error || !data ? null : await getTenantSecrets(supabase, tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = data ? (mergeTenantSecrets(data, secrets) as Record<string, any>) : null;

  if (error || !tenant?.convex_deployment_url || !tenant?.convex_deploy_key) {
    return { success: false, error: "Missing Convex credentials" };
  }

  // Validate credentials first
  const isValid = await validateConvexCredentials(
    tenant.convex_deployment_url,
    tenant.convex_deploy_key
  );

  if (!isValid) {
    return {
      success: false,
      error:
        "Invalid Convex credentials. Check the deployment URL and deploy key.",
    };
  }

  // Deploy schema + functions
  const deployResult = await deployConvexSchema(
    tenant.convex_deploy_key,
    tenant.convex_deployment_url
  );

  if (!deployResult.success) {
    return {
      success: false,
      error: `Schema deployment failed: ${deployResult.error}`,
    };
  }

  // Sync tenant config (Lalamove creds, store address) into `tenantConfig`.
  // Same payload the tenant-save paths push, so a deploy and a settings save
  // can never leave the deployment holding different values.
  const configSynced = await syncTenantConfig(
    tenant.convex_deployment_url,
    tenant.convex_deploy_key,
    buildTenantConfigPayload(tenant as ConvexTenantConfigSource)
  );

  if (!configSynced) {
    return {
      success: false,
      error: "Schema deployed but failed to sync tenant config. Try again.",
    };
  }

  // Update schema version and enable app
  // `convex_schema_version` is a text column, not an integer one. Postgres
  // coerced the number on the way in, so this always worked — the stale
  // generated types simply never said so.
  const updatePayload = {
    convex_schema_version: String(CURRENT_SCHEMA_VERSION),
    app_enabled: true,
  };
  await supabase
    .from("tenants")
    .update(updatePayload)
    .eq("id", tenantId);

  return { success: true, schemaVersion: CURRENT_SCHEMA_VERSION };
}

export async function bulkDeployConvexAction() {
  // Verify superadmin access before proceeding
  await verifySuperadmin();

  const supabase = createAdminClient();

  const { data } = await supabase
    .from("tenants")
    .select("id, convex_deployment_url, convex_schema_version")
    // Require BOTH credentials to be present and non-empty. Filtering only on
    // `IS NULL` lets a half-configured tenant (e.g. a deploy key saved but the
    // deployment URL left blank) slip through, where it would then fail the
    // truthiness guard in deployConvexToTenantAction and surface as a
    // "Missing Convex credentials" error rather than being quietly skipped.
    // The URL is filtered here; the deploy key lives in tenant_secrets, so it
    // is checked against that table next.
    .not("convex_deployment_url", "is", null)
    .neq("convex_deployment_url", "");

  const urlRows = (data ?? []) as Array<{ id: string; convex_schema_version?: string | null }>;
  const secretsByTenant = await listTenantSecrets(
    supabase,
    urlRows.map((row) => row.id)
  );
  const configured = urlRows.filter((row) =>
    Boolean(secretsByTenant.get(row.id)?.convex_deploy_key?.trim())
  );

  // Which of those are behind is decided here, not by the database. The column
  // is TEXT, so `convex_schema_version.lt.18` compared lexically — and "5" and
  // "9" are lexically GREATER than "18". Every store on a single-digit version
  // dropped out of this query the moment head passed 10, and stayed out: the
  // button said "0 updated" and the oldest deployments were never re-pushed.
  // That is how tenants ended up stuck on v5 rejecting `source: "pos"`.
  const tenants = tenantsNeedingDeploy(configured, CURRENT_SCHEMA_VERSION);

  if (!tenants.length) {
    return { success: true, updated: 0, errors: [] as string[] };
  }

  const results = { updated: 0, errors: [] as string[] };

  for (const tenant of tenants) {
    const result = await deployConvexToTenantAction(tenant.id);
    if (result.success) {
      results.updated++;
    } else {
      results.errors.push(`Tenant ${tenant.id}: ${result.error}`);
    }
  }

  return { success: true, ...results };
}
