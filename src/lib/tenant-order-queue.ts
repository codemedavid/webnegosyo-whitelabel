import { verifyTenantPermission } from "@/lib/admin-service";
import { createTenantOrderWriteClient } from "@/lib/supabase/tenant-order-client";
import {
  fetchTenantOrdersPage,
  fetchTenantOrderStats,
  type TenantOrdersPage,
  type TenantOrdersPageParams,
} from "@/lib/tenant-supabase-orders-read";
import type { OrderStats } from "@/lib/order-stats";
import type { OrderBackendTenantFields } from "@/lib/order-backend";

/**
 * Server-only entry points for reading a tenant's order queue out of their own
 * Supabase project.
 *
 * These exist to make one thing impossible to forget: the tenant client holds a
 * service-role key and therefore bypasses RLS, so **authorization must be
 * checked against the platform first**. `verifyTenantPermission` is the same
 * gate the platform read path uses; wrapping the fetch here means no admin
 * screen can reach the tenant project without passing it.
 *
 * Do not import this from a Client Component — it would pull the service-role
 * key into the browser bundle.
 */

interface TenantOrderSource extends OrderBackendTenantFields {
  id: string;
}

export async function getTenantSupabaseOrdersPage(
  tenant: TenantOrderSource,
  params?: TenantOrdersPageParams
): Promise<TenantOrdersPage> {
  await verifyTenantPermission(tenant.id, "orders");

  const client = createTenantOrderWriteClient(tenant);
  return fetchTenantOrdersPage(client, tenant.id, params);
}

export async function getTenantSupabaseOrderStats(
  tenant: TenantOrderSource
): Promise<OrderStats> {
  await verifyTenantPermission(tenant.id, "orders");

  const client = createTenantOrderWriteClient(tenant);
  return fetchTenantOrderStats(client, tenant.id);
}
