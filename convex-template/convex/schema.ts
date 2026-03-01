import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  orders: defineTable({
    customerName: v.string(),
    customerContact: v.string(),
    customerData: v.optional(v.any()),
    total: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    orderType: v.optional(v.string()),
    orderTypeId: v.optional(v.string()),
    source: v.union(v.literal("web"), v.literal("mobile")),
    itemCount: v.number(),
    paymentMethod: v.optional(v.string()),
    paymentMethodDetails: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    deliveryAddress: v.optional(v.string()),
    deliveryLatitude: v.optional(v.number()),
    deliveryLongitude: v.optional(v.number()),
    lalamoveQuotationId: v.optional(v.string()),
    lalamoveOrderId: v.optional(v.string()),
    lalamoveStatus: v.optional(v.string()),
    lalamoveDriverName: v.optional(v.string()),
    lalamoveDriverPhone: v.optional(v.string()),
    lalamoveTrackingUrl: v.optional(v.string()),
    hasUpsellItems: v.optional(v.boolean()),
    hasBundleItems: v.optional(v.boolean()),
  })
    .index("by_status", ["status"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
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
  }).index("by_order", ["orderId"]),

  analyticsEvents: defineTable({
    type: v.string(),
    metadata: v.optional(v.any()),
    sessionId: v.optional(v.string()),
  })
    .index("by_type", ["type"]),

  dailyStats: defineTable({
    date: v.string(),
    totalOrders: v.number(),
    totalRevenue: v.number(),
    avgOrderValue: v.number(),
    upsellConversionRate: v.optional(v.number()),
    topItems: v.optional(
      v.array(
        v.object({
          itemId: v.string(),
          name: v.string(),
          count: v.number(),
          revenue: v.number(),
        })
      )
    ),
  }).index("by_date", ["date"]),

  tenantConfig: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
