import { allocateDailyOrderNumber } from './orderNumber';
import { orderTimeFilter, orderForClient } from './orderTime';
import { orderBranchFilter } from './branchFilter';
import { v, type ObjectType } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAccess } from "./auth";
import { internal } from "./_generated/api";
import { localDayStartMs } from "./time";
import {
  orderOutletIdFromCustomerData,
  filterOrdersToOutlet,
} from "./pushRecipients";
import { summarizeOrderStats } from "./orderStats";
import {
  assertRevisable,
  priceRevisedItems,
  computeRevisedTotal,
  countRevisedItems,
  normalizePaymentAmount,
  netAmountPaid,
  mergeOrderDiscount,
  revisedDeliveryFeePatch,
  revisedServiceChargePatch,
} from "./orderRevise";

// --- MUTATIONS ---

export const createOrder = mutation({
  args: {
    customerName: v.string(),
    customerContact: v.string(),
    customerData: v.optional(v.any()),
    total: v.number(),
    orderType: v.optional(v.string()),
    orderTypeId: v.optional(v.string()),
    scheduledFor: v.optional(v.string()),
    source: v.union(
      v.literal("web"),
      v.literal("mobile"),
      v.literal("qr_handoff"),
      v.literal("pos")
    ),
    clientOrderId: v.optional(v.string()),
    itemCount: v.number(),
    paymentMethod: v.optional(v.string()),
    paymentMethodDetails: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    // What the order type levied for service, already inside `total`. Spread
    // into the insert with the rest of `orderData`, so accepting it here is
    // what persists it — see the schema comment for why it is stored at all.
    serviceCharge: v.optional(v.number()),
    deliveryAddress: v.optional(v.string()),
    deliveryLatitude: v.optional(v.number()),
    deliveryLongitude: v.optional(v.number()),
    lalamoveQuotationId: v.optional(v.string()),
    hasUpsellItems: v.optional(v.boolean()),
    hasBundleItems: v.optional(v.boolean()),
    items: v.array(
      v.object({
        menuItemId: v.string(),
        menuItemName: v.string(),
        quantity: v.number(),
        price: v.number(),
        subtotal: v.number(),
        specialInstructions: v.optional(v.string()),
        variation: v.optional(v.string()),
        variationSelections: v.optional(
          v.array(
            v.object({
              typeName: v.string(),
              optionName: v.string(),
              priceAdjustment: v.number(),
            })
          )
        ),
        addons: v.optional(
          v.array(
            v.object({
              name: v.string(),
              price: v.number(),
              quantity: v.optional(v.number()),
            })
          )
        ),
        isUpsellItem: v.optional(v.boolean()),
        isBundleItem: v.optional(v.boolean()),
        bundleId: v.optional(v.string()),
        bundleName: v.optional(v.string()),
        slotName: v.optional(v.string()),
        presellDate: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { items, ...orderData } = args;

    // Idempotency guard: if this clientOrderId already exists, return the
    // existing order id without inserting again or re-scheduling the push.
    if (args.clientOrderId) {
      const existing = await ctx.db
        .query("orders")
        .withIndex("by_client_order_id", (q) =>
          q.eq("clientOrderId", args.clientOrderId)
        )
        .first();
      if (existing) {
        return existing._id;
      }
    }

    // QR-handoff and POS orders are rung up by the merchant directly (scanning
    // the customer's QR, or taking a counter sale), so they are confirmed on
    // arrival — they skip the pending queue entirely (no approval step needed).
    // They still fire a new-order push (see below) so every order, including
    // pickups, audibly notifies the merchant.
    const skipPending = args.source === "qr_handoff" || args.source === "pos";

    // The branch arrives inside `customerData` (the only carrier that works
    // across every tenant schema). Promote it to a column so it can be indexed
    // and queried — undefined for a single-location store, which stamps none.
    const outletId =
      orderOutletIdFromCustomerData(args.customerData) ?? undefined;

    const number = await allocateDailyOrderNumber(ctx, Date.now());
    const orderId = await ctx.db.insert("orders", {
      ...number,
      ...orderData,
      status: skipPending ? "confirmed" : "pending",
      paymentStatus: "pending",
      outletId,
    });

    for (const item of items) {
      await ctx.db.insert("orderItems", {
        orderId,
        ...item,
      });
    }

    // Send push notification to admin devices for every new order — pickup,
    // delivery, online, or counter — so nothing slips through silently.
    // Scoped to the order's branch when it has one: a multi-branch store used
    // to wake every branch for every sale.
    await ctx.scheduler.runAfter(0, internal.notifications.sendOrderNotification, {
      customerName: args.customerName,
      total: args.total,
      itemCount: args.itemCount,
      orderId: orderId,
      outletId,
    });

    return orderId;
  },
});

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
    await ctx.db.patch(args.orderId, { status: args.status });
    return args.orderId;
  },
});

