import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getConfigs = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const results = [];
    for (const key of args.keys) {
      const config = await ctx.db
        .query("tenantConfig")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (config) results.push(config);
    }
    return results;
  },
});

/**
 * Internal on purpose. `tenantConfig` holds the Lalamove credentials and the
 * pickup point, and as a public mutation anyone with the deployment URL could
 * overwrite them. The web app's config sync reaches this with the deploy
 * key, which Convex admits to internal functions; nothing else can.
 */
export const upsertConfig = internalMutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tenantConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("tenantConfig", args);
    }
  },
});
