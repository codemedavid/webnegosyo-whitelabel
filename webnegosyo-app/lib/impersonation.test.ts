import {
  canImpersonate,
  enterTenant,
  exitTenant,
  impersonatedTenantName,
  isImpersonating,
} from "./impersonation";

const SUPERADMIN_STATE = {
  userId: "user-super",
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
  convexUrl: null,
  isSuperadmin: true,
  isOwner: false,
  permissions: null,
  role: "superadmin",
  impersonatedTenantId: null,
};

const MERCHANT_STATE = {
  userId: "user-admin",
  tenantId: "tenant-1",
  tenantSlug: "coffee",
  tenantName: "Webnegosyo Coffee",
  convexUrl: "https://coffee.convex.cloud",
  isSuperadmin: false,
  isOwner: true,
  permissions: null,
  role: "admin",
  impersonatedTenantId: null,
};

const TARGET_TENANT = {
  id: "tenant-9",
  slug: "bakery",
  name: "Sunrise Bakery",
  convex_deployment_url: "https://bakery.convex.cloud",
};

describe("canImpersonate", () => {
  it("allows a superadmin to open a tenant", () => {
    expect(canImpersonate(SUPERADMIN_STATE)).toBe(true);
  });

  it("refuses a merchant admin — impersonation is superadmin-only", () => {
    expect(canImpersonate(MERCHANT_STATE)).toBe(false);
  });

  it("refuses a demo session", () => {
    expect(canImpersonate({ ...SUPERADMIN_STATE, isSuperadmin: false })).toBe(
      false
    );
  });
});

describe("enterTenant", () => {
  it("attaches the target tenant so merchant screens read it", () => {
    // Every merchant screen resolves its store from the auth store's tenant
    // fields, so filling them in IS the impersonation.
    const patch = enterTenant(SUPERADMIN_STATE, TARGET_TENANT);

    expect(patch).toMatchObject({
      tenantId: "tenant-9",
      tenantSlug: "bakery",
      tenantName: "Sunrise Bakery",
      convexUrl: "https://bakery.convex.cloud",
    });
  });

  it("keeps the superadmin flag set while impersonating", () => {
    // Losing this would strip the superadmin's cross-tenant RLS grant and
    // leave no way back to the platform surface.
    const patch = enterTenant(SUPERADMIN_STATE, TARGET_TENANT);

    expect(patch.isSuperadmin).toBe(true);
  });

  it("records which tenant is being impersonated", () => {
    const patch = enterTenant(SUPERADMIN_STATE, TARGET_TENANT);

    expect(patch.impersonatedTenantId).toBe("tenant-9");
  });

  it("grants full tenant access — a superadmin is never restricted staff", () => {
    const patch = enterTenant(SUPERADMIN_STATE, TARGET_TENANT);

    expect(patch.isOwner).toBe(true);
    expect(patch.permissions).toBeNull();
  });

  it("normalizes a tenant with no Convex deployment to null", () => {
    const patch = enterTenant(SUPERADMIN_STATE, {
      ...TARGET_TENANT,
      convex_deployment_url: null,
    });

    expect(patch.convexUrl).toBeNull();
  });

  it("preserves the superadmin's own identity", () => {
    const patch = enterTenant(SUPERADMIN_STATE, TARGET_TENANT);

    expect(patch.userId).toBe("user-super");
    expect(patch.role).toBe("superadmin");
  });

  it("throws when a non-superadmin attempts it", () => {
    expect(() => enterTenant(MERCHANT_STATE, TARGET_TENANT)).toThrow(
      /superadmin/i
    );
  });

  it("does not mutate the state it is given", () => {
    const state = { ...SUPERADMIN_STATE };

    enterTenant(state, TARGET_TENANT);

    expect(state).toEqual(SUPERADMIN_STATE);
  });

  it("switches directly between tenants without an intermediate exit", () => {
    const first = enterTenant(SUPERADMIN_STATE, TARGET_TENANT);
    const second = enterTenant({ ...SUPERADMIN_STATE, ...first }, {
      id: "tenant-3",
      slug: "grill",
      name: "Corner Grill",
      convex_deployment_url: null,
    });

    expect(second.tenantId).toBe("tenant-3");
    expect(second.impersonatedTenantId).toBe("tenant-3");
    expect(second.convexUrl).toBeNull();
  });
});

describe("exitTenant", () => {
  it("detaches the tenant so no merchant screen keeps reading it", () => {
    const patch = exitTenant(SUPERADMIN_STATE);

    expect(patch).toMatchObject({
      tenantId: null,
      tenantSlug: null,
      tenantName: null,
      convexUrl: null,
      impersonatedTenantId: null,
    });
  });

  it("keeps the superadmin signed in", () => {
    const patch = exitTenant(SUPERADMIN_STATE);

    expect(patch.isSuperadmin).toBe(true);
    expect(patch.userId).toBe("user-super");
    expect(patch.role).toBe("superadmin");
  });

  it("restores the exact superadmin state after a round trip", () => {
    // The round-trip invariant: entering and leaving a tenant must leave no
    // residue behind (a stale tenantId would silently scope the next query).
    const entered = { ...SUPERADMIN_STATE, ...enterTenant(SUPERADMIN_STATE, TARGET_TENANT) };

    const exited = { ...entered, ...exitTenant(entered) };

    expect(exited).toEqual(SUPERADMIN_STATE);
  });

  it("does not mutate the state it is given", () => {
    const state = { ...SUPERADMIN_STATE };

    exitTenant(state);

    expect(state).toEqual(SUPERADMIN_STATE);
  });
});

describe("isImpersonating", () => {
  it("is false for a superadmin on the platform surface", () => {
    expect(isImpersonating(SUPERADMIN_STATE)).toBe(false);
  });

  it("is true once a tenant is attached", () => {
    const entered = { ...SUPERADMIN_STATE, ...enterTenant(SUPERADMIN_STATE, TARGET_TENANT) };

    expect(isImpersonating(entered)).toBe(true);
  });

  it("is false for an ordinary merchant admin holding a tenant", () => {
    // A merchant is not impersonating — they own the tenant. The banner must
    // never appear for them.
    expect(isImpersonating(MERCHANT_STATE)).toBe(false);
  });

  it("is false again after exiting", () => {
    const entered = { ...SUPERADMIN_STATE, ...enterTenant(SUPERADMIN_STATE, TARGET_TENANT) };
    const exited = { ...entered, ...exitTenant(entered) };

    expect(isImpersonating(exited)).toBe(false);
  });
});

describe("impersonatedTenantName", () => {
  it("names the tenant for the banner", () => {
    const entered = { ...SUPERADMIN_STATE, ...enterTenant(SUPERADMIN_STATE, TARGET_TENANT) };

    expect(impersonatedTenantName(entered)).toBe("Sunrise Bakery");
  });

  it("returns null when not impersonating", () => {
    expect(impersonatedTenantName(SUPERADMIN_STATE)).toBeNull();
    expect(impersonatedTenantName(MERCHANT_STATE)).toBeNull();
  });

  it("falls back to the slug when the tenant has no name", () => {
    const entered = {
      ...SUPERADMIN_STATE,
      ...enterTenant(SUPERADMIN_STATE, { ...TARGET_TENANT, name: "" }),
    };

    expect(impersonatedTenantName(entered)).toBe("bakery");
  });
});
