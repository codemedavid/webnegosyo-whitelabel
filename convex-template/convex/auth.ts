/**
 * Merchant-function gate.
 *
 * Call `requireAccess(ctx, kind)` first thing in any public query or mutation;
 * actions call `requireActionAccess`, which runs the same check inside a query
 * because actions have no `ctx.db`. Every public function that reads or changes
 * a store's orders goes through here, `createOrder` included: until a store's
 * `auth_enforced` flag is on, the gate still admits a caller with no token.
 *
 * Customers never reach this deployment directly. Web checkout, QR tracking and
 * receipt-contact capture run on the web server, which is where their boundary
 * (the order token) lives, and it uses the `*Internal` variants over the deploy
 * key, which Convex only admits with admin credentials.
 */

import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { decideAccess, type AccessIdentity, type AccessKind } from "./access";
import {
  ACCESS_AUDIT_DEFAULT_DAYS,
  ACCESS_AUDIT_MAX_ROWS,
  ACCESS_AUDIT_PRUNE_BATCH,
  auditDayKey,
  auditRetentionCutoff,
  bumpedAuditCounts,
  firstAuditDayOf,
} from "./accessAudit";

const ACCESS_KEYS = ["tenant_id", "auth_enforced", "public_reads"] as const;

async function readAccessConfig(ctx: QueryCtx | MutationCtx) {
  const values = new Map<string, string>();
  for (const key of ACCESS_KEYS) {
    const row = await ctx.db
      .query("tenantConfig")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (row) values.set(key, row.value);
  }
  return {
    tenantId: values.get("tenant_id") || null,
    authEnforced: values.get("auth_enforced") === "true",
    publicReads: values.get("public_reads") === "true",
  };
}

async function readIdentity(ctx: QueryCtx | MutationCtx): Promise<AccessIdentity | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  // Custom claims ride on the identity object under their JWT names.
  const claims = identity as unknown as Record<string, unknown>;
  return {
    subject: identity.subject,
    wn_role: typeof claims.wn_role === "string" ? claims.wn_role : null,
    wn_tenant_id: typeof claims.wn_tenant_id === "string" ? claims.wn_tenant_id : null,
  };
}

/**
 * Throws a ConvexError, not an Error: a production deployment redacts a plain
 * Error to "Server Error" on its way to the client, and the register has to
 * tell "no token yet" (retry) from a sale that is really wrong.
 */
async function assertAccess(ctx: QueryCtx | MutationCtx, kind: AccessKind): Promise<AccessIdentity | null> {
  const [config, identity] = await Promise.all([readAccessConfig(ctx), readIdentity(ctx)]);
  const decision = decideAccess({ ...config, identity, kind });
  if (!decision.allowed) {
    throw new ConvexError(`Unauthorized: ${decision.reason}`);
  }
  return identity;
}

/**
 * Counted on the scheduler rather than in this transaction: a counter row every
 * write touches would make concurrent order writes conflict, and a conflict
 * that outlasts Convex's retries fails the order. Scheduling reads nothing, so
 * it can't conflict, and a thrown refusal rolls it back, so the counts cover
 * admitted writes only.
 */
async function countWrite(ctx: QueryCtx | MutationCtx, fn: string, hasToken: boolean): Promise<void> {
  if (!("scheduler" in ctx)) return;
  try {
    await (ctx as MutationCtx).scheduler.runAfter(0, internal.auth.recordAccessAudit, { fn, hasToken });
  } catch (error) {
    console.warn("[access-audit] could not count a write", fn, error);
  }
}

export async function requireAccess(ctx: QueryCtx | MutationCtx, kind: "read"): Promise<void>;
export async function requireAccess(ctx: MutationCtx, kind: "write", fn: string): Promise<void>;
export async function requireAccess(
  ctx: QueryCtx | MutationCtx,
  kind: AccessKind,
  fn?: string
): Promise<void> {
  const identity = await assertAccess(ctx, kind);
  if (kind === "write" && fn) await countWrite(ctx, fn, identity !== null);
}

/** The same check, reachable from an action via `ctx.runQuery`. Never counts. */
export const check = internalQuery({
  args: { kind: v.union(v.literal("read"), v.literal("write")) },
  handler: async (ctx, args) => {
    await assertAccess(ctx, args.kind);
    return true;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requireActionAccess(ctx: any, kind: AccessKind): Promise<void> {
  await ctx.runQuery(internal.auth.check, { kind });
}

/** One admitted write. A new day's first row also clears what has aged out. */
export const recordAccessAudit = internalMutation({
  args: { fn: v.string(), hasToken: v.boolean() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const day = auditDayKey(now);
    const row = await ctx.db
      .query("accessAudit")
      .withIndex("by_day_fn", (q) => q.eq("day", day).eq("fn", args.fn))
      .first();
    if (row) {
      await ctx.db.patch(row._id, bumpedAuditCounts(row, args.hasToken));
      return;
    }

    await ctx.db.insert("accessAudit", { day, fn: args.fn, ...bumpedAuditCounts(null, args.hasToken) });
    const aged = await ctx.db
      .query("accessAudit")
      .withIndex("by_day_fn", (q) => q.lt("day", auditRetentionCutoff(now)))
      .take(ACCESS_AUDIT_PRUNE_BATCH);
    for (const old of aged) await ctx.db.delete(old._id);
  },
});

/** Counts per day and function for the operator's `convex-enforcement audit`. */
export const getAccessAudit = internalQuery({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const since = firstAuditDayOf(Date.now(), args.days ?? ACCESS_AUDIT_DEFAULT_DAYS);
    const rows = await ctx.db
      .query("accessAudit")
      .withIndex("by_day_fn", (q) => q.gte("day", since))
      .take(ACCESS_AUDIT_MAX_ROWS);
    return rows.map(({ day, fn, tokenless, withToken }) => ({ day, fn, tokenless, withToken }));
  },
});
