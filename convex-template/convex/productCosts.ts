import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const setCost = mutation({
  args: {
    menuItemId: v.string(),
    costPrice: v.number(),
    costNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productCosts")
      .withIndex("by_item", (q) => q.eq("menuItemId", args.menuItemId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        costPrice: args.costPrice,
        costNotes: args.costNotes,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("productCosts", {
        menuItemId: args.menuItemId,
        costPrice: args.costPrice,
        costNotes: args.costNotes,
        updatedAt: now,
        createdAt: now,
      });
    }
  },
});

export const getCost = query({
  args: {
    menuItemId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productCosts")
      .withIndex("by_item", (q) => q.eq("menuItemId", args.menuItemId))
      .first();
  },
});

export const getAllCosts = query({
  handler: async (ctx) => {
    return await ctx.db.query("productCosts").collect();
  },
});
