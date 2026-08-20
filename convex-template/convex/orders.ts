import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
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

    const orderId = await ctx.db.insert("orders", {
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
    await ctx.db.patch(args.orderId, { status: args.status });
    return args.orderId;
  },
});

export const updatePaymentStatus = mutation({
  args: {
    orderId: v.id("orders"),
    paymentStatus: v.string(),
  },
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) =>
    await ctx.db
      .query("orderPayments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect(),
});

/** Edit history for an order, newest first. */
export const getOrderRevisions = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
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

export const getOrders = query({
  args: {
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
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Branch filtering cannot use `by_outlet` here: orders written before v15
    // carry the branch only in `customerData`, so an indexed lookup on the
    // column would silently drop them. Over-fetch and filter on the resolved
    // branch instead — correctness over the index until a backfill lands.
    const take = args.outletId ? Math.max(limit, BRANCH_SCAN_LIMIT) : limit;

    let orders;
    if (args.status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(take);
    } else {
      orders = await ctx.db.query("orders").order("desc").take(take);
    }

    return filterOrdersToOutlet(orders, args.outletId).slice(0, limit);
  },
});

export const getOrderById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return { ...order, items };
  },
});

// Bulk-load all order items in one query. Used by the product-analytics
// aggregator to avoid an N+1 (one getOrderById per order, per period).
export const getAllOrderItems = query({
  handler: async (ctx) => {
    return await ctx.db.query("orderItems").take(QUERY_LIMIT);
  },
});

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

    return { ...order, items };
  },
});

export const getRealtimeQueue = query({
  args: {
    // Narrow to one branch. Optional so every existing caller is unaffected.
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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

      result[status] = filterOrdersToOutlet(rows, args.outletId).slice(0, 50);
    }

    return result;
  },
});

export const getDashboardStats = query({
  handler: async (ctx) => {
    // Start of the merchant's local (PH) day, not UTC midnight, so "today"
    // matches the calendar day the merchant is actually operating in.
    const todayStart = localDayStartMs(Date.now());

    const todayOrders = await ctx.db
      .query("orders")
      .filter((q) => q.gte(q.field("_creationTime"), todayStart))
      .order("desc")
      .take(QUERY_LIMIT);

    // Revenue and order-count metrics exclude cancelled orders so cancellations
    // immediately propagate to the dashboard. Status counts still include them
    // so the merchant can see the cancellation breakdown. Both rules now live
    // in `summarizeOrderStats`, which is unit-tested — these two handlers
    // carried near-identical copies and neither had any coverage.
    return summarizeOrderStats(todayOrders);
  },
});

export const getDashboardStatsByPeriod = query({
  args: {
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
  },
  handler: async (ctx, args) => {
    // A branch's orders are scattered through the window, so taking only
    // QUERY_LIMIT rows and then filtering would silently drop the older half of
    // a busy day — the same reason getOrders widens its take.
    const take = args.outletId ? Math.max(QUERY_LIMIT, BRANCH_SCAN_LIMIT) : QUERY_LIMIT;

    const scanned = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), args.startDate),
          q.lte(q.field("_creationTime"), args.endDate)
        )
      )
      .order("desc")
      .take(take);

    return summarizeOrderStats(scanned, args.outletId);
  },
});
