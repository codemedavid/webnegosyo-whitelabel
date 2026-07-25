import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summarizeOrderStats,
  startOfTodayISO,
  type OrderStats,
  type OrderStatsRow,
} from "@/lib/order-stats";

/**
 * Order reads against a tenant's OWN Supabase project (`order_backend = 'supabase'`).
 *
 * The write-side sibling is `src/lib/tenant-supabase-orders.ts`. Both take an
 * already-constructed client so the caller decides which project — and which key
 * — is in play; see `src/lib/supabase/tenant-order-client.ts`.
 *
 * Authorization deliberately does NOT live here. Who may view a tenant's orders
 * is a platform question (`verifyTenantPermission`), answered against the
 * platform database before these functions are ever called. The service-role key
 * used for these reads bypasses RLS, so calling them without that check first
 * would expose the queue.
 */

const ORDER_WITH_ITEMS_SELECT = `
        *,
        order_items(*)
      `;

const DEFAULT_PAGE_SIZE = 20;
const NO_ROWS_ERROR_CODE = "PGRST116";

/** A tenant-project order row joined with its line items. */
export interface TenantOrderWithItems {
  id: string;
  tenant_id: string;
  status: string;
  total: number;
  created_at: string;
  order_items: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface TenantOrdersPageParams {
  page?: number;
  limit?: number;
  status?: string;
  orderType?: string;
}

export interface TenantOrdersPage {
  orders: TenantOrderWithItems[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Pure pagination math, kept separate from the query so the page arithmetic is
 * verifiable without a database.
 */
export function buildTenantOrdersPage(
  rows: unknown[] | null,
  totalCount: number | null | undefined,
  page: number,
  limit: number
): TenantOrdersPage {
  const count = totalCount ?? 0;
  const totalPages = Math.ceil(count / limit);

  return {
    orders: (rows ?? []) as TenantOrderWithItems[],
    totalCount: count,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** `all` is the UI's "no filter" sentinel, not a real column value. */
function isActiveFilter(value: string | undefined): value is string {
  return Boolean(value) && value !== "all";
}

/**
 * Read one page of the tenant's order queue, newest first.
 *
 * The `tenant_id` filter is kept even though the project holds a single tenant:
 * it costs nothing, matches the platform query, and means a project accidentally
 * shared between two tenants still can't cross-serve orders.
 */
export async function fetchTenantOrdersPage(
  client: SupabaseClient,
  tenantId: string,
  params: TenantOrdersPageParams = {}
): Promise<TenantOrdersPage> {
  const page = params.page || 1;
  const limit = params.limit || DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  let query = client
    .from("orders")
    .select(ORDER_WITH_ITEMS_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (isActiveFilter(params.status)) {
    query = query.eq("status", params.status);
  }

  if (isActiveFilter(params.orderType)) {
    query = query.eq("order_type", params.orderType);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(
      `Failed to read orders from the tenant Supabase project: ${error.message}`
    );
  }

  return buildTenantOrdersPage(data, count, page, limit);
}

/**
 * Today's dashboard figures for a tenant on their own project. Shares the
 * summarizer with the platform path so both dashboards agree.
 */
export async function fetchTenantOrderStats(
  client: SupabaseClient,
  tenantId: string,
  now: Date = new Date()
): Promise<OrderStats> {
  const { data, error } = await client
    .from("orders")
    .select("status, total, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", startOfTodayISO(now));

  if (error) {
    throw new Error(
      `Failed to read order stats from the tenant Supabase project: ${error.message}`
    );
  }

  return summarizeOrderStats(data as OrderStatsRow[] | null);
}

/**
 * Read a single order. Returns `null` when it does not exist; any other failure
 * throws, so a broken connection is never mistaken for a deleted order.
 */
export async function fetchTenantOrderById(
  client: SupabaseClient,
  tenantId: string,
  orderId: string
): Promise<TenantOrderWithItems | null> {
  const { data, error } = await client
    .from("orders")
    .select(ORDER_WITH_ITEMS_SELECT)
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === NO_ROWS_ERROR_CODE) return null;
    throw new Error(
      `Failed to read order ${orderId} from the tenant Supabase project: ${error.message}`
    );
  }

  return (data as TenantOrderWithItems) ?? null;
}
