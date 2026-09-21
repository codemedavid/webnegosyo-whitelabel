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
  toOrderPaymentDto,
  toOrderRevisionDto,
  toOrderWithItems,
  type CreateOrderArgs,
  type PlatformOrderItemRow,
  type PlatformOrderPaymentRow,
  type PlatformOrderRevisionRow,
  type PlatformOrderRow,
} from "./supabase-orders";
import {
  buildPaymentRow,
  buildRevisionRows,
  type RecordPaymentArgs,
  type ReviseOrderArgs,
} from "./order-revise";
import type { BranchScope } from "../branch-scope";
import {
  STATS_LIMIT,
  STORE_WIDE,
  asRecord,
  requireTenant,
  scopeToBranch,
  unwrap,
  type PlatformClient,
} from "./platform-client";
import { isUuid, toUuidOrNull } from "../uuid";
import { PartialOrderWriteError } from "../offline/network-error";
import { isPlatformAnalyticsRef, runPlatformAnalyticsQuery } from "./supabase-analytics";
import {
  isPlatformProductCostRef,
  runPlatformProductCostMutation,
  runPlatformProductCostQuery,
} from "./supabase-product-costs";

// The narrow client contract lives in `platform-client.ts`; re-exported so the
// existing importers (hooks, tests) keep their entry point.
export type { PlatformClient, PlatformQueryBuilder } from "./platform-client";

const ORDER_COLUMNS = "*";
const ORDER_WITH_ITEMS_COLUMNS = "*, order_items(*)";

/**
 * `order_items` has no `tenant_id` of its own, so it is scoped through an inner
 * join on its parent order. Without the join a superadmin's RLS grant would
 * expose every merchant's line items.
 *
 * `created_at` MUST stay in the embedded projection: `getAllOrderItems` sorts
 * by `orders(created_at)`, and PostgREST can only order by an embedded column
 * that the embed actually selects. With `orders!inner(tenant_id)` alone the
 * whole read failed with `column order_items_orders_1.created_at does not
 * exist` — every platform store's kitchen board and product analytics were
 * empty (198 refusals in one day).
 */
const ORDER_ITEM_COLUMNS = "*, orders!inner(tenant_id, created_at)";

/** Matches the Convex `getOrders` default page size. */
const DEFAULT_ORDER_LIMIT = 50;

/**
 * Safety cap on the live queue. Convex takes 50 per status; one bounded read
 * covering all four open buckets keeps the round-trips down without risking an
 * unbounded scan on a busy store.
 */
const QUEUE_LIMIT = 200;

const OPEN_STATUSES = ["pending", "confirmed", "preparing", "ready"];

/**
 * How many order ids one `in (...)` request names. A uuid is 36 characters, so
 * 200 of them keep the query string near 8 KB — under every gateway's URL cap
 * — while a 2000-order export is still only ten reads.
 */
export const ORDER_ID_CHUNK_SIZE = 200;

/** The ids this database can hold, in bounded runs, ready for `in (...)`. */
function chunkOrderIds(value: unknown): string[][] {
  const ids = Array.isArray(value) ? value.filter(isUuid) : [];
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += ORDER_ID_CHUNK_SIZE) {
    chunks.push(ids.slice(start, start + ORDER_ID_CHUNK_SIZE));
  }
  return chunks;
}

/** One bounded read per run of ids, answered in order and flattened. */
async function readByOrderIds<Row>(
  chunks: readonly string[][],
  read: (ids: readonly string[]) => Promise<Row[] | null>
): Promise<Row[]> {
  const pages = await Promise.all(chunks.map((ids) => read(ids)));
  return pages.flatMap((page) => page ?? []);
}

/**
 * The order id a write is allowed to name, or a refusal.
 *
 * `orders.id` is a uuid, and supabase-js serialises whatever it is handed into
 * the query string: `undefined` becomes the literal `id=eq.undefined` and a
 * Convex document id goes through as-is. Postgres answers both with 22P02,
 * which `unwrap` re-throws verbatim — so the cashier read "invalid input syntax
 * for type uuid" where a saved tap belonged. Refusing here keeps the failure
 * in this app's own words, and keeps a destructive path from starting at all.
 */
function requireOrderUuid(value: unknown): string {
  if (isUuid(value)) return value;
  throw new Error(
    "That order could not be opened — its id does not belong to this store's database."
  );
}

/** Refs this adapter can serve. Anything else must fall through to Convex. */
const SUPPORTED_QUERY_REFS = [
  "orders:getOrders",
  "orders:getOrderById",
  "orders:getAllOrderItems",
  "orders:getOrderPayments",
  "orders:getOrderPaymentsForOrders",
  "orders:getOrderRevisions",
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
  "orders:setPrepTime",
] as const;

