import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// --- MUTATIONS ---

export const createOrder = mutation({
  args: {
    customerName: v.string(),
    customerContact: v.string(),
    customerData: v.optional(v.any()),
    total: v.number(),
    orderType: v.optional(v.string()),
    orderTypeId: v.optional(v.string()),
    source: v.union(v.literal("web"), v.literal("mobile")),
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
      })
    ),
  },
  handler: async (ctx, args) => {
    const { items, ...orderData } = args;

    const orderId = await ctx.db.insert("orders", {
      ...orderData,
      status: "pending",
      paymentStatus: "pending",
    });

    for (const item of items) {
      await ctx.db.insert("orderItems", {
        orderId,
        ...item,
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
        .withIndex("by_created")
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

export const getRealtimeQueue = query({
  handler: async (ctx) => {
    const statuses = ["pending", "confirmed", "preparing", "ready"] as const;
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
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_created")
      .order("desc")
      .collect();

    const todayOrders = allOrders.filter((o) => o._creationTime >= todayStart);

    const totalRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue = todayOrders.length > 0 ? totalRevenue / todayOrders.length : 0;

    const statusCounts = {
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
      totalOrders: todayOrders.length,
      totalRevenue,
      avgOrderValue,
      statusCounts,
    };
  },
});
