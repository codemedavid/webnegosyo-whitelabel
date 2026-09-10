import { v } from "convex/values";
import { mutation, query, internalQuery, type QueryCtx } from "./_generated/server";
import { requireAccess } from "./auth";

export const setCost = mutation({
  args: {
    menuItemId: v.string(),
    costPrice: v.number(),
    costNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
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
    await requireAccess(ctx, "read");
    return await ctx.db
      .query("productCosts")
      .withIndex("by_item", (q) => q.eq("menuItemId", args.menuItemId))
      .first();
  },
});

async function getAllCostsHandler(ctx: QueryCtx) {
    return await ctx.db.query("productCosts").collect();
}

export const getAllCosts = query({
  handler: async (ctx) => {
    await requireAccess(ctx, "read");
    return getAllCostsHandler(ctx);
  },
});

export const getAllCostsInternal = internalQuery({ handler: getAllCostsHandler });
