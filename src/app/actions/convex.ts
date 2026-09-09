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
    .select(
      "name, convex_deployment_url, lalamove_enabled, lalamove_market, lalamove_service_type, lalamove_sandbox, lalamove_sender_phone, footer_phone, footer_whatsapp, restaurant_address, restaurant_latitude, restaurant_longitude"
    )
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

  // Sync tenant config (Lalamove creds, restaurant address)
  const configs: Record<string, string> = {};

  if (tenant.lalamove_enabled && tenant.lalamove_api_key) {
    configs.lalamove_api_key = tenant.lalamove_api_key;
    configs.lalamove_secret_key = tenant.lalamove_secret_key ?? "";
    configs.lalamove_market = tenant.lalamove_market ?? "PH";
    configs.lalamove_service_type = tenant.lalamove_service_type ?? "MOTORCYCLE";
    configs.lalamove_sandbox = String(tenant.lalamove_sandbox ?? true);
    // Sender (pickup) contact the driver calls — store number, never the
    // customer's. Falls back through footer phone fields.
    // `||`, not `??`: a merchant who cleared the field leaves '' behind, and
    // '' must fall through to the footer numbers rather than be synced as the
    // pickup phone.
    configs.lalamove_sender_phone =
      tenant.lalamove_sender_phone ||
      tenant.footer_phone ||
      tenant.footer_whatsapp ||
      "";
  }

  // Store identity used as the Lalamove sender name + pickup label.
  if (tenant.name) {
    configs.restaurant_name = tenant.name;
  }

  if (tenant.restaurant_address) {
    configs.restaurant_address = tenant.restaurant_address;
    configs.restaurant_latitude = String(tenant.restaurant_latitude ?? 0);
    configs.restaurant_longitude = String(tenant.restaurant_longitude ?? 0);
  }

  if (Object.keys(configs).length > 0) {
    const configSynced = await syncTenantConfig(
      tenant.convex_deployment_url,
      tenant.convex_deploy_key,
      configs
    );

    if (!configSynced) {
      return {
        success: false,
        error:
          "Schema deployed but failed to sync tenant config. Try again.",
      };
    }
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
