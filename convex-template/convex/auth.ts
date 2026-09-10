/**
 * Merchant-function gate.
 *
 * Call `requireAccess(ctx, kind)` first thing in any query or mutation a
 * merchant device uses; actions call `requireActionAccess`, which runs the
 * same check inside a query because actions have no `ctx.db`. Customer paths
 * (createOrder, updateCustomerContact, getOrderByClientId, trackEvent) do
 * not call this — their boundary is the order token on the web side.
 *
 * Server-side callers on the web app never go through here: they use the
 * `*Internal` variants over the deploy key, which Convex only admits with
 * admin credentials.
 */

import { v } from "convex/values";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { decideAccess, type AccessIdentity, type AccessKind } from "./access";

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

export async function requireAccess(ctx: QueryCtx | MutationCtx, kind: AccessKind): Promise<void> {
  const [config, identity] = await Promise.all([readAccessConfig(ctx), readIdentity(ctx)]);
  const decision = decideAccess({ ...config, identity, kind });
  if (!decision.allowed) {
    throw new Error(`Unauthorized: ${decision.reason}`);
  }
}

/** The same check, reachable from an action via `ctx.runQuery`. */
export const check = internalQuery({
  args: { kind: v.union(v.literal("read"), v.literal("write")) },
  handler: async (ctx, args) => {
    await requireAccess(ctx, args.kind);
    return true;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requireActionAccess(ctx: any, kind: AccessKind): Promise<void> {
  await ctx.runQuery(internal.auth.check, { kind });
}
