/**
 * The access rule for merchant functions, kept free of Convex imports so it
 * can be unit-tested (see access.test.ts). `auth.ts` feeds it the identity
 * and config rows and turns a refusal into a thrown error.
 *
 * Identity comes from the platform Supabase JWT: the access-token hook stamps
 * `wn_role` and `wn_tenant_id` from `app_users` onto every token, and the
 * deployment's `tenant_id` config row says which store this is.
 */

export interface AccessIdentity {
  subject: string;
  wn_role?: string | null;
  wn_tenant_id?: string | null;
}

export type AccessKind = "read" | "write";

export interface AccessInput {
  identity: AccessIdentity | null;
  /** The store this deployment belongs to; null when never synced. */
  tenantId: string | null;
  /** Rollout switch — until true, token-less callers are still admitted. */
  authEnforced: boolean;
  /** Demo store: anonymous reads are fine, writes never are. */
  publicReads: boolean;
  kind: AccessKind;
}

export type AccessDecision =
  | { allowed: true; reason: "superadmin" | "tenant_admin" | "public_read" | "not_enforced" }
  | { allowed: false; reason: "unauthenticated" | "wrong_tenant" | "unpinned" };

export function decideAccess(input: AccessInput): AccessDecision {
  const { identity, tenantId, authEnforced, publicReads, kind } = input;

  if (identity?.wn_role === "superadmin") {
    return { allowed: true, reason: "superadmin" };
  }

  // A token identifies a store only when it NAMES one. The claims are stamped
  // by the platform's access-token hook, and a token can arrive without them —
  // a customer account with no `app_users` row, or a hook whose read of that
  // table was blocked. Treating such a token as "an identity for some other
  // store" is what refused every merchant device in the fleet as
  // `wrong_tenant`, in soft mode, where nothing was meant to be refused yet.
  const claimedTenant = identity?.wn_tenant_id || null;

  if (claimedTenant) {
    if (claimedTenant === tenantId) return { allowed: true, reason: "tenant_admin" };
    // A token that names a DIFFERENT store is refused in every mode: soft mode
    // exists for callers with no token, not for the wrong one.
    if (tenantId) return { allowed: false, reason: "wrong_tenant" };
    // This deployment has never been told which store it is. Fail closed once
    // the store is enforced; before that, a missing config sync must not take
    // the store's registers down.
    if (authEnforced) return { allowed: false, reason: "unpinned" };
  }

  // Everything below is the unidentified caller's path — no token, or one that
  // claims no store.
  if (!authEnforced) return { allowed: true, reason: "not_enforced" };
  if (publicReads && kind === "read") return { allowed: true, reason: "public_read" };
  return { allowed: false, reason: "unauthenticated" };
}
