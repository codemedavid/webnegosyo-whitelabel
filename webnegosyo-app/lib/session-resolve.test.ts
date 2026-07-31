import {
  MERCHANT_LANDING_HREF,
  SUPERADMIN_LANDING_HREF,
  needsTenantLookup,
  resolveSession,
} from "./session-resolve";

const SUPERADMIN_ROW = {
  tenant_id: null,
  role: "superadmin",
  is_owner: false,
  permissions: null,
};

const ADMIN_ROW = {
  tenant_id: "tenant-1",
  role: "admin",
  is_owner: true,
  permissions: null,
};

const TENANT_ROW = {
  id: "tenant-1",
  slug: "coffee",
  name: "Webnegosyo Coffee",
  convex_deployment_url: "https://example.convex.cloud",
};

describe("needsTenantLookup", () => {
  it("skips the tenant lookup for a superadmin", () => {
    // The platform superadmin owns no tenant (app_users.tenant_id is NULL), so
    // querying tenants by that id would return nothing and strand the sign-in.
    expect(needsTenantLookup(SUPERADMIN_ROW)).toBe(false);
  });

  it("requires the tenant lookup for a merchant admin", () => {
    expect(needsTenantLookup(ADMIN_ROW)).toBe(true);
  });

  it("requires the tenant lookup for restricted staff", () => {
    expect(needsTenantLookup({ ...ADMIN_ROW, is_owner: false })).toBe(true);
  });
});

describe("resolveSession — superadmin", () => {
  it("signs a superadmin in even though they own no tenant", () => {
    // Arrange
    const userId = "user-super";

    // Act
    const result = resolveSession(userId, SUPERADMIN_ROW, null);

    // Assert — this is the regression guard: a null tenant must not deny.
    expect(result.mode).toBe("superadmin");
  });

  it("marks the session as superadmin with no tenant attached", () => {
    const result = resolveSession("user-super", SUPERADMIN_ROW, null);

    expect(result.auth).toMatchObject({
      userId: "user-super",
      isSuperadmin: true,
      isAuthenticated: true,
      isLoading: false,
      tenantId: null,
      tenantSlug: null,
      tenantName: null,
      convexUrl: null,
      role: "superadmin",
    });
  });

  it("lands a superadmin on the superadmin surface, not the merchant dashboard", () => {
    const result = resolveSession("user-super", SUPERADMIN_ROW, null);

    expect(result.landingHref).toBe(SUPERADMIN_LANDING_HREF);
    expect(result.landingHref).not.toBe(MERCHANT_LANDING_HREF);
  });

  it("ignores a stray tenant row for a superadmin", () => {
    const result = resolveSession("user-super", SUPERADMIN_ROW, TENANT_ROW);

    expect(result.mode).toBe("superadmin");
    expect(result.auth?.tenantId).toBeNull();
  });
});

