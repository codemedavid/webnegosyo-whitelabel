/**
 * Serves the app's Convex function refs from the shared platform Supabase.
 *
 * Screens address their backend by string ref ("orders:getOrders") and never
 * import a Convex-generated type, so a tenant on `order_backend = 'platform'`
 * can be served here with no screen changes at all. `lib/hooks.ts` is the only
 * dispatch point; see the mapper contract in `supabase-orders.ts`.
 *
 * SECURITY: every query and mutation filters `tenant_id` explicitly, on top of
 * RLS. RLS alone is not enough — the `orders_select_by_tenant` policy grants a
 * SUPERADMIN every tenant's rows, so an unscoped query would render another
 * merchant's orders and customer phone numbers inside an impersonated store.
 * `requireTenant` makes the missing-tenant case fail loudly instead.
 */

import {
  buildCreateOrderRows,
  groupRealtimeQueue,
  localDayStartMs,
  summarizeDashboardStats,
  toOrderDto,
  toOrderItemDto,
  toOrderWithItems,
  type CreateOrderArgs,
  type PlatformOrderItemRow,
  type PlatformOrderRow,
} from "./supabase-orders";

/**
 * The slice of supabase-js this adapter uses. Narrow on purpose: it keeps the
 * query shapes assertable against a recording fake, and documents exactly what
 * the adapter is allowed to do.
 */
export interface PlatformClient {
  from(table: string): PlatformQueryBuilder;
}

export interface PlatformQueryBuilder {
  select(columns?: string): PlatformQueryBuilder;
  eq(column: string, value: unknown): PlatformQueryBuilder;
  in(column: string, values: readonly unknown[]): PlatformQueryBuilder;
  gte(column: string, value: unknown): PlatformQueryBuilder;
  lte(column: string, value: unknown): PlatformQueryBuilder;
  order(column: string, options: { ascending: boolean }): PlatformQueryBuilder;
  limit(count: number): PlatformQueryBuilder;
  insert(values: unknown): PlatformQueryBuilder;
  update(values: unknown): PlatformQueryBuilder;
  maybeSingle(): PlatformQueryBuilder;
  single(): PlatformQueryBuilder;
  then<TResult>(
    onfulfilled: (value: { data: unknown; error: { message: string } | null }) => TResult,
    onrejected?: (reason: unknown) => TResult
  ): Promise<TResult>;
}

const ORDER_COLUMNS = "*";
const ORDER_WITH_ITEMS_COLUMNS = "*, order_items(*)";

/**
 * `order_items` has no `tenant_id` of its own, so it is scoped through an inner
 * join on its parent order. Without the join a superadmin's RLS grant would
 * expose every merchant's line items.
 */
const ORDER_ITEM_COLUMNS = "*, orders!inner(tenant_id)";

/** Matches the Convex `getOrders` default page size. */
const DEFAULT_ORDER_LIMIT = 50;

/**
 * Safety cap on the live queue. Convex takes 50 per status; one bounded read
 * covering all four open buckets keeps the round-trips down without risking an
 * unbounded scan on a busy store.
 */
const QUEUE_LIMIT = 200;

/** Safety cap for stats reads, mirroring Convex's QUERY_LIMIT. */
const STATS_LIMIT = 10000;

const OPEN_STATUSES = ["pending", "confirmed", "preparing", "ready"];

/** Refs this adapter can serve. Anything else must fall through to Convex. */
const SUPPORTED_QUERY_REFS = [
  "orders:getOrders",
  "orders:getOrderById",
  "orders:getAllOrderItems",
  "orders:getRealtimeQueue",
  "orders:getDashboardStats",
  "orders:getDashboardStatsByPeriod",
] as const;

const SUPPORTED_MUTATION_REFS = [
  "orders:createOrder",
  "orders:updateOrderStatus",
  "orders:updatePaymentStatus",
] as const;

const SUPPORTED_REFS: readonly string[] = [
  ...SUPPORTED_QUERY_REFS,
  ...SUPPORTED_MUTATION_REFS,
];

/**
 * Whether the platform backend can serve a ref. A ref it cannot serve must
 * report unsupported rather than return empty data — the screens turn "missing
 * function" into a "needs a backend update" placeholder, which is honest, while
 * an empty array reads as "you have no orders".
 */
export function isPlatformRefSupported(ref: string): boolean {
  return SUPPORTED_REFS.includes(ref);
}

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

/** Unwrap a PostgREST result, turning an error into a throw. */
async function unwrap<T>(builder: PlatformQueryBuilder): Promise<T> {
  const { data, error } = (await builder) as unknown as QueryResult<T>;
  if (error) throw new Error(error.message);
  return data;
}

function requireTenant(tenantId: string): string {
  if (!tenantId || !tenantId.trim()) {
    throw new Error("No tenant is selected — refusing to query orders.");
  }
  return tenantId;
}

function asRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" ? (args as Record<string, unknown>) : {};
}

// --- queries --------------------------------------------------------------