/**
 * Record the kitchen's prep-time promise.
 *
 * Writes both halves in one transaction together with the status move: a chef
 * committing to a time IS the chef starting the order, so a `confirmed` ticket
 * becomes `preparing` on the same tap. Splitting these would leave tickets
 * carrying a promise with a stale status if the second call failed.
 *
 * Bounds are enforced here as well as on the client because this is the
 * transaction boundary, and because the value ends up on a stranger's phone.
 */
export const setPrepTime = mutation({
  args: {
    orderId: v.id("orders"),
    prepMinutes: v.number(),
    promisedReadyAt: v.string(),
    status: v.union(v.literal("preparing"), v.literal("confirmed")),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
    if (
      !Number.isInteger(args.prepMinutes) ||
      args.prepMinutes < 1 ||
      args.prepMinutes > 240
    ) {
      throw new Error("Prep time must be a whole number of minutes between 1 and 240.");
    }
    if (Number.isNaN(Date.parse(args.promisedReadyAt))) {
      throw new Error("Promised ready time is not a valid timestamp.");
    }

    await ctx.db.patch(args.orderId, {
      prepMinutes: args.prepMinutes,
      promisedReadyAt: args.promisedReadyAt,
      status: args.status,
    });
    return args.orderId;
  },
});

/**
 * Attach a contact to an order after the fact (receipt-QR capture).
 *
 * Authorized upstream by the order's HMAC tracking token, which is printed on
 * paper anyone can photograph — so this is strictly once-only: it fills a
 * blank/placeholder contact and never overwrites a real one. The guard lives
 * here as well as on the web server because Convex is the transaction
 * boundary; two concurrent submissions cannot both land.
 */
const updateCustomerContactArgs = {
    orderId: v.id("orders"),
    contact: v.string(),
    name: v.optional(v.string()),
};

async function updateCustomerContactHandler(ctx: MutationCtx, args: ObjectType<typeof updateCustomerContactArgs>) {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const existing = (order.customerContact ?? "").trim().toLowerCase();
    const placeholders = ["", "n/a", "na", "-", "none", "walk-in"];
    if (!placeholders.includes(existing)) {
      throw new Error("Contact already set");
    }

    const contact = args.contact.trim();
    if (contact.length < 3 || contact.length > 64) {
      throw new Error("Invalid contact");
    }

    await ctx.db.patch(args.orderId, {
      customerContact: contact,
      ...(args.name ? { customerName: args.name.trim().slice(0, 64) } : {}),
    });
    return args.orderId;
}

export const updateCustomerContact = mutation({
  args: updateCustomerContactArgs,
  handler: async (ctx, args) => {
    return updateCustomerContactHandler(ctx, args);
  },
});

export const updateCustomerContactInternal = internalMutation({ args: updateCustomerContactArgs, handler: updateCustomerContactHandler });

export const updatePaymentStatus = mutation({
  args: {
    orderId: v.id("orders"),
    paymentStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
    await ctx.db.patch(args.orderId, { paymentStatus: args.paymentStatus });
  },
});

