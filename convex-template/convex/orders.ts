import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { localDayStartMs } from "./time";

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

    const orderId = await ctx.db.insert("orders", {
      ...orderData,
      status: skipPending ? "confirmed" : "pending",
      paymentStatus: "pending",
    });

    for (const item of items) {
      await ctx.db.insert("orderItems", {
        orderId,
        ...item,
      });
    }

    // Send push notification to admin devices for every new order — pickup,
    // delivery, online, or counter — so nothing slips through silently.
    await ctx.scheduler.runAfter(0, internal.notifications.sendOrderNotification, {
      customerName: args.customerName,
      total: args.total,
      itemCount: args.itemCount,
      orderId: orderId,
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
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("That order no longer exists.");

    if ((order.revisionNumber ?? 0) !== args.expectedRevisionNumber) {
      throw new Error(
        "This order changed while you were editing it — reopen it and try again."
      );
    }

    if (args.items.length === 0) {
      throw new Error("An order cannot be emptied by editing. Cancel it instead.");
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const priced = args.items.map((item: any) => {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 99) {
        throw new Error(`Invalid quantity for "${item.menuItemName}".`);
      }
      if (!Number.isFinite(item.price) || item.price < 0 || item.price > 1000000) {
        throw new Error(`Invalid price for "${item.menuItemName}".`);
      }
      return { ...item, subtotal: round2(item.price * item.quantity) };
    });

    const existing = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const total = round2(
      priced.reduce((sum, item) => sum + item.subtotal, 0) +
        (args.deliveryFee ?? 0) +
        (args.serviceChargeAmount ?? 0)
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
      itemCount: priced.reduce((sum, item) => sum + item.quantity, 0),
      revisionNumber,
      editedAt: args.editedAt,
      editedBy: args.revisedBy,
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
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new Error("A payment amount must be a positive number.");
    }

    await ctx.db.insert("orderPayments", {
      ...args,
      amount: Math.round(args.amount * 100) / 100,
    });

    const ledger = await ctx.db
      .query("orderPayments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const amountPaid = ledger.reduce(
      (sum, row) => (row.kind === "refund" ? sum - row.amount : sum + row.amount),
      0
    );

    await ctx.db.patch(args.orderId, {
      amountPaid: Math.round(amountPaid * 100) / 100,
    });

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
  },
  handler: async (ctx, args) => {
    let orders;
    if (args.status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(args.limit ?? 50);
    } else {
      orders = await ctx.db
        .query("orders")
        .order("desc")
        .take(args.limit ?? 50);
    }
    return orders;
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
  handler: async (ctx) => {
    const statuses = ["pending", "confirmed", "preparing", "ready"] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any[]> = {};

    for (const status of statuses) {
      result[status] = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(50);
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
    // so the merchant can see the cancellation breakdown.
    const completedOrders = todayOrders.filter((o) => o.status !== "cancelled");
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

    const statusCounts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };

    for (const order of todayOrders) {
      statusCounts[order.status]++;
    }

    return {
      totalOrders: completedOrders.length,
      totalRevenue,
      avgOrderValue,
      statusCounts,
    };
  },
});

export const getDashboardStatsByPeriod = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const filtered = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), args.startDate),
          q.lte(q.field("_creationTime"), args.endDate)
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    const completedOrders = filtered.filter((o) => o.status !== "cancelled");
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

    const statusCounts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };

    for (const order of filtered) {
      statusCounts[order.status]++;
    }

    return {
      totalOrders: completedOrders.length,
      totalRevenue,
      avgOrderValue,
      statusCounts,
    };
  },
});
