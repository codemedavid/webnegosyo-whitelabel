import { internalQuery, type QueryCtx } from "./_generated/server";
import { BUSINESS_DAY_CUTOFFS_CONFIG_KEY, parseCutoffConfig, type CutoffChange } from "./time";

/** The store's business-day schedule, from the tenantConfig row the web app syncs. */
export async function readCutoffSchedule(ctx: Pick<QueryCtx, "db">): Promise<CutoffChange[]> {
  const [row] = await ctx.db
    .query("tenantConfig")
    .withIndex("by_key", (q) => q.eq("key", BUSINESS_DAY_CUTOFFS_CONFIG_KEY))
    .take(1);
  return parseCutoffConfig(row?.value);
}

/** For actions (the daily snapshot), which cannot read the database directly. */
export const getCutoffScheduleInternal = internalQuery({
  args: {},
  handler: async (ctx) => readCutoffSchedule(ctx),
});
