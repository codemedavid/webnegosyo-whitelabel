import { decideAccess, type AccessIdentity } from "./access";

/**
 * Who may call a merchant function on a store's Convex deployment.
 *
 * Every deployment used to accept every caller: knowing the URL was enough to
 * read all orders, rewrite any order, book a rider on the merchant's Lalamove
 * account, or subscribe to the store's push notifications. The URL is baked
 * into the customer app, so it is not a secret. The rule is pure so it can be
 * pinned here without a deployment.
 */

const TENANT = "11111111-1111-1111-1111-111111111111";
const merchant: AccessIdentity = { subject: "u1", wn_role: "admin", wn_tenant_id: TENANT };
const superadmin: AccessIdentity = { subject: "u2", wn_role: "superadmin", wn_tenant_id: null };
const stranger: AccessIdentity = { subject: "u3", wn_role: "admin", wn_tenant_id: "other" };

const enforced = { tenantId: TENANT, authEnforced: true, publicReads: false };

describe("decideAccess", () => {
  test("this store's admin may read and write", () => {
    expect(decideAccess({ ...enforced, identity: merchant, kind: "read" }).allowed).toBe(true);
    expect(decideAccess({ ...enforced, identity: merchant, kind: "write" }).allowed).toBe(true);
  });

  test("a superadmin may act on any store", () => {
    expect(decideAccess({ ...enforced, identity: superadmin, kind: "write" }).allowed).toBe(true);
  });

  test("another store's admin is refused", () => {
    // A valid platform login is not a licence to read a different store.
    const decision = decideAccess({ ...enforced, identity: stranger, kind: "read" });
    expect(decision).toEqual({ allowed: false, reason: "wrong_tenant" });
  });

  test("no identity is refused once enforced", () => {
    expect(decideAccess({ ...enforced, identity: null, kind: "read" })).toEqual({
      allowed: false,
      reason: "unauthenticated",
    });
  });

  test("a deployment with no tenant pinned refuses everyone but a superadmin", () => {
    // Fail closed: an un-synced deployment cannot know who its merchant is.
    const unpinned = { ...enforced, tenantId: null };
    expect(decideAccess({ ...unpinned, identity: merchant, kind: "read" }).allowed).toBe(false);
    expect(decideAccess({ ...unpinned, identity: superadmin, kind: "read" }).allowed).toBe(true);
  });

  test("the demo store allows anonymous reads but never writes", () => {
    // App Review walks the merchant app with no login; the demo store's
    // data is fabricated, its Lalamove account is not.
    const demo = { ...enforced, publicReads: true };
    expect(decideAccess({ ...demo, identity: null, kind: "read" }).allowed).toBe(true);
    expect(decideAccess({ ...demo, identity: null, kind: "write" })).toEqual({
      allowed: false,
      reason: "unauthenticated",
    });
  });

  test("until enforcement is switched on, callers pass as before", () => {
    // Rollout: the merchant app must ship its token before a store is flipped,
    // or every register in that store goes dark.
    const soft = { ...enforced, authEnforced: false };
    expect(decideAccess({ ...soft, identity: null, kind: "write" })).toEqual({
      allowed: true,
      reason: "not_enforced",
    });
  });

  test("a wrong-tenant identity is refused even before enforcement", () => {
    // Soft mode is for callers that carry no token yet — not a second door
    // for a caller who presented one that names a different store.
    const soft = { ...enforced, authEnforced: false };
    expect(decideAccess({ ...soft, identity: stranger, kind: "read" }).allowed).toBe(false);
  });
});