describe("resolveSession — merchant", () => {
  it("keeps the existing merchant sign-in working", () => {
    const result = resolveSession("user-admin", ADMIN_ROW, TENANT_ROW);

    expect(result.mode).toBe("merchant");
    expect(result.landingHref).toBe(MERCHANT_LANDING_HREF);
  });

  it("attaches the tenant identity the merchant screens read", () => {
    const result = resolveSession("user-admin", ADMIN_ROW, TENANT_ROW);

    expect(result.auth).toMatchObject({
      userId: "user-admin",
      tenantId: "tenant-1",
      tenantSlug: "coffee",
      tenantName: "Webnegosyo Coffee",
      convexUrl: "https://example.convex.cloud",
      isSuperadmin: false,
      isOwner: true,
      role: "admin",
    });
  });

  it("normalizes a missing Convex deployment url to null", () => {
    const result = resolveSession("user-admin", ADMIN_ROW, {
      ...TENANT_ROW,
      convex_deployment_url: null,
    });

    expect(result.auth?.convexUrl).toBeNull();
  });

  it("resolves the order backend a Convex-backed tenant reads from", () => {
    // Screens dispatch on this to pick the Convex client or the Supabase
    // adapter; without it a platform tenant renders "Convex not configured".
    const result = resolveSession("user-admin", ADMIN_ROW, TENANT_ROW);

    expect(result.auth?.orderBackend).toBe("convex");
  });

  it("resolves a tenant with no Convex deployment to the platform backend", () => {
    const result = resolveSession("user-admin", ADMIN_ROW, {
      ...TENANT_ROW,
      convex_deployment_url: null,
    });

    expect(result.auth?.orderBackend).toBe("platform");
    expect(result.auth?.convexUrl).toBeNull();
  });

  it("honours an explicit order_backend column over the Convex url", () => {
    const result = resolveSession("user-admin", ADMIN_ROW, {
      ...TENANT_ROW,
      order_backend: "platform",
    });

    expect(result.auth?.orderBackend).toBe("platform");
  });

  it("carries staff permissions through untouched", () => {
    const result = resolveSession(
      "user-staff",
      { ...ADMIN_ROW, is_owner: false, permissions: ["orders", "pos"] },
      TENANT_ROW
    );

    expect(result.auth?.isOwner).toBe(false);
    expect(result.auth?.permissions).toEqual(["orders", "pos"]);
  });

  it("defaults a null is_owner to false rather than undefined", () => {
    const result = resolveSession(
      "user-admin",
      { ...ADMIN_ROW, is_owner: null },
      TENANT_ROW
    );

    expect(result.auth?.isOwner).toBe(false);
  });
});

describe("resolveSession — superadmin order backend", () => {
  it("leaves a superadmin without an order backend until they impersonate", () => {
    // A superadmin holds no tenant, so there is no order data to route to.
    // Impersonation fills this in; see lib/impersonation.ts.
    const result = resolveSession("user-super", SUPERADMIN_ROW, null);

    expect(result.auth?.orderBackend).toBeNull();
  });
});

describe("resolveSession — denial", () => {
  it("denies a user with no app_users row", () => {
    const result = resolveSession("user-nobody", null, null);

    expect(result.mode).toBe("denied");
    expect(result.reason).toBe("You do not have admin access");
  });

  it("denies a role outside admin and superadmin", () => {
    const result = resolveSession(
      "user-customer",
      { ...ADMIN_ROW, role: "customer" },
      TENANT_ROW
    );

    expect(result.mode).toBe("denied");
    expect(result.reason).toBe("You do not have admin access");
  });

  it("denies a merchant admin whose tenant is missing", () => {
    const result = resolveSession("user-admin", ADMIN_ROW, null);

    expect(result.mode).toBe("denied");
    expect(result.reason).toBe("Tenant not found");
  });

  it("never returns an auth patch on denial", () => {
    expect(resolveSession("user-nobody", null, null).auth).toBeUndefined();
    expect(resolveSession("user-admin", ADMIN_ROW, null).auth).toBeUndefined();
  });
});

describe("resolveSession — immutability", () => {
  it("does not mutate the rows it is given", () => {
    const appUser = { ...ADMIN_ROW };
    const tenant = { ...TENANT_ROW };

    resolveSession("user-admin", appUser, tenant);

    expect(appUser).toEqual(ADMIN_ROW);
    expect(tenant).toEqual(TENANT_ROW);
  });
});

describe("the Convex bundle a tenant is running", () => {
  const ADMIN_ROW = { tenant_id: "t1", role: "admin", is_owner: true } as never;

  it("carries the deployment's schema version into the session", () => {
    // Without it the app cannot tell whether this deployment understands a
    // branch-narrowed stats query, and must withhold a branch manager's food
    // cost forever.
    const result = resolveSession("u1", ADMIN_ROW, {
      id: "t1",
      slug: "acme",
      name: "Acme",
      convex_deployment_url: "https://x.convex.cloud",
      convex_schema_version: 18,
    } as never);

    expect(result.auth).toMatchObject({ convexSchemaVersion: 18 });
  });

  it("reads an absent version as unknown rather than as zero-and-fine", () => {
    const result = resolveSession("u1", ADMIN_ROW, {
      id: "t1",
      slug: "acme",
      name: "Acme",
      convex_deployment_url: null,
    } as never);

    expect(result.auth).toMatchObject({ convexSchemaVersion: null });
  });
});
