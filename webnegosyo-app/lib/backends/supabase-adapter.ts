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
import {
  buildPaymentRow,
  buildRevisionRows,
  type RecordPaymentArgs,
  type ReviseOrderArgs,
} from "./order-revise";
import type { BranchScope } from "../branch-scope";

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
  // Only ever used to replace an edited order's items, and always narrowed by
  // order_id. Widening this interface widens what the adapter can destroy.
  delete(): PlatformQueryBuilder;
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
  "orders:reviseOrder",
  "orders:recordPayment",
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

/** A store-wide account, and the default for every caller that passes no scope. */
const STORE_WIDE: BranchScope = { kind: "all" };

/**
 * Narrow a query to one branch, when the account is confined to one.
 *
 * Layered ON TOP of the tenant filter, never instead of it: outlet ids are
 * unique today, but relying on that would put a cross-tenant leak one schema
 * change away. A store-wide account adds no clause at all, so the query 121
 * live platform tenants run stays exactly what it is today.
 *
 * `column` is a parameter because `order_items` has no branch of its own and is
 * scoped through the join on its parent order — the same way its tenant is.
 */
function scopeToBranch(
  builder: PlatformQueryBuilder,
  scope: BranchScope,
  column = "outlet_id"
): PlatformQueryBuilder {
  if (scope.kind === "all") return builder;
  return builder.eq(column, scope.outletId);
}

// --- queries --------------------------------------------------------------

async function getOrders(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>,
  scope: BranchScope
) {
  let builder = scopeToBranch(
    client.from("orders").select(ORDER_COLUMNS).eq("tenant_id", tenantId),
    scope
  );

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
  args: Record<string, unknown>,
  scope: BranchScope
) {
  // Scoped as well as fetched by id: without it a deep link — or a stale
  // notification — opens another branch's order in full, line items included.
  const row = await unwrap<(PlatformOrderRow & {
    order_items: PlatformOrderItemRow[] | null;
  }) | null>(
    scopeToBranch(
      client
        .from("orders")
        .select(ORDER_WITH_ITEMS_COLUMNS)
        .eq("id", args.orderId)
        .eq("tenant_id", tenantId),
      scope
    ).maybeSingle()
  );

  if (!row) return null;
  return toOrderWithItems(row, row.order_items ?? []);
}

/**
 * Every line item for the tenant, mirroring Convex `orders:getAllOrderItems`.
 * Product analytics joins these back to their order's date, so fetching them in
 * one bounded read avoids an N+1 (one getOrderById per order).
 */
async function getAllOrderItems(
  client: PlatformClient,
  tenantId: string,
  scope: BranchScope
) {
  const rows = await unwrap<PlatformOrderItemRow[] | null>(
    scopeToBranch(
      client
        .from("order_items")
        .select(ORDER_ITEM_COLUMNS)
        .eq("orders.tenant_id", tenantId),
      scope,
      "orders.outlet_id"
    ).limit(STATS_LIMIT)
  );

  return (rows ?? []).map((row) => toOrderItemDto(row));
}

async function getRealtimeQueue(
  client: PlatformClient,
  tenantId: string,
  scope: BranchScope
) {
  const rows = await unwrap<PlatformOrderRow[] | null>(
    scopeToBranch(
      client.from("orders").select(ORDER_COLUMNS).eq("tenant_id", tenantId),
      scope
    )
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(QUEUE_LIMIT)
  );

  return groupRealtimeQueue(rows ?? []);
}