async function getOrders(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>
) {
  let builder = client
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("tenant_id", tenantId);

  if (typeof args.status === "string") {
    builder = builder.eq("status", args.status);
  }

  const rows = await unwrap<PlatformOrderRow[] | null>(
    builder
      .order("created_at", { ascending: false })
      .limit(typeof args.limit === "number" ? args.limit : DEFAULT_ORDER_LIMIT)
  );

  return (rows ?? []).map((row) => toOrderDto(row));
}

async function getOrderById(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>
) {
  const row = await unwrap<(PlatformOrderRow & {
    order_items: PlatformOrderItemRow[] | null;
  }) | null>(
    client
      .from("orders")
      .select(ORDER_WITH_ITEMS_COLUMNS)
      .eq("id", args.orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle()
  );

  if (!row) return null;
  return toOrderWithItems(row, row.order_items ?? []);
}

/**
 * Every line item for the tenant, mirroring Convex `orders:getAllOrderItems`.
 * Product analytics joins these back to their order's date, so fetching them in
 * one bounded read avoids an N+1 (one getOrderById per order).
 */
async function getAllOrderItems(client: PlatformClient, tenantId: string) {
  const rows = await unwrap<PlatformOrderItemRow[] | null>(
    client
      .from("order_items")
      .select(ORDER_ITEM_COLUMNS)
      .eq("orders.tenant_id", tenantId)
      .limit(STATS_LIMIT)
  );

  return (rows ?? []).map((row) => toOrderItemDto(row));
}

async function getRealtimeQueue(client: PlatformClient, tenantId: string) {
  const rows = await unwrap<PlatformOrderRow[] | null>(
    client
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(QUEUE_LIMIT)
  );

  return groupRealtimeQueue(rows ?? []);
}

async function getStatsBetween(
  client: PlatformClient,
  tenantId: string,
  startMs: number,
  endMs?: number
) {
  let builder = client
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(startMs).toISOString());

  if (endMs !== undefined) {
    builder = builder.lte("created_at", new Date(endMs).toISOString());
  }

  const rows = await unwrap<PlatformOrderRow[] | null>(
    builder.order("created_at", { ascending: false }).limit(STATS_LIMIT)
  );

  return summarizeDashboardStats(rows ?? []);
}

// --- mutations ------------------------------------------------------------

async function createOrder(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>
): Promise<string> {
  const createArgs = args as unknown as CreateOrderArgs;

  // Idempotency guard, mirroring Convex. A retried submit on a flaky network
  // must return the original order rather than charge the customer twice.
  if (typeof createArgs.clientOrderId === "string" && createArgs.clientOrderId) {
    const existing = await unwrap<{ id: string } | null>(
      client
        .from("orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("client_order_id", createArgs.clientOrderId)
        .maybeSingle()
    );
    if (existing) return existing.id;
  }

  const { order, items } = buildCreateOrderRows(tenantId, createArgs);

  const inserted = await unwrap<{ id: string } | null>(
    client.from("orders").insert(order).select("id").single()
  );
  if (!inserted) throw new Error("Order insert returned no row.");

  if (items.length > 0) {
    await unwrap(
      client
        .from("order_items")
        .insert(items.map((item) => ({ ...item, order_id: inserted.id })))
    );
  }

  return inserted.id;
}

async function patchOrder(
  client: PlatformClient,
  tenantId: string,
  orderId: unknown,
  patch: Record<string, unknown>
) {
  await unwrap(
    client.from("orders").update(patch).eq("id", orderId).eq("tenant_id", tenantId)
  );
  return orderId;
}

// --- dispatch -------------------------------------------------------------

export async function runPlatformQuery(
  client: PlatformClient,
  tenantId: string,
  ref: string,
  args: unknown
): Promise<unknown> {
  const tenant = requireTenant(tenantId);
  const params = asRecord(args);

  switch (ref) {
    case "orders:getOrders":
      return getOrders(client, tenant, params);
    case "orders:getAllOrderItems":
      return getAllOrderItems(client, tenant);
    case "orders:getOrderById":
      return getOrderById(client, tenant, params);
    case "orders:getRealtimeQueue":
      return getRealtimeQueue(client, tenant);
    case "orders:getDashboardStats":
      return getStatsBetween(client, tenant, localDayStartMs(Date.now()));
    case "orders:getDashboardStatsByPeriod":
      return getStatsBetween(
        client,
        tenant,
        Number(params.startDate),
        Number(params.endDate)
      );
    default:
      throw new Error(`Query "${ref}" is not supported by the platform backend.`);
  }
}

export async function runPlatformMutation(
  client: PlatformClient,
  tenantId: string,
  ref: string,
  args: unknown
): Promise<unknown> {
  const tenant = requireTenant(tenantId);
  const params = asRecord(args);

  switch (ref) {
    case "orders:createOrder":
      return createOrder(client, tenant, params);
    case "orders:updateOrderStatus":
      return patchOrder(client, tenant, params.orderId, { status: params.status });
    case "orders:updatePaymentStatus":
      return patchOrder(client, tenant, params.orderId, {
        payment_status: params.paymentStatus,
      });
    default:
      throw new Error(`Mutation "${ref}" is not supported by the platform backend.`);
  }
}
