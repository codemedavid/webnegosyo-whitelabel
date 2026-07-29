import { resolveSession, needsOutletLookup, type AppUserRow } from "./session-resolve";

/**
 * The branch a signed-in account belongs to, carried on the session.
 *
 * Two screens need it: the order lists, to show only this branch's work, and
 * the register, to stamp the branch onto a counter sale. Both read it off the
 * auth store, so it has to be resolved once here — the same reason this module
 * exists at all.
 *
 * The name matters as much as the id: the register writes a snapshot of it
 * onto the order, so a ticket keeps the name the branch had when it was rung.
 */

const TENANT = {
  id: "tenant-1",
  slug: "demo",
  name: "Demo Store",
  convex_deployment_url: null,
  order_backend: "platform" as const,
};

const OUTLET = { id: "outlet-north", name: "North Branch" };

function appUser(overrides: Partial<AppUserRow> = {}): AppUserRow {
  return {
    tenant_id: "tenant-1",
    role: "admin",
    is_owner: false,
    permissions: ["orders"],
    outlet_id: null,
    ...overrides,
  };
}

describe("needsOutletLookup", () => {
  it("is false for an account with no branch", () => {
    expect(needsOutletLookup(appUser())).toBe(false);
  });

  it("is true for a branch-scoped account", () => {
    expect(needsOutletLookup(appUser({ outlet_id: "outlet-north" }))).toBe(true);
  });

  it("is false for an owner, who is never confined to a branch", () => {
    expect(needsOutletLookup(appUser({ is_owner: true, outlet_id: null }))).toBe(false);
  });
});

describe("resolveSession with a branch", () => {
  it("carries the branch id and name onto the session", () => {
    const result = resolveSession("user-1", appUser({ outlet_id: "outlet-north" }), TENANT, OUTLET);

    expect(result.auth?.outletId).toBe("outlet-north");
    expect(result.auth?.outletName).toBe("North Branch");
  });

  it("leaves the branch empty for a store-wide account", () => {
    const result = resolveSession("user-1", appUser(), TENANT);

    expect(result.auth?.outletId).toBeNull();
    expect(result.auth?.outletName).toBeNull();
  });

  it("still grants the session when the branch row cannot be read", () => {
    // A missing branch must not lock the account out; it degrades to the
    // store-wide view the account had before branches existed.
    const result = resolveSession("user-1", appUser({ outlet_id: "outlet-gone" }), TENANT, null);

    expect(result.mode).toBe("merchant");
    expect(result.auth?.outletId).toBeNull();
  });

  it("leaves a superadmin unscoped", () => {
    const result = resolveSession("user-1", appUser({ role: "superadmin", tenant_id: null }), null);

    expect(result.mode).toBe("superadmin");
    expect(result.auth?.outletId).toBeNull();
  });
});