async function getStatsBetween(
  client: PlatformClient,
  tenantId: string,
  scope: BranchScope,
  startMs: number,
  endMs?: number
) {
  let builder = scopeToBranch(
    client.from("orders").select(ORDER_COLUMNS).eq("tenant_id", tenantId),
    scope
  ).gte("created_at", new Date(startMs).toISOString());

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

/**
 * The branch goes into the WHERE clause of the write itself, not into a check
 * performed beforehand. A read-then-write would leave a window in which the
 * order changes branch between the two; this way an out-of-branch patch simply
 * matches no row.
 */
async function patchOrder(
  client: PlatformClient,
  tenantId: string,
  orderId: unknown,
  patch: Record<string, unknown>,
  scope: BranchScope
) {
  await unwrap(
    scopeToBranch(
      client.from("orders").update(patch).eq("id", orderId).eq("tenant_id", tenantId),
      scope
    )
  );
  return orderId;
}

/**
 * Rewrite a placed order's items and record what changed.
 *
 * Reads the order's current state first, so the totals and the audit snapshot
 * are built from what is actually stored rather than from what the client
 * believed when it opened the edit screen.
 *
 * NOT atomic: PostgREST cannot span a transaction across these writes. The
 * order is ordered so the worst partial failure is recoverable — the revision
 * row (which carries the unique constraint that rejects a concurrent edit)
 * lands FIRST, so a crash after it leaves an audit trail of an edit that did
 * not fully apply, rather than a silently rewritten bill with no record.
 * Moving this into a Postgres RPC is the known follow-up.
 */
async function reviseOrder(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>,
  scope: BranchScope
): Promise<string> {
  const reviseArgs = args as unknown as ReviseOrderArgs;

  // Scoped to the branch as well as the tenant, so an order at another branch
  // comes back absent and the revise stops here — before any item is deleted.
  const current = await unwrap<{
    total: number | null;
    revision_number: number | null;
  } | null>(
    scopeToBranch(
      client
        .from("orders")
        .select("total, revision_number")
        .eq("id", reviseArgs.orderId)
        .eq("tenant_id", tenantId),
      scope
    ).maybeSingle()
  );
  if (!current) throw new Error("That order no longer exists.");

  const currentItems = await unwrap<PlatformOrderItemRow[]>(
    client.from("order_items").select("*").eq("order_id", reviseArgs.orderId)
  );

  const { orderPatch, itemRows, revision } = buildRevisionRows(tenantId, reviseArgs, {
    revisionNumber: current.revision_number ?? 0,
    total: current.total ?? 0,
    items: (currentItems ?? []).map((row) => ({
      menuItemId: row.menu_item_id ?? "",
      menuItemName: row.menu_item_name ?? "",
      quantity: row.quantity ?? 0,
      price: row.price ?? 0,
      subtotal: row.subtotal ?? 0,
      ...(row.special_instructions
        ? { specialInstructions: row.special_instructions }
        : {}),
      ...(row.variation_selections
        ? { variationSelections: row.variation_selections }
        : {}),
    })),
  });

  // First: claims this revision number. A second staff member saving the same
  // edit fails here on the unique constraint, before any item is touched.
  await unwrap(client.from("order_revisions").insert(revision));

  await unwrap(
    client.from("order_items").delete().eq("order_id", reviseArgs.orderId)
  );
  await unwrap(
    client
      .from("order_items")
      .insert(itemRows.map((row) => ({ ...row, order_id: reviseArgs.orderId })))
  );

  await unwrap(
    scopeToBranch(
      client
        .from("orders")
        .update(orderPatch)
        .eq("id", reviseArgs.orderId)
        .eq("tenant_id", tenantId),
      scope
    )
  );

  return reviseArgs.orderId;
}

/** Append one settlement row. `orders.amount_paid` follows by trigger. */
async function recordPayment(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>
): Promise<string> {
  const row = buildPaymentRow(tenantId, args as unknown as RecordPaymentArgs);
  await unwrap(client.from("order_payments").insert(row));
  return row.order_id;
}

// --- dispatch -------------------------------------------------------------

/**
 * `scope` is the ACCOUNT's branch, not the branch an owner has drilled into.
 *
 * The distinction matters in both directions. Narrowing by the drill-down would
 * leave the portfolio and the Branches comparison unable to read the branches
 * they exist to compare — and an owner may see the whole store anyway, so there
 * is no safety to be had from it. Narrowing by the account, on the other hand,
 * is the only thing that stops a manager's device receiving rows it may not see.
 */
export async function runPlatformQuery(
  client: PlatformClient,
  tenantId: string,
  ref: string,
  args: unknown,
  scope: BranchScope = STORE_WIDE
): Promise<unknown> {
  const tenant = requireTenant(tenantId);
  const params = asRecord(args);

  switch (ref) {
    case "orders:getOrders":
      return getOrders(client, tenant, params, scope);
    case "orders:getAllOrderItems":
      return getAllOrderItems(client, tenant, scope);
    case "orders:getOrderById":
      return getOrderById(client, tenant, params, scope);
    case "orders:getRealtimeQueue":
      return getRealtimeQueue(client, tenant, scope);
    case "orders:getDashboardStats":
      return getStatsBetween(client, tenant, scope, localDayStartMs(Date.now()));
    case "orders:getDashboardStatsByPeriod":
      return getStatsBetween(
        client,
        tenant,
        scope,
        Number(params.startDate),
        Number(params.endDate)
      );
    default:
      throw new Error(`Query "${ref}" is not supported by the platform backend.`);
  }
}

/**
 * `scope` narrows every write to the account's own branch.
 *
 * `createOrder` is deliberately NOT narrowed: it is an insert, so there is no
 * existing row to guard, and the branch it books to comes from the register's
 * own `customerData` via `buildCreateOrderRows`.
 */
export async function runPlatformMutation(
  client: PlatformClient,
  tenantId: string,
  ref: string,
  args: unknown,
  scope: BranchScope = STORE_WIDE
): Promise<unknown> {
  const tenant = requireTenant(tenantId);
  const params = asRecord(args);

  switch (ref) {
    case "orders:createOrder":
      return createOrder(client, tenant, params);
    case "orders:updateOrderStatus":
      return patchOrder(client, tenant, params.orderId, { status: params.status }, scope);
    case "orders:updatePaymentStatus":
      return patchOrder(
        client,
        tenant,
        params.orderId,
        { payment_status: params.paymentStatus },
        scope
      );
    case "orders:reviseOrder":
      return reviseOrder(client, tenant, params, scope);
    case "orders:recordPayment":
      return recordPayment(client, tenant, params);
    default:
      throw new Error(`Mutation "${ref}" is not supported by the platform backend.`);
  }
}