/** Action refs the platform backend answers (see `runPlatformAction`). */
const SUPPORTED_ACTION_REFS = ["productAnalyticsAggregator:refreshAnalytics"] as const;

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
  return (
    SUPPORTED_REFS.includes(ref) ||
    (SUPPORTED_ACTION_REFS as readonly string[]).includes(ref) ||
    isPlatformAnalyticsRef(ref) ||
    isPlatformProductCostRef(ref)
  );
}

// --- queries --------------------------------------------------------------

/**
 * The half-open `[startMs, endMs)` a report asked for, or `null` for the plain
 * recent queue every live screen still reads.
 *
 * Refused rather than coerced, for the reason `getDashboardStatsByPeriod`
 * already documents: `new Date(NaN).toISOString()` throws a bare RangeError
 * with no clue which screen sent it.
 */
function orderWindow(args: Record<string, unknown>): { startMs: number; endMs: number } | null {
  if (args.startMs === undefined && args.endMs === undefined) return null;

  const startMs = Number(args.startMs);
  const endMs = Number(args.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error(
      "Invalid order window — startMs and endMs must both be epoch milliseconds."
    );
  }
  if (endMs <= startMs) {
    throw new Error("Invalid order window — endMs must be after startMs.");
  }
  return { startMs, endMs };
}

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

  // A report asking for one day or a custom range. Pushed to PostgREST rather
  // than filtered after the limit: this is a most-recent-N page, so a
  // post-filter would answer "which of the last N orders fell on that day?"
  // and return nothing at all on a store that has traded since.
  const window = orderWindow(args);
  if (window) {
    builder = builder
      .gte("created_at", new Date(window.startMs).toISOString())
      .lt("created_at", new Date(window.endMs).toISOString());
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
  // An id this database cannot hold — a Convex-shaped one from a stale
  // notification, or an argument a screen lost — matches no order. Saying so is
  // both true and something the screen already renders; sending it on is 22P02.
  if (!isUuid(args.orderId)) return null;

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
 * Line items, mirroring Convex `orders:getAllOrderItems`.
 *
 * Every live screen already holds the orders it shows, so it names them in
 * `orderIds` and the read is a few index lookups. Without ids this is the
 * tenant's every line item — a 10k-row sorted join that, polled by every
 * device on every screen, was the single heaviest read during the 2026-09-20
 * saturation. That form is kept only for a caller that genuinely has no order
 * list yet; nothing in the app sends it today.
 */
async function getAllOrderItems(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>,
  scope: BranchScope
) {
  const itemsFor = (ids?: readonly string[]) => {
    let builder = scopeToBranch(
      client
        .from("order_items")
        .select(ORDER_ITEM_COLUMNS)
        .eq("orders.tenant_id", tenantId),
      scope,
      "orders.outlet_id"
    );
    if (ids) builder = builder.in("order_id", ids);
    return unwrap<PlatformOrderItemRow[] | null>(
      builder
        // Newest parent order first, so the STATS_LIMIT cap drops history rather
        // than letting the database pick which rows survive — unordered, it is
        // the NEWEST orders' items that silently vanish past 10k line items.
        .order("orders(created_at)", { ascending: false })
        .limit(STATS_LIMIT)
    );
  };

  const rows =
    args.orderIds === undefined
      ? ((await itemsFor()) ?? [])
      : await readByOrderIds(chunkOrderIds(args.orderIds), itemsFor);

  return rows.map((row) => toOrderItemDto(row));
}

/**
 * Per-order reads are bounded like every other read a phone makes. One order
 * never legitimately carries this many settlements or edits; the ceilings
 * exist so a runaway writer cannot turn opening an order into a table scan.
 */
export const ORDER_LEDGER_LIMIT = 200;
export const ORDER_REVISIONS_LIMIT = 100;

/**
 * An order's settlement ledger, oldest first — the order the money actually
 * moved in, which is what a merchant reading the history expects.
 *
 * Not branch-scoped: `order_payments` has no `outlet_id` filter worth applying
 * here, because the order id is only reachable through `getOrderById`, which is
 * already scoped. Tenant scoping IS applied, since a superadmin's RLS grant
 * spans every tenant and an unscoped read would expose another merchant's
 * takings.
 */
async function getOrderPayments(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>
) {
  // `String(args.orderId)` used to sit here and it actively defeated the check
  // that would have made this safe: undefined became the literal "undefined",
  // sent to a uuid column, and the cashier got a raw 22P02 where a settlement
  // history belonged. An id this database cannot hold has no rows — a MISSING
  // ledger must read as an EMPTY one. A genuine read failure still throws below.
  const orderId = toUuidOrNull(args.orderId);
  if (!orderId) return [];

  const rows = await unwrap<PlatformOrderPaymentRow[] | null>(
    client
      .from("order_payments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(ORDER_LEDGER_LIMIT)
  );

  return (rows ?? []).map(toOrderPaymentDto);
}

/**
 * The settlement ledgers of many orders in one read, oldest settlement first.
 *
 * A shift card or leaderboard used to mount one `getOrderPayments` per order,
 * each of them polling — 200 sales meant 200 polling requests, the busiest
 * endpoint of the 2026-09-20 saturation. Each request is capped at the
 * per-order ceiling times the orders it names. That cap is shared across the
 * chunk, so a request that fills it may have dropped rows from ANY of its
 * orders — it is refused outright rather than returned short, because a
 * drawer reconciled against a trimmed ledger is worse than no drawer.
 */
export const TRUNCATED_LEDGER_MESSAGE =
  "Settlement history may be incomplete. This drawer cannot be reconciled safely.";

async function getOrderPaymentsForOrders(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>
) {
  const chunks = chunkOrderIds(args.orderIds);
  // An empty ledger reads on screen as "this shift is reconciled", so silence
  // is the one answer this must never give to a malformed ask: a caller that
  // omitted `orderIds`, or sent ids this database cannot hold. An explicitly
  // empty shift is a different thing — nothing was asked about, so nothing is
  // the complete answer.
  const isEmptyAsk = Array.isArray(args.orderIds) && args.orderIds.length === 0;
  if (chunks.length === 0 && !isEmptyAsk) {
    throw new Error("orders:getOrderPaymentsForOrders needs orderIds this database can hold");
  }

  const rows = await readByOrderIds(chunks, async (ids) => {
    const cap = ORDER_LEDGER_LIMIT * ids.length;
    const page = await unwrap<PlatformOrderPaymentRow[] | null>(
      client
        .from("order_payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("order_id", ids)
        .order("created_at", { ascending: true })
        .limit(cap)
    );
    if ((page?.length ?? 0) >= cap) throw new Error(TRUNCATED_LEDGER_MESSAGE);
    return page;
  });

  return rows.map(toOrderPaymentDto);
}

/** An order's edit history, newest first, mirroring Convex `getOrderRevisions`. */
async function getOrderRevisions(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>
) {
  // Same rule as the settlement ledger above: no history is empty, not broken.
  const orderId = toUuidOrNull(args.orderId);
  if (!orderId) return [];

  const rows = await unwrap<PlatformOrderRevisionRow[] | null>(
    client
      .from("order_revisions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("order_id", orderId)
      .order("revision_number", { ascending: false })
      .limit(ORDER_REVISIONS_LIMIT)
  );

  return (rows ?? []).map(toOrderRevisionDto);
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

/**
 * Write the line items of an order that has none.
 *
 * Only ever called on the idempotent replay path, and only writes when the
 * order is genuinely empty — so a sale that already has its items is left
 * exactly as it is rather than doubled.
 */
async function ensureOrderItems(
  client: PlatformClient,
  tenantId: string,
  orderId: string,
  createArgs: CreateOrderArgs
): Promise<void> {
  const { items } = buildCreateOrderRows(tenantId, createArgs);
  if (items.length === 0) return;

  const present = await unwrap<{ id: string }[] | null>(
    client.from("order_items").select("id").eq("order_id", orderId).limit(1)
  );
  if (present && present.length > 0) return;

  await unwrap(
    client
      .from("order_items")
      .insert(items.map((item) => ({ ...item, order_id: orderId })))
  );
}

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
    if (existing) {
      // The order is here, but that does not mean it is complete: the first
      // attempt may have written the row and then lost the response on the way
      // back, leaving the items unwritten. Returning early on that would make
      // the loss permanent, so finish the job before reporting success.
      await ensureOrderItems(client, tenantId, existing.id, createArgs);
      return existing.id;
    }
  }

  const { order, items } = buildCreateOrderRows(tenantId, createArgs);

  const inserted = await unwrap<{ id: string } | null>(
    client.from("orders").insert(order).select("id").single()
  );
  if (!inserted) throw new Error("Order insert returned no row.");

  if (items.length > 0) {
    try {
      await unwrap(
        client
          .from("order_items")
          .insert(items.map((item) => ({ ...item, order_id: inserted.id })))
      );
    } catch (error) {
      // NOT atomic, and it cannot be reordered: `order_items.order_id`
      // references the order, so the irreversible write is forced to go first.
      //
      // A compensating delete would be worse than the disease — a network
      // failure on the way BACK from a successful insert is indistinguishable
      // from a refusal, and deleting on that guess destroys a complete sale. So
      // the honest move is to name what is now sitting on the till.
      //
      // The class that used to land here is gone: `buildCreateOrderRows` now
      // coerces a blank or Convex-shaped `menu_item_id` to null, so 22P02 is
      // no longer reachable. What remains is a product deleted between building
      // the rows and inserting them (23503) and other check constraints.
      // Typed, not a bare Error: the message quotes `reason`, and when that
      // reason is a network blip the offline layer used to regex-match it,
      // file the sale as "queued" and discard this sentence.
      throw new PartialOrderWriteError(inserted.id, error);
    }
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
  // Checked before the write, not after: `orders.id` is a uuid and every caller
  // takes this straight off `params.orderId`, so an absent argument would have
  // gone out as `id=eq.undefined` and come back as a raw 22P02.
  const id = requireOrderUuid(orderId);

  // Read back what the write touched. An UPDATE that matches no row (RLS
  // refusal, out-of-branch order, deleted order) is a PostgREST success with
  // zero rows — resolving on it would show the cashier a tap that "worked"
  // while nothing was written.
  const rows = await unwrap<{ id: string }[] | null>(
    scopeToBranch(
      client.from("orders").update(patch).eq("id", id).eq("tenant_id", tenantId),
      scope
    ).select("id")
  );
  if (!rows || rows.length === 0) {
    throw new Error(
      "That order no longer exists in your branch — it may have been moved or deleted."
    );
  }
  return id;
}

/**
 * Rewrite a placed order's items and record what changed.
 *
 * Reads the order's current state first, so the totals and the audit snapshot
 * are built from what is actually stored rather than from what the client
 * believed when it opened the edit screen.
 *
 * NOT atomic: PostgREST cannot span a transaction across these four writes, and
 * no claim is made that it does. What IS controlled is the order, so that no
 * single refusal can empty a live order. Exactly what each failure leaves:
 *
 *   revision insert refused → nothing written at all
 *   item insert refused     → the order keeps its ORIGINAL lines, untouched
 *   item delete refused     → the order lists the old AND the new lines
 *   order patch refused     → the new lines against the old total
 *
 * The first two are clean. The last two are wrong but VISIBLE, and repairable
 * by editing again; both are reported rather than resolved over. The previous
 * ordering deleted first, so any refusal on the insert that followed left a
 * live order with zero line items, a stale total, and a revision row claiming
 * the edit had landed — data loss, not a failed save. Moving the whole thing
 * into a Postgres RPC is still the real fix.
 */
async function reviseOrder(
  client: PlatformClient,
  tenantId: string,
  args: Record<string, unknown>,
  scope: BranchScope
): Promise<string> {
  const reviseArgs = args as unknown as ReviseOrderArgs;
  // Refused at the door: this path deletes rows, so an id it cannot even filter
  // on must never get part-way through.
  const orderId = requireOrderUuid(reviseArgs.orderId);

  // Scoped to the branch as well as the tenant, so an order at another branch
  // comes back absent and the revise stops here — before any item is deleted.
  const current = await unwrap<{
    total: number | null;
    revision_number: number | null;
    status: string | null;
  } | null>(
    scopeToBranch(
      client
        .from("orders")
        .select("total, revision_number, status")
        .eq("id", orderId)
        .eq("tenant_id", tenantId),
      scope
    ).maybeSingle()
  );
  if (!current) throw new Error("That order no longer exists.");

  const currentItems = await unwrap<PlatformOrderItemRow[]>(
    client.from("order_items").select("*").eq("order_id", orderId)
  );

  const { orderPatch, itemRows, revision } = buildRevisionRows(tenantId, reviseArgs, {
    revisionNumber: current.revision_number ?? 0,
    status: current.status ?? undefined,
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
      // The audit snapshot must show what the lines WERE — including the
      // legacy variation string and bundle markers the columns carry.
      ...(row.variation ? { variation: row.variation } : {}),
      ...(row.is_upsell_item ? { isUpsellItem: true } : {}),
      ...(row.is_bundle_item ? { isBundleItem: true } : {}),
      ...(row.bundle_id ? { bundleId: row.bundle_id } : {}),
      ...(row.bundle_name ? { bundleName: row.bundle_name } : {}),
      ...(row.slot_name ? { slotName: row.slot_name } : {}),
    })),
  });

  // First: claims this revision number. A second staff member saving the same
  // edit fails here on the unique constraint, before any item is touched.
  await unwrap(client.from("order_revisions").insert(revision));

  // The replacements go in BEFORE anything is removed. Every row was already
  // built and validated by `buildRevisionRows` above, so a refusal here is a
  // database-side one (a product deleted mid-edit, a check constraint) — and it
  // now costs the order nothing.
  await unwrap(
    client
      .from("order_items")
      .insert(itemRows.map((row) => ({ ...row, order_id: orderId })))
  );

  // By their OWN ids, never by order_id: the replacements are already sitting
  // under this order, and an `order_id` delete would take them with it.
  const previousItemIds = (currentItems ?? []).map((row) => row.id).filter(isUuid);

  if (previousItemIds.length > 0) {
    const deleted = await unwrap<{ id: string }[] | null>(
      client.from("order_items").delete().in("id", previousItemIds).select("id")
    );
    // A DELETE refused by RLS affects ZERO rows with NO error — the same silent
    // class the status patches guard against. Resolving on it would tell the
    // cashier the edit saved while the kitchen chit lists every item twice.
    if (!deleted || deleted.length !== previousItemIds.length) {
      throw new Error(
        "The new items were saved but the ones they replace could not be removed — " +
          "this order now lists items twice. Check it before serving."
      );
    }
  }

  const patched = await unwrap<{ id: string }[] | null>(
    scopeToBranch(
      client.from("orders").update(orderPatch).eq("id", orderId).eq("tenant_id", tenantId),
      scope
    ).select("id")
  );
  if (!patched || patched.length === 0) {
    throw new Error(
      "The new items were saved but the order's total could not be updated — " +
        "reopen the order and check what it now charges."
    );
  }

  return orderId;
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
      return getAllOrderItems(client, tenant, params, scope);
    case "orders:getOrderById":
      return getOrderById(client, tenant, params, scope);
    case "orders:getOrderPayments":
      return getOrderPayments(client, tenant, params);
    case "orders:getOrderPaymentsForOrders":
      return getOrderPaymentsForOrders(client, tenant, params);
    case "orders:getOrderRevisions":
      return getOrderRevisions(client, tenant, params);
    case "orders:getRealtimeQueue":
      return getRealtimeQueue(client, tenant, scope);
    case "orders:getDashboardStats":
      return getStatsBetween(client, tenant, scope, localDayStartMs(Date.now()));
    case "orders:getDashboardStatsByPeriod": {
      // `Number(undefined)` is NaN and `new Date(NaN).toISOString()` throws a
      // bare RangeError with no clue which screen sent it — refuse loudly.
      const startMs = Number(params.startDate);
      const endMs = Number(params.endDate);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        throw new Error(
          "Invalid date range for period stats — startDate and endDate must be epoch milliseconds."
        );
      }
      return getStatsBetween(client, tenant, scope, startMs, endMs);
    }
    default:
      if (isPlatformAnalyticsRef(ref)) {
        return runPlatformAnalyticsQuery(client, tenant, ref, params, scope);
      }
      if (isPlatformProductCostRef(ref)) {
        return runPlatformProductCostQuery(client, tenant, ref, params);
      }
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
    case "orders:setPrepTime":
      // Written as one patch, with the status, so a ticket can never carry a
      // promise while still reading as not-yet-started.
      return patchOrder(
        client,
        tenant,
        params.orderId,
        {
          prep_minutes: params.prepMinutes,
          promised_ready_at: params.promisedReadyAt,
          status: params.status,
        },
        scope
      );
    case "orders:reviseOrder":
      return reviseOrder(client, tenant, params, scope);
    case "orders:recordPayment":
      return recordPayment(client, tenant, params);
    default:
      if (isPlatformProductCostRef(ref)) {
        return runPlatformProductCostMutation(client, tenant, ref, params);
      }
      throw new Error(`Mutation "${ref}" is not supported by the platform backend.`);
  }
}

/**
 * Convex actions with a platform equivalent.
 *
 * `refreshAnalytics` re-runs the Convex aggregator and stores its rows; on the
 * platform the product matrix is computed live on every read, so there is
 * nothing to write and the gesture resolves immediately. Anything else is
 * refused loudly so a screen shows its "needs a backend update" placeholder
 * rather than believing an action ran.
 */
export async function runPlatformAction(
  _client: PlatformClient,
  tenantId: string,
  ref: string,
  _args: unknown
): Promise<unknown> {
  requireTenant(tenantId);
  switch (ref) {
    case "productAnalyticsAggregator:refreshAnalytics":
      return null;
    default:
      throw new Error(`Action "${ref}" is not supported by the platform backend.`);
  }
}
