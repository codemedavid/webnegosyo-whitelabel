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
    // arrival — they skip the pending queue entirely (no approval step needed)
    // and skip the new-order push (the merchant is already at the device).
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

    // Send push notification to admin devices. Skip for QR handoff / POS: the
    // merchant is already holding the device they rang the order up on, so a
    // new-order alert sound/notification would be redundant and noisy.
    if (!skipPending) {
      await ctx.scheduler.runAfter(0, internal.notifications.sendOrderNotification, {
        customerName: args.customerName,
        total: args.total,
        itemCount: args.itemCount,
        orderId: orderId,
      });
    }

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
