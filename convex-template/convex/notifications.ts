import { v } from "convex/values";
import { mutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { recipientsForOutlet } from "./pushRecipients";

// Register a push token for a user (replaces any existing tokens for that user)
export const registerPushToken = mutation({
  args: {
    userId: v.string(),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    // Optional so an older app build, which does not send it, still registers.
    // Such a device is treated as store-wide — see `pushRecipients.ts`.
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Remove existing tokens for this user
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    // Insert new token
    const id = await ctx.db.insert("pushTokens", {
      userId: args.userId,
      token: args.token,
      platform: args.platform,
      outletId: args.outletId,
    });

    return id;
  },
});

// Remove all push tokens for a user
export const removePushToken = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
  },
});

// Internal query to get all push tokens (needed because internalAction cannot query DB directly)
export const getAllTokens = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pushTokens").collect();
  },
});

// Send push notification to all registered devices
export const sendOrderNotification = internalAction({
  args: {
    customerName: v.string(),
    total: v.number(),
    itemCount: v.number(),
    orderId: v.string(),
    // The branch the order was placed at, when it has one. Absent rings every
    // device, which is what a single-location store needs.
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const allTokens = await ctx.runQuery(internal.notifications.getAllTokens, {});

    // Ring only the branch that has to act on this order. A device cannot undo
    // a notification it already received, so this is the only place the
    // narrowing can happen.
    const tokens = recipientsForOutlet(allTokens, args.outletId);

    if (tokens.length === 0) {
      return;
    }

    const messages = tokens.map((doc) => ({
      to: doc.token,
      sound: "default" as const,
      // Route Android notifications to the high-importance "orders" channel so
      // they ring with the custom ringtone. Without this, Android delivers them
      // on the default channel and the ringtone never plays. Ignored on iOS.
      channelId: "orders",
      title: "New Order!",
      body: `${args.customerName} — ₱${args.total.toFixed(2)} (${args.itemCount} item${args.itemCount !== 1 ? "s" : ""})`,
      data: { orderId: args.orderId },
    }));

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
    } catch (error) {
      console.error("Failed to send push notification:", error);
    }
  },
});
