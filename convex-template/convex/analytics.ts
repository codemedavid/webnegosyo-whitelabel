import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Safety cap for queries that load large collections
const QUERY_LIMIT = 10000;

export const trackEvent = mutation({
  args: {
    type: v.string(),
    metadata: v.optional(v.any()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("analyticsEvents", args);
  },
});

export const getUpsellAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const shown = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_shown"))
      .collect();
    const clicked = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_clicked"))
      .collect();
    const converted = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_converted"))
      .collect();

    const shownCount = shown.filter((e) => e._creationTime >= cutoff).length;
    const clickedCount = clicked.filter((e) => e._creationTime >= cutoff).length;
    const convertedCount = converted.filter((e) => e._creationTime >= cutoff).length;

    return {
      shown: shownCount,
      clicked: clickedCount,
      converted: convertedCount,
      clickRate: shownCount > 0 ? clickedCount / shownCount : 0,
      conversionRate: shownCount > 0 ? convertedCount / shownCount : 0,
    };
  },
});

export const getBundleAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const viewed = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "bundle_viewed"))
      .collect();
    const added = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "bundle_added"))
      .collect();

    const viewedCount = viewed.filter((e) => e._creationTime >= cutoff).length;
    const addedCount = added.filter((e) => e._creationTime >= cutoff).length;

    return {
      viewed: viewedCount,
      added: addedCount,
      conversionRate: viewedCount > 0 ? addedCount / viewedCount : 0,
    };
  },
});

export const getTopItems = query({
  args: {
    daysBack: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // Server-side filter: only fetch orders from the period instead of all
    const recentOrders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    const filteredOrderIds = new Set(
      recentOrders.map((o) => o._id)
    );

    const allItems = await ctx.db.query("orderItems").collect();
    const recentItems = allItems.filter((i) => filteredOrderIds.has(i.orderId));

    const itemMap = new Map<string, { name: string; count: number; revenue: number }>();

    for (const item of recentItems) {
      const existing = itemMap.get(item.menuItemId) ?? {
        name: item.menuItemName,
        count: 0,
        revenue: 0,
      };
      existing.count += item.quantity;
      existing.revenue += item.subtotal;
      itemMap.set(item.menuItemId, existing);
    }

    return Array.from(itemMap.entries())
      .map(([itemId, data]) => ({ itemId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, args.limit ?? 10);
  },
});

export const getTrends = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_date")
      .collect();

    const cutoffDate = new Date(cutoff).toISOString().split("T")[0];

    return stats
      .filter((s) => s.date >= cutoffDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

export const getRevenueBreakdown = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // Server-side filter: push date and status filtering into the query
    const filtered = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Group by order type
    const orderTypeMap = new Map<string, { revenue: number; count: number }>();
    for (const order of filtered) {
      const type = order.orderType ?? "Unknown";
      const existing = orderTypeMap.get(type) ?? { revenue: 0, count: 0 };
      existing.revenue += order.total;
      existing.count += 1;
      orderTypeMap.set(type, existing);
    }

    // Group by payment method
    const paymentMethodMap = new Map<string, { revenue: number; count: number }>();
    for (const order of filtered) {
      const method = order.paymentMethod ?? "Unknown";
      const existing = paymentMethodMap.get(method) ?? { revenue: 0, count: 0 };
      existing.revenue += order.total;
      existing.count += 1;
      paymentMethodMap.set(method, existing);
    }

    return {
      byOrderType: Array.from(orderTypeMap.entries())
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
      byPaymentMethod: Array.from(paymentMethodMap.entries())
        .map(([method, data]) => ({ method, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  },
});

export const getUpsellTrends = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get upsell events for the period
    const shownEvents = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_shown"))
      .collect();
    const convertedEvents = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_converted"))
      .collect();

    const recentShown = shownEvents.filter((e) => e._creationTime >= cutoff);
    const recentConverted = convertedEvents.filter((e) => e._creationTime >= cutoff);

    // Group by date for daily rates
    const dailyMap = new Map<string, { shown: number; converted: number }>();
    for (const event of recentShown) {
      const date = new Date(event._creationTime).toISOString().split("T")[0];
      const existing = dailyMap.get(date) ?? { shown: 0, converted: 0 };
      existing.shown += 1;
      dailyMap.set(date, existing);
    }
    for (const event of recentConverted) {
      const date = new Date(event._creationTime).toISOString().split("T")[0];
      const existing = dailyMap.get(date) ?? { shown: 0, converted: 0 };
      existing.converted += 1;
      dailyMap.set(date, existing);
    }

    const dailyRates = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        rate: data.shown > 0 ? data.converted / data.shown : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate total upsell revenue from order items
    // Server-side filter: only fetch orders from the period
    const recentOrders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);
    const filteredOrderIds = new Set(
      recentOrders.map((o) => o._id)
    );

    const allItems = await ctx.db.query("orderItems").collect();
    const upsellRevenue = allItems
      .filter((i) => filteredOrderIds.has(i.orderId) && i.isUpsellItem)
      .reduce((sum, i) => sum + i.subtotal, 0);

    return {
      dailyRates,
      totalUpsellRevenue: upsellRevenue,
    };
  },
});