/**
 * Rewrite a placed order's items and record what changed.
 *
 * Convex gives this the atomicity the platform backend cannot get through
 * PostgREST: the whole handler is one transaction, so a failure part-way
 * leaves the order exactly as it was.
 *
 * The total is recomputed from the items rather than taken from the caller,
 * matching `lib/backends/order-revise.ts` on the platform side — an edit
 * rewrites a bill that may already be paid, so client arithmetic is not
 * trusted.
 */
export const reviseOrder = mutation({
  args: {
    orderId: v.id("orders"),
    expectedRevisionNumber: v.number(),
    items: v.array(v.any()),
    deliveryFee: v.optional(v.number()),
    serviceChargeAmount: v.optional(v.number()),
    /**
     * The NAMED service charge, stored so the row can be captioned.
     *
     * Distinct from `serviceChargeAmount` above, which is this mutation's
     * single money channel and also carries the discount and any rounding
     * residue. The total is built from that one alone; adding this as well
     * would bill the service twice.
     */
    serviceCharge: v.optional(v.number()),
    reason: v.optional(v.string()),
    revisedBy: v.optional(v.string()),
    outletId: v.optional(v.string()),
    editedAt: v.optional(v.string()),
    /**
     * The discount this edit settled on. Omitted means "unchanged" — most
     * edits do not touch it, and blanking it every save would erase the
     * original. `null` means the edit settled on none.
     *
     * The TOTAL still comes from `serviceChargeAmount`; this is a record of
     * what was decided, so the order's rows and its total can be reconciled.
     */
    discount: v.optional(v.union(v.any(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("That order no longer exists.");

    // Every rule below lives in `orderRevise.ts` so it can be unit-tested, and
    // so it cannot drift from the platform backend's identical guard rails.
    assertRevisable(order, args.expectedRevisionNumber, args.items);
    const priced = priceRevisedItems(args.items);

    const existing = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const total = computeRevisedTotal(
      priced,
      args.deliveryFee,
      args.serviceChargeAmount
    );
    const revisionNumber = (order.revisionNumber ?? 0) + 1;

    await ctx.db.insert("orderRevisions", {
      orderId: args.orderId,
      revisionNumber,
      itemsBefore: existing,
      itemsAfter: priced,
      totalBefore: order.total,
      totalAfter: total,
      reason: args.reason,
      revisedBy: args.revisedBy,
      outletId: args.outletId,
    });

    for (const item of existing) {
      await ctx.db.delete(item._id);
    }
    for (const item of priced) {
      await ctx.db.insert("orderItems", { ...item, orderId: args.orderId });
    }

    await ctx.db.patch(args.orderId, {
      total,
      // The fee the total above was computed with — see revisedDeliveryFeePatch.
      ...revisedDeliveryFeePatch(args.deliveryFee),
      // The named charge, recorded but NOT totalled from — see the arg comment.
      ...revisedServiceChargePatch(args.serviceCharge),
      itemCount: countRevisedItems(priced),
      revisionNumber,
      editedAt: args.editedAt,
      editedBy: args.revisedBy,
      // Only when the edit settled one. `mergeOrderDiscount` replaces the one
      // key and copies the rest of the blob through — the customer's name and
      // contact live in there too.
      ...(args.discount !== undefined
        ? { customerData: mergeOrderDiscount(order.customerData, args.discount) }
        : {}),
    });

    return args.orderId;
  },
});

/**
 * Append one settlement row and refresh the order's cached amountPaid.
 *
 * The platform backend gets this from a database trigger; Convex has no
 * triggers, so the mutation maintains the cache itself — inside the same
 * transaction, so the ledger and the cache cannot disagree.
 */
export const recordPayment = mutation({
  args: {
    orderId: v.id("orders"),
    kind: v.union(v.literal("charge"), v.literal("refund")),
    amount: v.number(),
    paymentMethodId: v.optional(v.string()),
    paymentMethodName: v.optional(v.string()),
    reference: v.optional(v.string()),
    proofUrl: v.optional(v.string()),
    proofPublicId: v.optional(v.string()),
    recordedBy: v.optional(v.string()),
    outletId: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
    await ctx.db.insert("orderPayments", {
      ...args,
      amount: normalizePaymentAmount(args.amount),
    });

    const ledger = await ctx.db
      .query("orderPayments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    await ctx.db.patch(args.orderId, { amountPaid: netAmountPaid(ledger) });

    return args.orderId;
  },
});

/** Every settlement against an order, oldest first. */
export const getOrderPayments = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const payments = await ctx.db
      .query("orderPayments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    return payments.map(payment => payment.occurredAt === undefined ? payment : { ...payment, _creationTime: payment.occurredAt });
  },
});

/** Edit history for an order, newest first. */
export const getOrderRevisions = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const rows = await ctx.db
      .query("orderRevisions")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    return rows.sort((a, b) => b.revisionNumber - a.revisionNumber);
  },
});

export const updateLalamoveDetails = mutation({
  args: {
    orderId: v.id("orders"),
    lalamoveQuotationId: v.optional(v.string()),
    lalamoveOrderId: v.optional(v.string()),
    lalamoveStatus: v.optional(v.string()),
    lalamoveDriverName: v.optional(v.string()),
    lalamoveDriverPhone: v.optional(v.string()),
    lalamoveTrackingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
    const { orderId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(orderId, filtered);
    }
  },
});

// Internal mutation for Lalamove action
export const updateLalamoveDetailsInternal = internalMutation({
  args: {
    orderId: v.id("orders"),
    lalamoveQuotationId: v.optional(v.string()),
    lalamoveOrderId: v.optional(v.string()),
    lalamoveStatus: v.optional(v.string()),
    lalamoveDriverName: v.optional(v.string()),
    lalamoveDriverPhone: v.optional(v.string()),
    lalamoveTrackingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orderId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(orderId, filtered);
    }
  },
});

// --- QUERIES ---

// Safety cap for queries that load orders — prevents OOM on large datasets
const QUERY_LIMIT = 10000;

/**
 * How deep to scan when filtering to a branch.
 *
 * Orders predating v15 carry the branch only in `customerData`, so the
 * `by_outlet` index cannot be trusted to find them and the filter runs in
 * memory. A page of 50 could otherwise return nothing for a quiet branch whose
 * orders sit below the cut. Sized to match the platform adapter's own ceiling.
 */
const BRANCH_SCAN_LIMIT = 500;

const getOrdersArgs = {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("preparing"),
        v.literal("ready"),
        v.literal("delivered"),
        v.literal("cancelled")
      )
    ),
    limit: v.optional(v.number()),
    // Narrow to one branch. Optional so a store-wide account, and every caller
    // on an older app build, keeps today's behaviour exactly.
    outletId: v.optional(v.string()),
};

async function getOrdersHandler(ctx: QueryCtx, args: ObjectType<typeof getOrdersArgs>) {
    const limit = args.limit ?? 50;

    // Filter both canonical and legacy branch metadata before the limit. A
    // short result must mean the history is complete, even at busy neighbors.
    let query;
    if (args.status) {
      query = ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc");
    } else {
      query = ctx.db.query("orders").order("desc");
    }
    if (args.outletId) query = query.filter(q => orderBranchFilter(q, args.outletId));
    return (await query.take(limit)).map(orderForClient);
}

export const getOrders = query({
  args: getOrdersArgs,
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    return getOrdersHandler(ctx, args);
  },
});

export const getOrdersInternal = internalQuery({ args: getOrdersArgs, handler: getOrdersHandler });

const getOrderByIdArgs = { orderId: v.id("orders") };
async function getOrderByIdHandler(ctx: QueryCtx, args: ObjectType<typeof getOrderByIdArgs>) {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return { ...orderForClient(order), items };
}

export const getOrderById = query({
  args: getOrderByIdArgs,
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    return getOrderByIdHandler(ctx, args);
  },
});

export const getOrderByIdInternal = internalQuery({ args: getOrderByIdArgs, handler: getOrderByIdHandler });