export const getSalesAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const prevCutoff = cutoff - days * 24 * 60 * 60 * 1000;

    // Current period orders
    const currentOrders = await ctx.db
      .query("orders")
      .filter((q) => q.gte(q.field("_creationTime"), cutoff))
      .order("desc")
      .take(QUERY_LIMIT);

    // Previous period orders (for growth comparison)
    const prevOrders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), prevCutoff),
          q.lt(q.field("_creationTime"), cutoff)
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    const completed = currentOrders.filter((o) => o.status !== "cancelled");
    const cancelled = currentOrders.filter((o) => o.status === "cancelled");
    const prevCompleted = prevOrders.filter((o) => o.status !== "cancelled");

    const totalRevenue = completed.reduce((sum, o) => sum + o.total, 0);
    const prevRevenue = prevCompleted.reduce((sum, o) => sum + o.total, 0);
    const cancelledRevenue = cancelled.reduce((sum, o) => sum + o.total, 0);

    const webOrders = currentOrders.filter((o) => o.source === "web").length;
    const mobileOrders = currentOrders.filter((o) => o.source === "mobile").length;

    const statusCounts: Record<string, number> = {};
    for (const order of currentOrders) {
      statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
    }

    return {
      totalRevenue,
      totalOrders: currentOrders.length,
      completedOrders: completed.length,
      avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      cancelledOrders: cancelled.length,
      cancelledRevenue,
      cancellationRate: currentOrders.length > 0 ? cancelled.length / currentOrders.length : 0,
      ordersBySource: { web: webOrders, mobile: mobileOrders },
      ordersByStatus: statusCounts,
      revenueGrowth: prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue : 0,
    };
  },
});

export const getPaymentMethodAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const orders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Aggregate by payment method
    const methodMap = new Map<string, { count: number; revenue: number; totalOrderValue: number }>();
    for (const order of orders) {
      const method = order.paymentMethod ?? "Unknown";
      const existing = methodMap.get(method) ?? { count: 0, revenue: 0, totalOrderValue: 0 };
      existing.count += 1;
      existing.revenue += order.total;
      existing.totalOrderValue += order.total;
      methodMap.set(method, existing);
    }

    const totalOrders = orders.length;
    const methods = Array.from(methodMap.entries())
      .map(([method, data]) => ({
        method,
        count: data.count,
        revenue: data.revenue,
        percentage: totalOrders > 0 ? data.count / totalOrders : 0,
        avgOrderValue: data.count > 0 ? data.totalOrderValue / data.count : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Daily breakdown for trend lines
    const dailyMap = new Map<string, Map<string, number>>();
    for (const order of orders) {
      const date = new Date(order._creationTime).toISOString().split("T")[0];
      const method = order.paymentMethod ?? "Unknown";
      if (!dailyMap.has(date)) dailyMap.set(date, new Map());
      const dayMethods = dailyMap.get(date)!;
      dayMethods.set(method, (dayMethods.get(method) ?? 0) + order.total);
    }

    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, methodRevenues]) => ({
        date,
        methods: Object.fromEntries(methodRevenues),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { methods, dailyBreakdown };
  },
});

export const getOrderHeatmap = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const orders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Build 7x24 heatmap (day 0=Sun, 1=Mon, ..., 6=Sat)
    const grid: { day: number; hour: number; count: number }[] = [];
    const countMap = new Map<string, number>();

    for (const order of orders) {
      const d = new Date(order._creationTime);
      const key = `${d.getDay()}-${d.getHours()}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    let peakHour = { day: 0, hour: 0, count: 0 };
    let quietHour = { day: 0, hour: 0, count: Infinity };

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = countMap.get(`${day}-${hour}`) ?? 0;
        grid.push({ day, hour, count });
        if (count > peakHour.count) peakHour = { day, hour, count };
        if (count < quietHour.count) quietHour = { day, hour, count };
      }
    }

    // Fix quietHour if no orders at all
    if (quietHour.count === Infinity) quietHour = { day: 0, hour: 0, count: 0 };

    return { heatmap: grid, peakHour, quietHour };
  },
});

export const getCustomerInsights = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const orders = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.gte(q.field("_creationTime"), cutoff),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Group by customerContact (lowercased + trimmed)
    const customerMap = new Map<string, {
      name: string;
      orderCount: number;
      totalSpent: number;
      lastOrderDate: number;
    }>();

    for (const order of orders) {
      const key = order.customerContact.toLowerCase().trim();
      const existing = customerMap.get(key);
      if (existing) {
        existing.orderCount += 1;
        existing.totalSpent += order.total;
        existing.lastOrderDate = Math.max(existing.lastOrderDate, order._creationTime);
      } else {
        customerMap.set(key, {
          name: order.customerName,
          orderCount: 1,
          totalSpent: order.total,
          lastOrderDate: order._creationTime,
        });
      }
    }

    const customers = Array.from(customerMap.values());
    const totalCustomers = customers.length;
    const returningCustomers = customers.filter((c) => c.orderCount > 1).length;
    const newCustomers = totalCustomers - returningCustomers;

    const topCustomers = customers
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map((c) => ({
        name: c.name,
        contact: "",  // omit contact for privacy in display
        orderCount: c.orderCount,
        totalSpent: c.totalSpent,
        lastOrderDate: c.lastOrderDate,
      }));

    return {
      totalCustomers,
      newCustomers,
      returningCustomers,
      returnRate: totalCustomers > 0 ? returningCustomers / totalCustomers : 0,
      avgOrdersPerCustomer: totalCustomers > 0 ? orders.length / totalCustomers : 0,
      avgRevenuePerCustomer: totalCustomers > 0
        ? orders.reduce((s, o) => s + o.total, 0) / totalCustomers
        : 0,
      topCustomers,
    };
  },
});