// Bulk-load all order items in one query. Used by the product-analytics
// aggregator to avoid an N+1 (one getOrderById per order, per period).
async function getAllOrderItemsHandler(ctx: QueryCtx) {
    return await ctx.db.query("orderItems").take(QUERY_LIMIT);
}

export const getAllOrderItems = query({
  handler: async (ctx) => {
    await requireAccess(ctx, "read");
    return getAllOrderItemsHandler(ctx);
  },
});

export const getAllOrderItemsInternal = internalQuery({ handler: getAllOrderItemsHandler });

export const getOrderByClientId = query({
  args: { clientOrderId: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_client_order_id", (q) =>
        q.eq("clientOrderId", args.clientOrderId)
      )
      .first();
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    return { ...orderForClient(order), items };
  },
});

export const getRealtimeQueue = query({
  args: {
    // Narrow to one branch. Optional so every existing caller is unaffected.
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const statuses = ["pending", "confirmed", "preparing", "ready"] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any[]> = {};

    // Same over-fetch as getOrders, and for the same reason: the branch may live
    // only in `customerData`, so the filter runs after the read.
    const take = args.outletId ? BRANCH_SCAN_LIMIT : 50;

    for (const status of statuses) {
      const rows = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(take);

      result[status] = filterOrdersToOutlet(rows, args.outletId).slice(0, 50).map(orderForClient);
    }

    return result;
  },
});

async function getDashboardStatsHandler(ctx: QueryCtx) {
    // Start of the merchant's local (PH) day, not UTC midnight, so "today"
    // matches the calendar day the merchant is actually operating in.
    const todayStart = localDayStartMs(Date.now());

    const todayOrders = await ctx.db
      .query("orders")
      .filter((q) => orderTimeFilter(q, "gte", todayStart))
      .order("desc")
      .take(QUERY_LIMIT);

    // Revenue and order-count metrics exclude cancelled orders so cancellations
    // immediately propagate to the dashboard. Status counts still include them
    // so the merchant can see the cancellation breakdown. Both rules now live
    // in `summarizeOrderStats`, which is unit-tested — these two handlers
    // carried near-identical copies and neither had any coverage.
    return summarizeOrderStats(todayOrders);
}

export const getDashboardStats = query({
  handler: async (ctx) => {
    await requireAccess(ctx, "read");
    return getDashboardStatsHandler(ctx);
  },
});

export const getDashboardStatsInternal = internalQuery({ handler: getDashboardStatsHandler });

const getDashboardStatsByPeriodArgs = {
    startDate: v.number(),
    endDate: v.number(),
    /**
     * v18. Optional so every caller that asks exactly what it asks today keeps
     * working — a validator rejects arguments it does not know, so a new
     * REQUIRED argument would break every screen on this query at once.
     *
     * Why it exists: the daily inventory report divides a day's stock cost by
     * these takings. The stock half was already narrowable to one branch, so
     * without this a branch manager's food cost was either withheld or
     * understated by roughly the number of branches.
     */
    outletId: v.optional(v.string()),
};

async function getDashboardStatsByPeriodHandler(ctx: QueryCtx, args: ObjectType<typeof getDashboardStatsByPeriodArgs>) {
    // A branch's orders are scattered through the window, so taking only
    // QUERY_LIMIT rows and then filtering would silently drop the older half of
    // a busy day — the same reason getOrders widens its take.
    const take = args.outletId ? Math.max(QUERY_LIMIT, BRANCH_SCAN_LIMIT) : QUERY_LIMIT;

    const scanned = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          orderTimeFilter(q, "gte", args.startDate),
          orderTimeFilter(q, "lte", args.endDate)
        )
      )
      .order("desc")
      .take(take);

    return summarizeOrderStats(scanned, args.outletId);
}

export const getDashboardStatsByPeriod = query({
  args: getDashboardStatsByPeriodArgs,
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    return getDashboardStatsByPeriodHandler(ctx, args);
  },
});

export const getDashboardStatsByPeriodInternal = internalQuery({ args: getDashboardStatsByPeriodArgs, handler: getDashboardStatsByPeriodHandler });
